/**
 * Recurring Visit Pattern Engine & Generator Service
 *
 * Expands recurring service patterns into concrete visits up to N days
 * into the future (rolling horizon).
 *
 * Complies with Home Healthcare Regulations:
 * - Handles US Federal Holidays (skip or flag)
 * - Caregiver Time-Off exceptions (visit preserved for client, marked unassigned for coordinator action)
 * - Client Hospital Holds (inpatient stay suppresses home care visits per 42 CFR § 484)
 * - Strict multi-tenant data isolation via organizationId
 */

import { randomBytes } from 'node:crypto';
import type { Pool } from 'pg';
import {
  type UUID,
  type UserContext,
  ValidationError,
  NotFoundError,
} from '@folkcare/core';
import type {
  VisitPattern,
  CreateVisitPatternInput,
  UpdateVisitPatternInput,
  CaregiverTimeOffException,
  ClientHospitalHoldException,
  PatternGenerationException,
  PatternGenerationResult,
} from '../types/visit-pattern.js';
import type { Visit, DayOfWeek, VisitAddress } from '../types/schedule.js';
import { VisitPatternRepository } from '../repository/visit-pattern-repository.js';
import { isFederalHoliday } from '../utils/holiday-calendar.js';

export interface GenerateVisitsOptions {
  horizonDays?: number; // Rolling horizon in days (default 60)
  referenceDate?: Date; // Fixed base date for deterministic generation & testing
  skipHolidays?: boolean; // Default true
  caregiverTimeOffExceptions?: CaregiverTimeOffException[];
  clientHospitalHolds?: ClientHospitalHoldException[];
  defaultAddress?: VisitAddress;
}

export class RecurringVisitPatternEngine {
  private repository: VisitPatternRepository;

  constructor(private pool: Pool) {
    this.repository = new VisitPatternRepository(pool);
  }

  /**
   * Create recurring visit pattern and generate concrete visits for horizon
   */
  async createPatternAndGenerateVisits(
    input: CreateVisitPatternInput,
    context: UserContext,
    options: GenerateVisitsOptions = {}
  ): Promise<PatternGenerationResult> {
    this.validatePatternInput(input);

    // Normalize frequency and day_of_week from rrule if needed
    const normalizedInput = this.normalizeRecurrence(input);

    // 1. Create the pattern in database
    const pattern = await this.repository.createPattern(normalizedInput, context);

    // 2. Generate concrete visits for rolling horizon
    const horizonDays = input.horizonDays ?? options.horizonDays ?? 60;
    const result = await this.generateConcreteVisits(pattern, {
      ...options,
      horizonDays,
      skipHolidays: input.skipHolidays ?? options.skipHolidays ?? pattern.skipHolidays ?? true,
      caregiverTimeOffExceptions: input.caregiverTimeOffExceptions ?? options.caregiverTimeOffExceptions ?? [],
      clientHospitalHolds: input.clientHospitalHolds ?? options.clientHospitalHolds ?? [],
    }, context);

    return {
      pattern,
      generatedVisitsCount: result.visits.length,
      visits: result.visits,
      exceptions: result.exceptions,
    };
  }

  /**
   * Get pattern details along with its concrete generated visits
   */
  async getPatternWithVisits(
    patternId: UUID,
    organizationId: UUID
  ): Promise<{ pattern: VisitPattern; visits: Visit[] }> {
    const pattern = await this.repository.getPatternById(patternId, organizationId);
    if (!pattern) {
      throw new NotFoundError('Visit pattern not found or access denied', { patternId });
    }

    const visits = await this.repository.getVisitsByPatternId(patternId, organizationId);

    return { pattern, visits };
  }

