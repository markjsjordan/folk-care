/**
 * Types for Recurring Visit Patterns
 */

import type { UUID, Entity, SoftDeletable } from '@folkcare/core';
import type { DayOfWeek, Frequency, Visit } from './schedule.js';

export type VisitPatternStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED';

export interface VisitPattern extends Entity, SoftDeletable {
  organizationId: UUID;
  branchId?: UUID;
  clientId: UUID;
  caregiverId?: UUID;
  serviceTypeId: UUID;
  serviceTypeName?: string;
  frequency: Frequency;
  rrule?: string;
  startDate: Date;
  endDate?: Date;
  dayOfWeek: DayOfWeek[];
  startTime: string; // HH:MM e.g. "09:00"
  duration: number; // in minutes e.g. 240
  status: VisitPatternStatus;
  notes?: string;
  clientInstructions?: string;
  caregiverInstructions?: string;
  skipHolidays?: boolean;
}

export interface CaregiverTimeOffException {
  caregiverId: UUID;
  startDate: Date | string;
  endDate: Date | string;
  reason?: string;
}

export interface ClientHospitalHoldException {
  clientId: UUID;
  startDate: Date | string;
  endDate: Date | string;
  reason?: string;
}

export interface PatternGenerationException {
  date: string;
  type: 'HOLIDAY' | 'CAREGIVER_TIME_OFF' | 'HOSPITAL_HOLD';
  reason: string;
  caregiverId?: UUID;
  clientId?: UUID;
}

export interface CreateVisitPatternInput {
  organizationId: UUID;
  branchId?: UUID;
  clientId: UUID;
  caregiverId?: UUID;
  serviceTypeId: UUID;
  serviceTypeName?: string;
  frequency?: Frequency;
  rrule?: string;
  startDate: Date | string;
  endDate?: Date | string;
  dayOfWeek?: DayOfWeek[];
  startTime: string; // HH:MM
  duration: number; // in minutes
  status?: 'ACTIVE' | 'PAUSED' | 'CANCELLED';
  notes?: string;
  clientInstructions?: string;
  caregiverInstructions?: string;
  skipHolidays?: boolean;
  horizonDays?: number; // Rolling horizon in days (default 60)
  caregiverTimeOffExceptions?: CaregiverTimeOffException[];
  clientHospitalHolds?: ClientHospitalHoldException[];
}

export interface UpdateVisitPatternInput {
  updateMode: 'THIS_VISIT' | 'ALL_FUTURE';
  targetVisitId?: UUID;
  fromDate?: Date | string;
  updates?: {
    caregiverId?: UUID | null;
    startTime?: string;
    duration?: number;
    notes?: string;
    status?: 'ACTIVE' | 'PAUSED' | 'CANCELLED';
    dayOfWeek?: DayOfWeek[];
    scheduledDate?: Date | string;
  };
}

export interface PatternGenerationResult {
  pattern: VisitPattern;
  generatedVisitsCount: number;
  visits: Visit[];
  exceptions: PatternGenerationException[];
}
