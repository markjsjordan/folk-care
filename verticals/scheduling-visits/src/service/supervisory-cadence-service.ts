/**
 * Supervisory Visit Cadence Service
 *
 * Computes when supervisory visits are due based on client acuity,
 * care level (skilled nursing vs. non-skilled personal care), and state licensure regulations.
 *
 * Regulations:
 * - Florida: AHCA Chapter 59A-8.0095 (RN Supervisory Visit every 60 days for skilled nursing, 90-120 days for personal care)
 * - Texas: HHSC 26 TAC §558 (RN Supervisory Visit every 60 days for skilled nursing, 90-120 days for personal care)
 * - General/Federal standard: 60-day skilled nursing cycle, 90-120 day personal care cycle
 */

import { addDays, differenceInCalendarDays, startOfDay, format, parseISO } from 'date-fns';

export type AcuityLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'COMPLEX';

export type SupervisionStatus = 'OVERDUE' | 'UPCOMING' | 'OK';

export interface StateCadenceConfig {
  state: string;
  skilledCadenceDays: number;
  nonSkilledCadenceDays: number; // typically 90, allowable range 90-120
  citationSkilled: string;
  citationNonSkilled: string;
  description: string;
}

export const STATE_CADENCE_CONFIGS: Record<string, StateCadenceConfig> = {
  FL: {
    state: 'FL',
    skilledCadenceDays: 60,
    nonSkilledCadenceDays: 90,
    citationSkilled: 'Florida AHCA Ch. 59A-8.0095 (Mandatory 60-day RN supervisory visit)',
    citationNonSkilled: 'Florida AHCA Ch. 59A-8 (Personal care supervision every 90-120 days)',
    description: 'Florida AHCA regulations require RN supervisory visits every 60 days for skilled nursing and 90-120 days for personal care.',
  },
  TX: {
    state: 'TX',
    skilledCadenceDays: 60,
    nonSkilledCadenceDays: 90,
    citationSkilled: 'Texas HHSC 26 TAC §558 (Mandatory 60-day RN supervisory visit)',
    citationNonSkilled: 'Texas HHSC 26 TAC §558 (Personal care supervision every 90-120 days)',
    description: 'Texas HHSC 26 TAC §558 requires RN supervision every 60 days for skilled services and 90-120 days for non-skilled care.',
  },
  DEFAULT: {
    state: 'DEFAULT',
    skilledCadenceDays: 60,
    nonSkilledCadenceDays: 90,
    citationSkilled: 'Home Health CoP Standard (60-day skilled nursing supervision)',
    citationNonSkilled: 'Home Care Licensure Standard (90-120 day personal care supervision)',
    description: 'Standard home health regulatory cadence: 60 days for skilled nursing, 90-120 days for personal care.',
  },
};

export type NullableDateInput = Date | string | null;

export interface SupervisoryCadenceInput {
  clientId?: string;
  state: string;
  isSkilledNursing?: boolean;
  serviceType?: string;
  acuityLevel?: AcuityLevel | string;
  lastSupervisoryVisitDate?: NullableDateInput;
  initialVisitDate?: NullableDateInput;
  intakeDate?: NullableDateInput;
  referenceDate?: Date | string;
  preferredNonSkilledCadenceDays?: number;
}

export interface SupervisoryCadenceResult {
  clientId?: string;
  state: string;
  isSkilled: boolean;
  cadenceDays: number;
  anchorDate: Date;
  dueDate: Date;
  daysRemaining: number;
  status: SupervisionStatus;
  isOverdue: boolean;
  isUpcoming: boolean;
  showAlert: boolean;
  alertSeverity: 'danger' | 'warning' | 'info';
  alertTitle: string;
  alertMessage: string;
  regulationCitation: string;
  recommendation: string;
}