  /**
   * Update future instances of a pattern
   * Supports:
   * - Update this visit only (updateMode: 'THIS_VISIT')
   * - Update all future visits (updateMode: 'ALL_FUTURE')
   */
  async updatePatternInstances(
    patternId: UUID,
    input: UpdateVisitPatternInput,
    context: UserContext
  ): Promise<{
    pattern: VisitPattern;
    updatedVisitsCount: number;
    mode: 'THIS_VISIT' | 'ALL_FUTURE';
    singleVisit?: Visit;
  }> {
    const pattern = await this.repository.getPatternById(patternId, context.organizationId!);
    if (!pattern) {
      throw new NotFoundError('Visit pattern not found or access denied', { patternId });
    }

    if (input.updateMode === 'THIS_VISIT') {
      if (!input.targetVisitId) {
        throw new ValidationError('targetVisitId is required when updateMode is THIS_VISIT');
      }

      const singleVisit = await this.repository.updateSingleVisit(
        input.targetVisitId,
        context.organizationId!,
        {
          startTime: input.updates?.startTime,
          duration: input.updates?.duration,
          caregiverId: input.updates?.caregiverId,
          scheduledDate: input.updates?.scheduledDate,
          notes: input.updates?.notes,
        },
        context
      );

      return {
        pattern,
        updatedVisitsCount: 1,
        mode: 'THIS_VISIT',
        singleVisit,
      };
    }

    // ALL_FUTURE mode: Update pattern definition and all future visits
    const updatedPattern = await this.repository.updatePattern(
      patternId,
      context.organizationId!,
      {
        startTime: input.updates?.startTime,
        duration: input.updates?.duration,
        caregiverId: input.updates?.caregiverId ?? undefined,
        status: input.updates?.status,
        notes: input.updates?.notes,
        dayOfWeek: input.updates?.dayOfWeek,
      },
      context
    );

    const fromDate = input.fromDate ?? this.formatDateOnly(new Date());

    const updatedVisitsCount = await this.repository.updateFutureVisitsForPattern(
      patternId,
      context.organizationId!,
      fromDate,
      {
        startTime: input.updates?.startTime,
        duration: input.updates?.duration,
        caregiverId: input.updates?.caregiverId,
        notes: input.updates?.notes,
      },
      context
    );

    return {
      pattern: updatedPattern,
      updatedVisitsCount,
      mode: 'ALL_FUTURE',
    };
  }

  /**
   * Generates concrete visits up to rolling horizon
   */
  async generateConcreteVisits(
    pattern: VisitPattern,
    options: GenerateVisitsOptions,
    context: UserContext
  ): Promise<{ visits: Visit[]; exceptions: PatternGenerationException[] }> {
    const horizonDays = options.horizonDays ?? 60;
    const baseDate = options.referenceDate ?? new Date(pattern.startDate);

    // Calculate start and end date of horizon
    const horizonStartDate = new Date(pattern.startDate);
    const calculatedEndDate = new Date(baseDate);
    calculatedEndDate.setUTCDate(calculatedEndDate.getUTCDate() + horizonDays);

    // If pattern has an end date, do not exceed it
    const horizonEndDate = pattern.endDate && pattern.endDate < calculatedEndDate
      ? new Date(pattern.endDate)
      : calculatedEndDate;

    const candidateDates = this.expandPatternDates(
      pattern,
      horizonStartDate,
      horizonEndDate
    );

    const visitsToCreate: Array<{
      scheduledDate: string;
      assignedCaregiverId?: UUID | null;
      status: 'ASSIGNED' | 'UNASSIGNED';
      notes?: string;
    }> = [];

    const exceptions: PatternGenerationException[] = [];

    for (const dateObj of candidateDates) {
      const dateStr = this.formatDateOnly(dateObj);

      // 1. Holiday Check
      if (options.skipHolidays !== false && isFederalHoliday(dateObj)) {
        exceptions.push({
          date: dateStr,
          type: 'HOLIDAY',
          reason: 'Skipped due to US Federal Holiday',
        });
        continue; // Skip holiday visit
      }

      // 2. Client Hospital Hold Check
      const activeHold = options.clientHospitalHolds?.find((hold) => {
        if (hold.clientId !== pattern.clientId) return false;
        const holdStart = this.formatDateOnly(new Date(hold.startDate));
        const holdEnd = this.formatDateOnly(new Date(hold.endDate));
        return dateStr >= holdStart && dateStr <= holdEnd;
      });

      if (activeHold) {
        exceptions.push({
          date: dateStr,
          type: 'HOSPITAL_HOLD',
          reason: activeHold.reason ?? 'Client hospitalized (inpatient stay)',
          clientId: pattern.clientId,
        });
        continue; // Inpatient hospitalization suppresses home care visit
      }

      // 3. Caregiver Time-Off Exception Check
      let assignedCaregiverId = pattern.caregiverId;
      let visitStatus: 'ASSIGNED' | 'UNASSIGNED' = assignedCaregiverId ? 'ASSIGNED' : 'UNASSIGNED';
      let visitNotes = pattern.notes;

      if (pattern.caregiverId && options.caregiverTimeOffExceptions) {
        const activeTimeOff = options.caregiverTimeOffExceptions.find((pto) => {
          if (pto.caregiverId !== pattern.caregiverId) return false;
          const ptoStart = this.formatDateOnly(new Date(pto.startDate));
          const ptoEnd = this.formatDateOnly(new Date(pto.endDate));
          return dateStr >= ptoStart && dateStr <= ptoEnd;
        });

        if (activeTimeOff) {
          // Client care must NOT be dropped; generate visit as UNASSIGNED for coordinator
          assignedCaregiverId = undefined;
          visitStatus = 'UNASSIGNED';
          visitNotes = `${pattern.notes ? pattern.notes + ' | ' : ''}Caregiver on approved time-off (${activeTimeOff.reason ?? 'PTO'}). Requires reassignment.`;
          exceptions.push({
            date: dateStr,
            type: 'CAREGIVER_TIME_OFF',
            reason: activeTimeOff.reason ?? 'Approved caregiver leave',
            caregiverId: pattern.caregiverId,
          });
        }
      }

      visitsToCreate.push({
        scheduledDate: dateStr,
        assignedCaregiverId,
        status: visitStatus,
        notes: visitNotes,
      });
    }

    // Persist concrete visits in the database
    const createdVisits: Visit[] = [];
    for (const item of visitsToCreate) {
      const visit = await this.insertConcreteVisit(
        pattern,
        item.scheduledDate,
        item.assignedCaregiverId,
        item.status,
        item.notes,
        options.defaultAddress,
        context
      );
      createdVisits.push(visit);
    }

    return { visits: createdVisits, exceptions };
  }

