/**
 * Repository for Visit Patterns (Recurring Visit Schedules)
 *
 * Enforces strict multi-tenant isolation with organization_id scoping
 * on all database operations.
 */

import type { Pool } from 'pg';
import {
  type UUID,
  type UserContext,
  NotFoundError,
} from '@folkcare/core';
import type {
  VisitPattern,
  CreateVisitPatternInput,
} from '../types/visit-pattern.js';
import type { Visit, DayOfWeek, Frequency } from '../types/schedule.js';

export class VisitPatternRepository {
  constructor(private pool: Pool) {}

  /**
   * Create a new visit pattern
   */
  async createPattern(
    input: CreateVisitPatternInput,
    context: UserContext
  ): Promise<VisitPattern> {
    const query = `
      INSERT INTO visit_patterns (
        id, organization_id, branch_id, client_id, caregiver_id,
        service_type_id, service_type_name, frequency, rrule,
        start_date, end_date, day_of_week, start_time, duration,
        status, notes, client_instructions, caregiver_instructions,
        skip_holidays, created_at, created_by, updated_at, updated_by
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4,
        $5, $6, $7, $8,
        $9, $10, $11, $12, $13,
        $14, $15, $16, $17,
        $18, NOW(), $19, NOW(), $19
      )
      RETURNING *
    `;

    const dayOfWeekJson = JSON.stringify(input.dayOfWeek ?? []);

    const values = [
      input.organizationId,
      input.branchId ?? null,
      input.clientId,
      input.caregiverId ?? null,
      input.serviceTypeId,
      input.serviceTypeName ?? null,
      input.frequency ?? 'WEEKLY',
      input.rrule ?? null,
      input.startDate,
      input.endDate ?? null,
      dayOfWeekJson,
      input.startTime,
      input.duration,
      input.status ?? 'ACTIVE',
      input.notes ?? null,
      input.clientInstructions ?? null,
      input.caregiverInstructions ?? null,
      input.skipHolidays !== false,
      context.userId,
    ];

    const result = await this.pool.query(query, values);
    return this.mapRowToVisitPattern(result.rows[0]);
  }

  /**
   * Get a pattern by ID with tenant isolation check
   */
  async getPatternById(id: UUID, organizationId: UUID): Promise<VisitPattern | null> {
    const query = `
      SELECT * FROM visit_patterns
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
    `;
    const result = await this.pool.query(query, [id, organizationId]);
    return result.rows[0] ? this.mapRowToVisitPattern(result.rows[0]) : null;
  }

  /**
   * List patterns with optional filtering (scoped to organization)
   */
  async listPatterns(filters: {
    organizationId: UUID;
    clientId?: UUID;
    caregiverId?: UUID;
    status?: string;
  }): Promise<VisitPattern[]> {
    const conditions: string[] = ['organization_id = $1', 'deleted_at IS NULL'];
    const values: unknown[] = [filters.organizationId];

    if (filters.clientId) {
      values.push(filters.clientId);
      conditions.push(`client_id = $${values.length}`);
    }

    if (filters.caregiverId) {
      values.push(filters.caregiverId);
      conditions.push(`caregiver_id = $${values.length}`);
    }

    if (filters.status) {
      values.push(filters.status);
      conditions.push(`status = $${values.length}`);
    }

    const query = `
      SELECT * FROM visit_patterns
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
    `;

    const result = await this.pool.query(query, values);
    return result.rows.map((row) => this.mapRowToVisitPattern(row));
  }