function parseDateInput(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
    if (match?.[1] && match[2] && match[3]) {
      const year = Number(match[1]);
      const month = Number(match[2]) - 1;
      const day = Number(match[3]);
      return new Date(year, month, day);
    }
    try {
      const parsed = trimmed.includes('T') ? parseISO(trimmed) : new Date(trimmed);
      return isNaN(parsed.getTime()) ? null : parsed;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Determine if a client requires skilled nursing supervision based on service type,
 * explicit flag, or clinical acuity.
 */
export function isSkilledCare(
  isSkilledNursing?: boolean,
  serviceType?: string,
  acuityLevel?: AcuityLevel | string
): boolean {
  if (isSkilledNursing === true) return true;
  if (isSkilledNursing === false) return false;

  if (serviceType) {
    const normalized = serviceType.toLowerCase();
    if (
      normalized.includes('skilled') ||
      normalized.includes('nursing') ||
      normalized.includes('rn') ||
      normalized.includes('lpn') ||
      normalized.includes('clinical') ||
      normalized.includes('infusion') ||
      normalized.includes('wound')
    ) {
      return true;
    }
  }

  if (acuityLevel) {
    const normAcuity = String(acuityLevel).toUpperCase();
    if (normAcuity === 'HIGH' || normAcuity === 'COMPLEX' || normAcuity === 'SKILLED') {
      return true;
    }
  }

  return false;
}

/**
 * Calculates the supervisory visit cadence and overdue/upcoming status
 */
export function calculateSupervisoryCadence(input: SupervisoryCadenceInput): SupervisoryCadenceResult {
  const stateCode = (input.state || 'DEFAULT').toUpperCase();
  const config = STATE_CADENCE_CONFIGS[stateCode] ?? STATE_CADENCE_CONFIGS.DEFAULT!;

  const isSkilled = isSkilledCare(input.isSkilledNursing, input.serviceType, input.acuityLevel);

  let cadenceDays: number;
  let regulationCitation: string;

  if (isSkilled) {
    cadenceDays = config.skilledCadenceDays;
    regulationCitation = config.citationSkilled;
  } else {
    // Non-skilled personal care: range 90-120 days, default 90 days
    const preferredDays = input.preferredNonSkilledCadenceDays ?? config.nonSkilledCadenceDays;
    cadenceDays = Math.min(120, Math.max(90, preferredDays));
    regulationCitation = config.citationNonSkilled;
  }

  const referenceDateRaw = parseDateInput(input.referenceDate) ?? new Date();
  const referenceDate = startOfDay(referenceDateRaw);

  // Find the anchor date (last supervisory visit > initial visit > intake date > reference date)
  const lastSupervision = parseDateInput(input.lastSupervisoryVisitDate);
  const initialVisit = parseDateInput(input.initialVisitDate);
  const intake = parseDateInput(input.intakeDate);

  const anchorDateRaw = lastSupervision ?? initialVisit ?? intake ?? referenceDate;
  const anchorDate = startOfDay(anchorDateRaw);

  const dueDate = addDays(anchorDate, cadenceDays);
  const daysRemaining = differenceInCalendarDays(dueDate, referenceDate);

  const isOverdue = daysRemaining < 0;
  const isUpcoming = daysRemaining >= 0 && daysRemaining <= 14;
  const status: SupervisionStatus = isOverdue ? 'OVERDUE' : isUpcoming ? 'UPCOMING' : 'OK';

  const formattedDueDate = format(dueDate, 'MMM d, yyyy');
  const careLabel = isSkilled ? 'Skilled Nursing (RN)' : 'Personal Care';

  let alertSeverity: 'danger' | 'warning' | 'info';
  let alertTitle: string;
  let alertMessage: string;
  let recommendation: string;

  if (isOverdue) {
    const overdueDays = Math.abs(daysRemaining);
    alertSeverity = 'danger';
    alertTitle = `Supervisory Visit Overdue (${overdueDays} ${overdueDays === 1 ? 'day' : 'days'})`;
    alertMessage = `${careLabel} supervisory visit was due on ${formattedDueDate} (${overdueDays} ${overdueDays === 1 ? 'day' : 'days'} overdue). Required every ${cadenceDays} days per ${regulationCitation}.`;
    recommendation = `Immediately schedule an ${isSkilled ? 'RN ' : ''}supervisory visit to maintain compliance with ${stateCode} licensure regulations.`;
  } else if (isUpcoming) {
    alertSeverity = 'warning';
    alertTitle = `Supervisory Visit Due Soon (${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'})`;
    alertMessage = `${careLabel} supervisory visit is due on ${formattedDueDate} (in ${daysRemaining} ${daysRemaining === 1 ? 'day' : 'days'}). Required every ${cadenceDays} days per ${regulationCitation}.`;
    recommendation = `Schedule the upcoming ${isSkilled ? 'RN ' : ''}supervisory visit before the ${formattedDueDate} compliance deadline.`;
  } else {
    alertSeverity = 'info';
    alertTitle = 'Supervisory Cadence Current';
    alertMessage = `Next ${careLabel.toLowerCase()} supervisory visit due on ${formattedDueDate} (${daysRemaining} days remaining).`;
    recommendation = `Cadence is on schedule. Next evaluation due in ${daysRemaining} days.`;
  }

  const showAlert = isOverdue || isUpcoming;

  return {
    clientId: input.clientId,
    state: stateCode,
    isSkilled,
    cadenceDays,
    anchorDate,
    dueDate,
    daysRemaining,
    status,
    isOverdue,
    isUpcoming,
    showAlert,
    alertSeverity,
    alertTitle,
    alertMessage,
    regulationCitation,
    recommendation,
  };
}

export class SupervisoryCadenceService {
  /**
   * Compute supervisory cadence calculation for a client
   */
  calculateCadence(input: SupervisoryCadenceInput): SupervisoryCadenceResult {
    return calculateSupervisoryCadence(input);
  }

  /**
   * Determine whether a client's supervision visit is overdue or upcoming within 14 days
   */
  isVisitDueOrUpcoming(input: SupervisoryCadenceInput): boolean {
    const result = calculateSupervisoryCadence(input);
    return result.showAlert;
  }

  /**
   * Compute the exact next due date for supervision visit
   */
  getNextDueDate(input: SupervisoryCadenceInput): Date {
    const result = calculateSupervisoryCadence(input);
    return result.dueDate;
  }
}