  /**
   * Insert a concrete visit row
   */
  private async insertConcreteVisit(
    pattern: VisitPattern,
    scheduledDate: string,
    caregiverId: UUID | undefined | null,
    status: 'ASSIGNED' | 'UNASSIGNED',
    notes: string | undefined,
    defaultAddress: VisitAddress | undefined,
    context: UserContext
  ): Promise<Visit> {
    const endTime = this.calculateEndTime(pattern.startTime, pattern.duration);
    const visitNumber = this.generateVisitNumber(scheduledDate);
    const address = defaultAddress ?? {
      line1: '123 Main St',
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
      country: 'USA',
    };

    const query = `
      INSERT INTO visits (
        id, organization_id, branch_id, client_id, pattern_id,
        visit_number, visit_type, service_type_id, service_type_name,
        scheduled_date, scheduled_start_time, scheduled_end_time,
        scheduled_duration, timezone, assigned_caregiver_id,
        status, address, client_instructions, caregiver_instructions,
        internal_notes, assignment_method, created_at, created_by,
        updated_at, updated_by, version
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4,
        $5, 'REGULAR', $6, $7,
        $8, $9, $10,
        $11, 'America/Chicago', $12,
        $13, $14, $15, $16,
        $17, $18, NOW(), $19,
        NOW(), $19, 1
      )
      RETURNING *
    `;

    const values = [
      pattern.organizationId,
      pattern.branchId ?? null,
      pattern.clientId,
      pattern.id,
      visitNumber,
      pattern.serviceTypeId,
      pattern.serviceTypeName ?? 'Personal Care',
      scheduledDate,
      pattern.startTime,
      endTime,
      pattern.duration,
      caregiverId ?? null,
      status,
      JSON.stringify(address),
      pattern.clientInstructions ?? null,
      pattern.caregiverInstructions ?? null,
      notes ?? null,
      caregiverId ? 'MANUAL' : 'AUTO_MATCH',
      context.userId,
    ];

    const result = await this.pool.query(query, values);
    const row = result.rows[0];

    return {
      id: row.id,
      organizationId: row.organization_id,
      branchId: row.branch_id,
      clientId: row.client_id,
      patternId: row.pattern_id,
      visitNumber: row.visit_number,
      visitType: row.visit_type,
      serviceTypeId: row.service_type_id,
      serviceTypeName: row.service_type_name,
      scheduledDate: new Date(row.scheduled_date),
      scheduledStartTime: row.scheduled_start_time,
      scheduledEndTime: row.scheduled_end_time,
      scheduledDuration: Number(row.scheduled_duration),
      timezone: row.timezone,
      assignedCaregiverId: row.assigned_caregiver_id ?? undefined,
      status: row.status,
      address: typeof row.address === 'string' ? JSON.parse(row.address) : row.address,
      clientInstructions: row.client_instructions,
      caregiverInstructions: row.caregiver_instructions,
      internalNotes: row.internal_notes,
      assignmentMethod: row.assignment_method,
      statusHistory: row.status_history ?? [],
      isUrgent: row.is_urgent ?? false,
      isPriority: row.is_priority ?? false,
      requiresSupervision: row.requires_supervision ?? false,
      incidentReported: row.incident_reported ?? false,
      signatureRequired: row.signature_required ?? false,
      signatureCaptured: row.signature_captured ?? false,
      createdAt: new Date(row.created_at),
      createdBy: row.created_by,
      updatedAt: new Date(row.updated_at),
      updatedBy: row.updated_by,
      version: row.version,
      deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
      deletedBy: row.deleted_by ?? undefined,
    };
  }

