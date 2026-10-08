export type EVVRecordStatus =
  | 'PENDING' // Clock-in recorded, awaiting clock-out
  | 'COMPLETE' // Both clock-in and clock-out recorded
  | 'SUBMITTED' // Submitted to payor/billing
  | 'AMENDED' // Corrected/amended after initial submission
  | 'VOIDED'; // Cancelled/voided

export type VerificationLevel =
  | 'FULL' // GPS + geofence + device verification
  | 'PARTIAL' // Some verification elements missing
  | 'MANUAL' // Manual verification by supervisor
  | 'PHONE' // Phone-based verification
  | 'EXCEPTION'; // Exception process used

export type ComplianceFlag =
  | 'COMPLIANT'
  | 'GEOFENCE_VIOLATION'
  | 'TIME_GAP'
  | 'DEVICE_SUSPICIOUS'
  | 'LOCATION_SUSPICIOUS'
  | 'DUPLICATE_ENTRY'
  | 'MISSING_SIGNATURE'
  | 'LATE_SUBMISSION'
  | 'MANUAL_OVERRIDE'
  | 'AMENDED';

export type PayorApprovalStatus = 'PENDING' | 'APPROVED' | 'DENIED' | 'PENDING_INFO' | 'APPEALED';

export type VerificationMethod = 'GPS' | 'BIOMETRIC' | 'PHONE' | 'MANUAL' | 'EXCEPTION';

// Matches LocationVerificationInput in
// verticals/time-tracking-evv/src/types/evv.ts — the real backend clock-in/
// out request shape (NOT a `gpsCoordinates`/`verificationMethod` wrapper).
export interface EVVLocationInput {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude?: number;
  heading?: number;
  speed?: number;
  timestamp: string;
  method: VerificationMethod;
  mockLocationDetected: boolean;
  ipAddress?: string;
}

// Matches DeviceInfo in verticals/time-tracking-evv/src/types/evv.ts.
export interface EVVDeviceInfo {
  deviceId: string;
  deviceModel: string;
  deviceOS: string;
  osVersion: string;
  appVersion: string;
  batteryLevel?: number;
  networkType?: 'WIFI' | '4G' | '5G' | 'ETHERNET' | 'OFFLINE';
  isRooted?: boolean;
  isJailbroken?: boolean;
}

// Matches ClockInInput in verticals/time-tracking-evv/src/types/evv.ts.
export interface ClockInRequest {
  visitId: string;
  caregiverId: string;
  location: EVVLocationInput;
  deviceInfo: EVVDeviceInfo;
  clientPresent?: boolean;
  notes?: string;
}

// Matches ClockOutInput in verticals/time-tracking-evv/src/types/evv.ts.
export interface ClockOutRequest {
  visitId: string;
  evvRecordId: string;
  caregiverId: string;
  location: EVVLocationInput;
  deviceInfo: EVVDeviceInfo;
  completionNotes?: string;
  tasksCompleted?: number;
  tasksTotal?: number;
}

export interface EVVVerificationIssue {
  issueType: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  canBeOverridden: boolean;
  requiresSupervisor: boolean;
}

export interface EVVVerificationResult {
  passed: boolean;
  verificationLevel: VerificationLevel;
  complianceFlags: ComplianceFlag[];
  requiresSupervisorReview: boolean;
  issues: EVVVerificationIssue[];
}

// Matches EVVHandlers.clockIn's actual response shape in
// verticals/time-tracking-evv/src/api/evv-handlers.ts — a flat
// {success, evvRecordId, ...} payload, NOT a raw EVVRecord.
export interface ClockInResponse {
  success: boolean;
  evvRecordId: string;
  timeEntryId: string;
  verification: EVVVerificationResult;
  clockInTime: string;
  location: {
    isWithinGeofence?: boolean;
    distanceFromAddress?: number;
    accuracy?: number;
  };
}

// Matches EVVHandlers.clockOut's actual response shape.
export interface ClockOutResponse {
  success: boolean;
  evvRecordId: string;
  timeEntryId: string;
  verification: EVVVerificationResult;
  clockOutTime: string;
  totalDuration: number | null;
  billableHours: string | null;
  location: {
    isWithinGeofence?: boolean;
    distanceFromAddress?: number;
    accuracy?: number;
  };
}

export interface EVVLocationVerification {
  isWithinGeofence?: boolean;
  distanceFromAddress?: number;
  accuracy?: number;
  latitude?: number;
  longitude?: number;
}

export interface EVVRecord {
  id: string;
  visitId: string;
  caregiverId: string;
  clientId: string;
  clockInTime: string;
  clockOutTime?: string;
  totalDuration?: number;
  recordStatus: EVVRecordStatus;
  verificationLevel: VerificationLevel;
  complianceFlags: ComplianceFlag[];
  clockInVerification?: EVVLocationVerification;
  clockOutVerification?: EVVLocationVerification;
  submittedToPayor?: boolean;
  payorApprovalStatus?: PayorApprovalStatus;
  clientName?: string;
  caregiverName?: string;
  serviceDate?: string;
  durationHours?: string | null;
  isCompliant?: boolean;
  hasIssues?: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EVVSearchFilters {
  caregiverId?: string;
  clientId?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  verificationLevel?: string;
}

export interface EVVListResponse {
  items: EVVRecord[];
  total: number;
  hasMore: boolean;
}