  /**
   * Update pattern record
   */
  async updatePattern(
    id: UUID,
    organizationId: UUID,
    updates: Partial<VisitPattern>,
    context: UserContext
  ): Promise<VisitPattern> {
    const setClauses: string[] = ['updated_at = NOW()', 'updated_by = $3'];
    const values: unknown[] = [id, organizationId, context.userId];

    if (updates.startTime !== undefined) {
      values.push(updates.startTime);
      setClauses.push(`start_time = $${values.length}`);
    }
    if (updates.duration !== undefined) {
      values.push(updates.duration);
      setClauses.push(`duration = $${values.length}`);
    }
    if (updates.caregiverId !== undefined) {
      values.push(updates.caregiverId);
      setClauses.push(`caregiver_id = $${values.length}`);
    }
    if (updates.status !== undefined) {
      values.push(updates.status);
      setClauses.push(`status = $${values.length}`);
    }
    if (updates.notes !== undefined) {
      values.push(updates.notes);
      setClauses.push(`notes = $${values.length}`);
    }
    if (updates.dayOfWeek !== undefined) {
      values.push(JSON.stringify(updates.dayOfWeek));
      setClauses.push(`day_of_week = $${values.length}`);
    }
    if (updates.endDate !== undefined) {
      values.push(updates.endDate);
      setClauses.push(`end_date = $${values.length}`);
    }

    const query = `
      UPDATE visit_patterns
      SET ${setClauses.join(', ')}
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await this.pool.query(query, values);
    if (result.rows.length === 0) {
      throw new NotFoundError('Visit pattern not found or access denied', { id });
    }

    return this.mapRowToVisitPattern(result.rows[0]);
  }

  /**
   * Soft-delete pattern
   */
  async deletePattern(
    id: UUID,
    organizationId: UUID,
    context: UserContext
  ): Promise<boolean> {
    const query = `
      UPDATE visit_patterns
      SET deleted_at = NOW(), deleted_by = $3, status = 'CANCELLED'
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
    `;
    const result = await this.pool.query(query, [id, organizationId, context.userId]);
    return (result.rowCount ?? 0) > 0;
  }

  /**
   * Get all concrete visits generated by this pattern
   */
  async getVisitsByPatternId(patternId: UUID, organizationId: UUID): Promise<Visit[]> {
    const query = `
      SELECT * FROM visits
      WHERE pattern_id = $1 AND organization_id = $2 AND deleted_at IS NULL
      ORDER BY scheduled_date ASC, scheduled_start_time ASC
    `;
    const result = await this.pool.query(query, [patternId, organizationId]);
    return result.rows.map((row) => this.mapRowToVisit(row));
  }

  /**
   * Update future instances of visits for a pattern
   */
  async updateFutureVisitsForPattern(
    patternId: UUID,
    organizationId: UUID,
    fromDate: Date | string,
    updates: {
      startTime?: string;
      duration?: number;
      caregiverId?: UUID | null;
      notes?: string;
    },
    context: UserContext
  ): Promise<number> {
    const setClauses: string[] = ['updated_at = NOW()', 'updated_by = $4'];
    const values: unknown[] = [patternId, organizationId, fromDate, context.userId];

    if (updates.startTime !== undefined) {
      values.push(updates.startTime);
      setClauses.push(`scheduled_start_time = $${values.length}`);
    }

    if (updates.duration !== undefined) {
      values.push(updates.duration);
      setClauses.push(`scheduled_duration = $${values.length}`);

      if (updates.startTime !== undefined) {
        // Calculate end time
        const [h, m] = updates.startTime.split(':').map(Number);
        const totalMin = (h ?? 0) * 60 + (m ?? 0) + updates.duration;
        const endH = Math.floor(totalMin / 60) % 24;
        const endM = totalMin % 60;
        const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
        values.push(endTime);
        setClauses.push(`scheduled_end_time = $${values.length}`);
      }
    }

    if (updates.caregiverId !== undefined) {
      values.push(updates.caregiverId);
      const caregiverIdx = values.length;
      setClauses.push(`assigned_caregiver_id = $${caregiverIdx}`);
      setClauses.push(`status = CASE WHEN $${caregiverIdx}::uuid IS NOT NULL THEN 'ASSIGNED' ELSE 'UNASSIGNED' END`);
    }

    if (updates.notes !== undefined) {
      values.push(updates.notes);
      setClauses.push(`internal_notes = $${values.length}`);
    }

    const query = `
      UPDATE visits
      SET ${setClauses.join(', ')}
      WHERE pattern_id = $1
        AND organization_id = $2
        AND scheduled_date >= $3
        AND status IN ('UNASSIGNED', 'SCHEDULED', 'ASSIGNED', 'CONFIRMED')
        AND deleted_at IS NULL
    `;

    const result = await this.pool.query(query, values);
    return result.rowCount ?? 0;
  }

  /**
   * Update a single specific visit
   */
  async updateSingleVisit(
    visitId: UUID,
    organizationId: UUID,
    updates: {
      startTime?: string;
      duration?: number;
      caregiverId?: UUID | null;
      scheduledDate?: Date | string;
      notes?: string;
    },
    context: UserContext
  ): Promise<Visit> {
    const setClauses: string[] = ['updated_at = NOW()', 'updated_by = $3'];
    const values: unknown[] = [visitId, organizationId, context.userId];

    if (updates.scheduledDate !== undefined) {
      values.push(updates.scheduledDate);
      setClauses.push(`scheduled_date = $${values.length}`);
    }

    if (updates.startTime !== undefined) {
      values.push(updates.startTime);
      setClauses.push(`scheduled_start_time = $${values.length}`);
    }

    if (updates.duration !== undefined) {
      values.push(updates.duration);
      setClauses.push(`scheduled_duration = $${values.length}`);

      if (updates.startTime !== undefined) {
        const [h, m] = updates.startTime.split(':').map(Number);
        const totalMin = (h ?? 0) * 60 + (m ?? 0) + updates.duration;
        const endH = Math.floor(totalMin / 60) % 24;
        const endM = totalMin % 60;
        const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
        values.push(endTime);
        setClauses.push(`scheduled_end_time = $${values.length}`);
      }
    }

    if (updates.caregiverId !== undefined) {
      values.push(updates.caregiverId);
      const caregiverIdx = values.length;
      setClauses.push(`assigned_caregiver_id = $${caregiverIdx}`);
      setClauses.push(`status = CASE WHEN $${caregiverIdx}::uuid IS NOT NULL THEN 'ASSIGNED' ELSE 'UNASSIGNED' END`);
    }

    if (updates.notes !== undefined) {
      values.push(updates.notes);
      setClauses.push(`internal_notes = $${values.length}`);
    }

    const query = `
      UPDATE visits
      SET ${setClauses.join(', ')}
      WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await this.pool.query(query, values);
    if (result.rows.length === 0) {
      throw new NotFoundError('Visit not found or access denied', { visitId });
    }

    return this.mapRowToVisit(result.rows[0]);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapRowToVisitPattern(row: any): VisitPattern {
    return {
      id: row.id,
      organizationId: row.organization_id,
      branchId: row.branch_id ?? undefined,
      clientId: row.client_id,
      caregiverId: row.caregiver_id ?? undefined,
      serviceTypeId: row.service_type_id,
      serviceTypeName: row.service_type_name ?? undefined,
      frequency: row.frequency as Frequency,
      rrule: row.rrule ?? undefined,
      startDate: new Date(row.start_date),
      endDate: row.end_date ? new Date(row.end_date) : undefined,
      dayOfWeek: (typeof row.day_of_week === 'string' ? JSON.parse(row.day_of_week) : row.day_of_week) as DayOfWeek[],
      startTime: row.start_time,
      duration: Number(row.duration),
      status: row.status,
      notes: row.notes ?? undefined,
      clientInstructions: row.client_instructions ?? undefined,
      caregiverInstructions: row.caregiver_instructions ?? undefined,
      skipHolidays: row.skip_holidays !== false,
      createdAt: new Date(row.created_at),
      createdBy: row.created_by,
      updatedAt: new Date(row.updated_at),
      updatedBy: row.updated_by,
      version: row.version ?? 1,
      deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
      deletedBy: row.deleted_by ?? undefined,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapRowToVisit(row: any): Visit {
    return {
      id: row.id,
      organizationId: row.organization_id,
      branchId: row.branch_id,
      clientId: row.client_id,
      patternId: row.pattern_id ?? undefined,
      scheduleId: row.schedule_id ?? undefined,
      visitNumber: row.visit_number,
      visitType: row.visit_type,
      serviceTypeId: row.service_type_id,
      serviceTypeName: row.service_type_name,
      scheduledDate: new Date(row.scheduled_date),
      scheduledStartTime: row.scheduled_start_time,
      scheduledEndTime: row.scheduled_end_time,
      scheduledDuration: Number(row.scheduled_duration),
      timezone: row.timezone,
      actualStartTime: row.actual_start_time ? new Date(row.actual_start_time) : undefined,
      actualEndTime: row.actual_end_time ? new Date(row.actual_end_time) : undefined,
      actualDuration: row.actual_duration ? Number(row.actual_duration) : undefined,
      assignedCaregiverId: row.assigned_caregiver_id ?? undefined,
      assignedAt: row.assigned_at ? new Date(row.assigned_at) : undefined,
      assignedBy: row.assigned_by ?? undefined,
      assignmentMethod: row.assignment_method,
      address: typeof row.address === 'string' ? JSON.parse(row.address) : (row.address ?? {}),
      locationVerification: row.location_verification,
      taskIds: row.task_ids,
      requiredSkills: row.required_skills,
      requiredCertifications: row.required_certifications,
      status: row.status,
      statusHistory: row.status_history ?? [],
      isUrgent: row.is_urgent,
      isPriority: row.is_priority,
      requiresSupervision: row.requires_supervision,
      riskFlags: row.risk_flags,
      verificationMethod: row.verification_method,
      verificationData: row.verification_data,
      completionNotes: row.completion_notes,
      tasksCompleted: row.tasks_completed,
      tasksTotal: row.tasks_total,
      incidentReported: row.incident_reported,
      signatureRequired: row.signature_required,
      signatureCaptured: row.signature_captured,
      signatureData: row.signature_data,
      billableHours: row.billable_hours ? Number(row.billable_hours) : undefined,
      billingStatus: row.billing_status,
      billingNotes: row.billing_notes,
      clientInstructions: row.client_instructions,
      caregiverInstructions: row.caregiver_instructions,
      internalNotes: row.internal_notes,
      tags: row.tags,
      createdAt: new Date(row.created_at),
      createdBy: row.created_by,
      updatedAt: new Date(row.updated_at),
      updatedBy: row.updated_by,
      version: row.version,
      deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
      deletedBy: row.deleted_by ?? undefined,
    };
  }
}