  /**
   * Expand pattern occurrences across date range
   */
  private expandPatternDates(
    pattern: VisitPattern,
    startDate: Date,
    endDate: Date
  ): Date[] {
    const dates: Date[] = [];
    const current = new Date(Date.UTC(
      startDate.getUTCFullYear(),
      startDate.getUTCMonth(),
      startDate.getUTCDate()
    ));

    const final = new Date(Date.UTC(
      endDate.getUTCFullYear(),
      endDate.getUTCMonth(),
      endDate.getUTCDate()
    ));

    const targetDays = new Set<DayOfWeek>(pattern.dayOfWeek ?? []);

    while (current <= final) {
      const dayName = this.getDayOfWeekName(current);

      if (pattern.frequency === 'DAILY') {
        dates.push(new Date(current));
      } else if (pattern.frequency === 'WEEKLY' || pattern.frequency === 'BIWEEKLY') {
        if (targetDays.has(dayName)) {
          dates.push(new Date(current));
        }
      } else if (pattern.frequency === 'MONTHLY') {
        if (current.getUTCDate() === startDate.getUTCDate()) {
          dates.push(new Date(current));
        }
      }

      current.setUTCDate(current.getUTCDate() + 1);
    }

    return dates;
  }

  private getDayOfWeekName(date: Date): DayOfWeek {
    const days: DayOfWeek[] = [
      'SUNDAY',
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
      'SATURDAY',
    ];
    return days[date.getUTCDay()]!;
  }

  private calculateEndTime(startTime: string, durationMinutes: number): string {
    const [h, m] = startTime.split(':').map(Number);
    const totalMin = (h ?? 0) * 60 + (m ?? 0) + durationMinutes;
    const endH = Math.floor(totalMin / 60) % 24;
    const endM = totalMin % 60;
    return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  }

  private generateVisitNumber(dateStr: string): string {
    const cleanDate = dateStr.replace(/-/g, '');
    const randomHex = randomBytes(3).toString('hex').toUpperCase();
    return `V-${cleanDate}-${randomHex}`;
  }

  private formatDateOnly(date: Date): string {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private normalizeRecurrence(input: CreateVisitPatternInput): CreateVisitPatternInput {
    let frequency = input.frequency ?? 'WEEKLY';
    let days = input.dayOfWeek ?? [];
    let rrule = input.rrule;

    // If rrule provided, parse frequency and BYDAY
    if (rrule) {
      if (rrule.includes('FREQ=DAILY')) frequency = 'DAILY';
      else if (rrule.includes('FREQ=WEEKLY')) frequency = 'WEEKLY';
      else if (rrule.includes('FREQ=MONTHLY')) frequency = 'MONTHLY';

      const byDayMatch = /BYDAY=([A-Z,]+)/.exec(rrule);
      if (byDayMatch?.[1]) {
        const rruleDays = byDayMatch[1].split(',');
        const rruleMap: Record<string, DayOfWeek> = {
          MO: 'MONDAY',
          TU: 'TUESDAY',
          WE: 'WEDNESDAY',
          TH: 'THURSDAY',
          FR: 'FRIDAY',
          SA: 'SATURDAY',
          SU: 'SUNDAY',
        };
        days = rruleDays.map((d) => rruleMap[d]).filter((d): d is DayOfWeek => Boolean(d));
      }
    }

    // Build canonical rrule string if not present
    if (!rrule) {
      const dayMap: Record<DayOfWeek, string> = {
        MONDAY: 'MO',
        TUESDAY: 'TU',
        WEDNESDAY: 'WE',
        THURSDAY: 'TH',
        FRIDAY: 'FR',
        SATURDAY: 'SA',
        SUNDAY: 'SU',
      };
      const byDay = days.map((d) => dayMap[d]).join(',');
      const byDayPart = byDay ? `;BYDAY=${byDay}` : '';
      rrule = `FREQ=${frequency}${byDayPart}`;
    }

    return {
      ...input,
      frequency,
      dayOfWeek: days,
      rrule,
    };
  }

  private validatePatternInput(input: CreateVisitPatternInput): void {
    if (!input.organizationId) {
      throw new ValidationError('organizationId is required');
    }
    if (!input.clientId) {
      throw new ValidationError('clientId is required');
    }
    if (!input.serviceTypeId) {
      throw new ValidationError('serviceTypeId is required');
    }
    if (!input.startDate) {
      throw new ValidationError('startDate is required');
    }
    if (!input.startTime || !/^\d{2}:\d{2}$/.test(input.startTime)) {
      throw new ValidationError('Valid startTime (HH:MM) is required');
    }
    if (!input.duration || input.duration < 15 || input.duration > 1440) {
      throw new ValidationError('Duration must be between 15 and 1440 minutes');
    }

    if (input.endDate) {
      const start = new Date(input.startDate);
      const end = new Date(input.endDate);
      if (end < start) {
        throw new ValidationError('endDate cannot be before startDate');
      }
    }
  }
}
