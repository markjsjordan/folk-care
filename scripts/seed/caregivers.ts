/**
 * Non-sensitive sanitized caregiver test profiles
 * Supporting Texas and Florida compliance scenarios across RN, LPN, CNA, and HHA roles.
 *
 * Deterministic fixed timestamps:
 * - Created: 2024-01-01T00:00:00.000Z
 * - Updated: 2025-01-15T00:00:00.000Z
 */

import caregiverData from './caregivers.json' with { type: 'json' };

export interface PhoneContact {
  number: string;
  type: 'MOBILE' | 'HOME' | 'WORK';
  canReceiveSMS: boolean;
}

export interface CredentialItem {
  id: string;
  type: string;
  name: string;
  number: string | null;
  issueDate: string;
  expirationDate: string | null;
  status: 'ACTIVE' | 'EXPIRED' | 'PENDING_VERIFICATION' | 'REVOKED';
}

export interface TrainingItem {
  id: string;
  name: string;
  category: string;
  completionDate: string;
  expirationDate: string | null;
  status: 'COMPLETED' | 'EXPIRED' | 'IN_PROGRESS';
}

export interface StateScreenings {
  state: 'TX' | 'FL';
  emrCleared?: boolean;
  narVerified?: boolean;
  dpsBackgroundCleared?: boolean;
  level2ScreeningCleared?: boolean;
  ahcaClearinghouseTCN?: string;
  clearinghouseExpirationDate?: string;
  oigCleared: boolean;
  lastVerifiedDate: string;
}

export interface CaregiverSeedProfile {
  id: string;
  organizationId: string;
  branchIds: string[];
  primaryBranchId: string;
  employeeNumber: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  preferredName: string | null;
  dateOfBirth: string;
  email: string;
  primaryPhone: PhoneContact;
  employmentType: 'FULL_TIME' | 'PART_TIME' | 'PER_DIEM' | 'CONTRACT' | 'TEMPORARY' | 'SEASONAL';
  employmentStatus: 'ACTIVE' | 'ON_LEAVE' | 'SUSPENDED' | 'TERMINATED' | 'RETIRED';
  hireDate: string;
  role: 'RN' | 'LPN' | 'CNA' | 'HHA';
  status: 'ACTIVE' | 'INACTIVE' | 'APPLICATION' | 'ONBOARDING';
  complianceStatus: 'COMPLIANT' | 'PENDING_VERIFICATION' | 'EXPIRING_SOON' | 'NON_COMPLIANT';
  credentials: CredentialItem[];
  training: TrainingItem[];
  stateScreenings: StateScreenings;
  isDemoData: boolean;
  createdAt: string;
  updatedAt: string;
}

export const SANITIZED_CAREGIVER_SEEDS: CaregiverSeedProfile[] = caregiverData as CaregiverSeedProfile[];

/**
 * Filter helpers for realistic testing scenarios
 */
export function getCaregiversByState(state: 'TX' | 'FL'): CaregiverSeedProfile[] {
  return SANITIZED_CAREGIVER_SEEDS.filter(c => c.stateScreenings.state === state);
}

export function getCaregiversByRole(role: 'RN' | 'LPN' | 'CNA' | 'HHA'): CaregiverSeedProfile[] {
  return SANITIZED_CAREGIVER_SEEDS.filter(c => c.role === role);
}

export function getCaregiverByEmployeeNumber(empNumber: string): CaregiverSeedProfile | undefined {
  return SANITIZED_CAREGIVER_SEEDS.find(c => c.employeeNumber === empNumber);
}
