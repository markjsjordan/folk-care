# FC-SCHED-002: Recurring Visit Scheduling TA Spec
## Patterns, Conflicts, Mass-Edit

**Author:** Technical Architecture  
**Version:** 1.0  
**Date:** September 20, 2026  
**Status:** DRAFT → Implementation Ready  

---

## Executive Summary

FC-SCHED-002 extends the visit scheduling system to handle **recurring visit patterns**, **intelligent conflict detection**, and **bulk operations** on schedules. This enables schedulers to:

1. **Define recurring service patterns** (daily/weekly/monthly patterns with rules)
2. **Generate schedules** from patterns while detecting conflicts and respecting caregiver availability
3. **Mass-edit** multiple visits at once (bulk reschedule, assignment, cancellation)
4. **Handle conflicts intelligently** (detect, warn, override with rationale)

This spec defines the technical architecture, data models, API contracts, and implementation strategy for production deployment.

---

## 1. Problem Statement

### Current Limitations (FC-SCHED-001)

1. **No recurring patterns** — Can only create individual visits one at a time
2. **Manual scheduling burden** — Must create every visit individually for recurring services
3. **Limited conflict detection** — Only checks assigned caregiver, not caregiver availability or service hour authorization
4. **No bulk operations** — Cannot edit multiple visits at once
5. **Compliance gaps** — Doesn't track authorization limits (hours/visits per week)
6. **State-specific rules ignored** — No state-by-state variation for EVV, geofencing, supervision requirements

### Business Impact

- **Scheduler inefficiency** — 10x more clicks to set up weekly recurring visits
- **Compliance risk** — Untracked authorization hours can cause claim denials
- **Assignment failures** — No visibility into why caregivers can't be assigned
- **Conflict handling manual** — Coordinators can't see what would break before clicking assign

---

## 2. Architecture Overview

### High-Level Design

```
┌─────────────────────────────────────────────────────────────────┐
│                    FC-SCHED-002 System                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────┐         ┌──────────────────────┐    │
│  │ Recurring Patterns   │         │ Conflict Engine      │    │
│  │ (ServicePattern)     │         │ (Real-time detect)   │    │
│  │                      │         │                      │    │
│  │ • RECURRING          │         │ • Schedule overlap   │    │
│  │ • ONE_TIME           │◄───────►│ • Authorization      │    │
│  │ • AS_NEEDED          │         │ • Caregiver skills   │    │
│  │ • RESPITE            │         │ • State rules        │    │
│  └──────────────────────┘         └──────────────────────┘    │
│           ▲                                ▲                    │
│           │                                │                    │
│  ┌────────┴────────────────────────────────┴───────┐           │
│  │      Schedule Generation Engine                │           │
│  │                                                │           │
│  │  • Expand pattern → visits                    │           │
│  │  • Apply recurrence rules                     │           │
│  │  • Validate against authorization            │           │
│  │  • Detect conflicts upfront                  │           │
│  │  • Generate with status hints                │           │
│  └────────────────────────────────────────────────┘           │
│           ▲                    ▲                    ▲          │
│           │                    │                    │          │
│  ┌────────┴──────┐   ┌────────┴──────┐   ┌────────┴──────┐  │
│  │ Pattern       │   │ Caregiver     │   │ Client Auth   │  │
│  │ Service       │   │ Availability  │   │ Tracking      │  │
│  │               │   │ Service       │   │ Service       │  │
│  └───────────────┘   └───────────────┘   └───────────────┘  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │              Mass Edit Operations                      │  │
│  │  • Bulk reschedule (calendar view)                    │  │
│  │  • Bulk assign (auto-matcher runs for all)            │  │
│  │  • Bulk cancel with reason tracking                   │  │
│  │  • Undo/redo with audit trail                         │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | Responsibility | Location |
|-----------|-----------------|----------|
| **ServicePatternRepository** | CRUD + query recurring patterns | `packages/core/repository/` |
| **ScheduleGenerationService** | Expand patterns → visits + validate | `verticals/scheduling-visits/service/` |
| **ConflictDetectionEngine** | Real-time conflict checking | `verticals/scheduling-visits/service/` |
| **MassEditService** | Bulk operations with undo/redo | `verticals/scheduling-visits/service/` |
| **ScheduleAPI** | REST endpoints for patterns/generation/conflicts | `packages/app/routes/api/` |
| **ScheduleUI** | Pattern form, schedule preview, mass-edit UI | `packages/web/verticals/scheduling-visits/` |

---

## 3. Data Models

### 3.1 ServicePattern Entity

Defined in `verticals/scheduling-visits/src/types/schedule.ts` (already exists).

**Key additions for FC-SCHED-002:**

```typescript
interface ServicePattern extends Entity, SoftDeletable {
  // ... existing fields ...

  // NEW: Recurrence definition
  recurrence: RecurrenceRule;  // When pattern repeats
  
  // NEW: Authorization limits (compliance)
  authorizedHoursPerWeek?: number;     // State-specific limit
  authorizedVisitsPerWeek?: number;    // Max visits per week
  authorizationStartDate?: Date;       // When authorization begins
  authorizationEndDate?: Date;         // When authorization expires
  
  // NEW: Conflict prevention rules
  blockedCaregivers?: UUID[];          // Don't assign to these caregivers
  preferredCaregivers?: UUID[];        // Prefer these first
  genderPreference?: 'MALE' | 'FEMALE' | 'NO_PREFERENCE';
  
  // NEW: State-specific requirements
  stateCode?: string;                  // Two-letter state (TX, FL, etc.)
  requiresGPSVerification?: boolean;    // State EVV mandate
  geofenceRadiusMeters?: number;        // State-specific geofence
  requiresRNSupervision?: boolean;      // If RN visit every N days
  rnSupervisionFrequencyDays?: number;  // Days between RN visits
  
  // NEW: Service hour authorization tracking
  fundingSourceId?: UUID;              // Link to funding source/payer
}

interface RecurrenceRule {
  frequency: 'DAILY' | 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'CUSTOM';
  interval: number;                    // Every N days/weeks/months
  daysOfWeek?: DayOfWeek[];            // For WEEKLY: MON, TUE, WED...
  datesOfMonth?: number[];             // For MONTHLY: 1, 15, 30...
  startTime: string;                   // "09:00"
  endTime?: string;                    // "10:30" (if different from duration)
  timezone: string;                    // "America/Chicago"
  
  // NEW: Recurrence limits
  occurrences?: number;                // Stop after N occurrences
  untilDate?: Date;                    // Stop after this date
  
  // NEW: Recurrence exceptions
  excludedDates?: Date[];              // Skip these dates
  excludedDayOfWeek?: DayOfWeek[];     // Skip these weekdays (e.g., holidays)
}
```

**Database Migration:**
- Add columns to `service_patterns` table
- Create index on `(organization_id, client_id, status)` for queries
- Create index on `(pattern_type, status, effective_from)` for schedule generation
- Add `is_demo_data` column for testing

### 3.2 ScheduleGenerationRequest

New request type for bulk schedule generation:

```typescript
interface ScheduleGenerationRequest {
  // Pattern to expand
  patternIds: UUID[];                  // One or more patterns
  
  // Date range
  startDate: Date;                     // First visit date
  endDate: Date;                       // Last visit date (or until pattern ends)
  
  // Options
  autoAssign?: boolean;                // Try to auto-assign caregivers
  respectAuthLimits?: boolean;         // Don't exceed auth hours/visits
  skipHolidays?: boolean;              // Skip holidays (needs holiday calendar)
  holidayCalendarId?: UUID;
  detectConflicts?: boolean;           // Pre-check for conflicts
  applyState?: string;                 // Apply state-specific rules
  
  // Metadata
  generatedBy: UUID;                   // User generating schedule
  reason?: string;                     // Why generating (new pattern, reschedule, etc.)
}

interface ScheduleGenerationResponse {
  scheduleId: UUID;
  patternId: UUID;
  startDate: Date;
  endDate: Date;
  
  // Results
  totalGenerated: number;              // Total visits created
  assigned: number;                    // Successfully auto-assigned
  unassigned: number;                  // Need manual assignment
  conflicts: ConflictWarning[];        // What to watch out for
  authWarnings: AuthorizationWarning[]; // Hours/visits near limit
  
  // For preview before commit
  preview?: {
    visits: VisitWithConflictStatus[];
    estimatedHours: number;
    estimatedCost: number;
  }
}

interface VisitWithConflictStatus extends Visit {
  hasConflict: boolean;
  conflictReasons?: string[];          // Why this visit has issues
  canAssign: boolean;                  // Can assign to preferred caregiver
  matchScore?: number;                 // 0-100 match quality
}
```

### 3.3 ConflictWarning

```typescript
interface ConflictWarning {
  visitId?: UUID;
  type: ConflictType;
  severity: 'INFO' | 'WARNING' | 'ERROR';
  message: string;
  
  // Details for resolution
  affectedCaregiverId?: UUID;
  affectedClientId?: UUID;
  conflictingVisitId?: UUID;
  conflictingDateTime?: { date: Date; startTime: string; endTime: string };
  
  // Suggestions
  resolution?: string;                 // How to fix it
  suggestedCaregivers?: UUID[];        // Alternative assignments
}

type ConflictType =
  | 'CAREGIVER_DOUBLE_BOOK'           // Same caregiver, same time
  | 'NO_CAREGIVER_SKILL'              // No qualified caregivers available
  | 'AUTH_HOURS_EXCEEDED'             // Would exceed auth hours
  | 'AUTH_VISITS_EXCEEDED'            // Would exceed auth visits
  | 'AUTH_EXPIRED'                    // Authorization date has passed
  | 'GEOFENCE_VIOLATION'              // Geofence not configured
  | 'STATE_RULE_VIOLATION'            // State-specific rule broken
  | 'RN_SUPERVISION_DUE'              // RN supervision visit overdue
  | 'CAREGIVER_UNAVAILABLE'           // Not working those hours
  | 'LOCATION_NOT_VERIFIED'           // Address missing/incomplete
  | 'SCHEDULE_CONFLICT'               // Generic scheduling conflict
  | 'OTHER';
```

### 3.4 MassEditOperation

For tracking bulk edits with undo/redo:

```typescript
interface MassEditOperation {
  id: UUID;
  organizationId: UUID;
  
  operationType: 'RESCHEDULE' | 'ASSIGN' | 'CANCEL' | 'UPDATE_PATTERN';
  targetVisitIds: UUID[];              // Which visits affected
  
  // What changed
  changes: {
    scheduledDate?: { from: Date; to: Date };
    scheduledStartTime?: { from: string; to: string };
    assignedCaregiverId?: { from?: UUID; to?: UUID };
    status?: { from: VisitStatus; to: VisitStatus };
    notes?: string;
  };
  
  // Metadata
  createdBy: UUID;
  createdAt: Timestamp;
  appliedAt?: Timestamp;
  
  // Conflict handling
  conflictsIgnored?: ConflictWarning[];
  conflictOverride?: boolean;          // User chose to override
  
  // Undo support
  canUndo: boolean;
  undoneAt?: Timestamp;
}
```

---

## 4. API Specification

### 4.1 Pattern Management

#### POST `/api/schedules/patterns`
Create a new recurring service pattern.

**Request:**
```typescript
{
  organizationId: UUID;
  branchId: UUID;
  clientId: UUID;
  
  name: string;                        // "Mary - Weekly PT Sessions"
  description?: string;
  patternType: 'RECURRING' | 'ONE_TIME' | 'AS_NEEDED' | 'RESPITE';
  
  serviceTypeId: UUID;
  serviceTypeName: string;
  
  recurrence: {
    frequency: 'WEEKLY';
    interval: 1;
    daysOfWeek: ['MONDAY', 'WEDNESDAY', 'FRIDAY'];
    startTime: '09:00';
    endTime: '10:00';
    timezone: 'America/Chicago';
    untilDate: Date;
  };
  
  // Authorization
  authorizedHoursPerWeek: 3;
  authorizationStartDate: Date;
  authorizationEndDate: Date;
  fundingSourceId?: UUID;
  
  // Caregiver preferences
  preferredCaregivers: [UUID_of_sarah];
  blockedCaregivers?: [];
  requiredSkills?: ['CPR', 'Physical Therapy'];
  
  // State-specific
  stateCode: 'TX';
  requiresGPSVerification: true;
  geofenceRadiusMeters: 100;
  
  status: 'ACTIVE';
  effectiveFrom: Date;
}
```

**Response (201 Created):**
```typescript
{
  id: UUID;
  organizationId: UUID;
  ... (full ServicePattern)
}
```

**Status Codes:**
- `201` — Pattern created successfully
- `400` — Validation error (missing required fields, invalid recurrence, etc.)
- `409` — Authorization conflict (e.g., end date before start date)

#### GET `/api/schedules/patterns?clientId={id}&status=ACTIVE`
List patterns for a client, filtered by status.

**Query Params:**
- `clientId` (required) — Client UUID
- `status` (optional) — `ACTIVE`, `DRAFT`, `SUSPENDED`, `COMPLETED`, `CANCELLED`
- `patternType` (optional) — Filter by type
- `limit` (optional) — Default 100, max 1000
- `offset` (optional) — For pagination

**Response:**
```typescript
{
  data: ServicePattern[];
  total: number;
  offset: number;
  limit: number;
}
```

#### GET `/api/schedules/patterns/{patternId}`
Get single pattern details.

**Response:**
```typescript
{
  ... (full ServicePattern with nested recurrence)
}
```

#### PUT `/api/schedules/patterns/{patternId}`
Update an existing pattern (not full replacement, only specified fields).

**Request:**
```typescript
{
  name?: string;
  description?: string;
  authorizedHoursPerWeek?: number;
  preferredCaregivers?: UUID[];
  status?: 'ACTIVE' | 'SUSPENDED' | 'COMPLETED' | 'CANCELLED';
  effectiveTo?: Date;
}
```

**Response (200 OK):**
```typescript
{
  ... (updated ServicePattern)
}
```

**Important:** Only allow updates to draft/active patterns. Completed/cancelled patterns should be read-only (create new ones instead).

#### DELETE `/api/schedules/patterns/{patternId}`
Soft-delete a pattern (mark deleted, don't remove).

**Response (204 No Content)**

---

### 4.2 Schedule Generation

#### POST `/api/schedules/generate`
Generate visits from one or more patterns.

**Request:**
```typescript
{
  patternIds: [UUID, UUID];            // Can expand multiple at once
  startDate: Date;                     // 2026-10-01
  endDate: Date;                       // 2026-12-31
  
  autoAssign: true;                    // Try to auto-assign caregivers
  respectAuthLimits: true;             // Don't exceed hours/visits per week
  skipHolidays: false;
  detectConflicts: true;               // Pre-check for conflicts
  applyState: 'TX';                    // Apply TX-specific rules
  
  preview: true;                       // Don't commit yet, just show results
}
```

**Response (200 OK) — Preview Mode:**
```typescript
{
  schedule: {
    id: UUID;                          // Assigned even in preview
    patternIds: UUID[];
    startDate: Date;
    endDate: Date;
    totalGenerated: 42;
    assigned: 38;
    unassigned: 4;
    
    conflicts: [
      {
        type: 'CAREGIVER_DOUBLE_BOOK';
        severity: 'WARNING';
        message: 'Sarah Martinez double-booked on 2026-10-06 09:00-10:00';
        affectedCaregiverId: UUID;
        conflictingDateTime: { ... };
      }
    ];
    
    authWarnings: [
      {
        type: 'APPROACHING_AUTH_LIMIT';
        message: 'Pattern would use 2.5 of 3 authorized hours/week';
        utilization: 0.83;
      }
    ];
  },
  
  preview: {
    visits: [
      {
        id: UUID;
        visitNumber: 'V-2026-1001';
        scheduledDate: '2026-10-01';
        scheduledStartTime: '09:00';
        scheduledEndTime: '10:00';
        assignedCaregiverId: UUID;
        hasConflict: false;
        conflictReasons: [];
      },
      // ... more visits
    ];
    estimatedHours: 42.0;
    estimatedCost: 3780;  // 42 hours * $90/hr
  }
}
```

**Approval Flow (when preview=false):**
```typescript
{
  patternIds: [UUID];
  startDate: Date;
  endDate: Date;
  
  preview: false;                      // Commit to database
  overrideConflicts?: boolean;         // Force despite conflicts
  conflictOverrideReason?: string;     // Why we're ignoring conflicts
}
```

**Response (201 Created) — Commit Mode:**
```typescript
{
  schedule: {
    id: UUID;
    patternIds: UUID[];
    startDate: Date;
    endDate: Date;
    totalGenerated: 42;
    assigned: 38;
    unassigned: 4;
    status: 'PUBLISHED';
    publishedAt: Timestamp;
    publishedBy: UUID;
  }
}
```

**Status Codes:**
- `200` — Preview successful (no changes to DB)
- `201` — Schedule committed to database
- `400` — Validation error (invalid date range, pattern not found, etc.)
- `409` — Conflicts detected, need `overrideConflicts=true` to proceed
- `422` — Authorization violation (would exceed state limits)

#### GET `/api/schedules/{scheduleId}/visits`
Get all visits in a schedule.

**Query Params:**
- `status` (optional) — Filter by visit status
- `assignedOnly` (optional) — Show only assigned visits
- `hasConflicts` (optional) — Show only visits with conflicts

**Response:**
```typescript
{
  data: Visit[];
  total: number;
  assigned: number;
  unassigned: number;
  withConflicts: number;
}
```

---

### 4.3 Conflict Detection

#### POST `/api/schedules/detect-conflicts`
Check for conflicts without modifying anything. Useful for preview or validation.

**Request:**
```typescript
{
  visits: [
    {
      visitId?: UUID;                  // If updating existing visit
      clientId: UUID;
      scheduledDate: Date;
      scheduledStartTime: string;
      scheduledEndTime: string;
      assignedCaregiverId?: UUID;
    }
  ];
  
  checkOptions: {
    checkCaregiver: true;              // Caregiver double-bookings
    checkAuthorization: true;          // Auth hours/visits
    checkState: true;                  // State-specific rules
    checkAvailability: true;           // Caregiver availability
  };
  
  stateCode?: string;                  // TX, FL, etc.
}
```

**Response:**
```typescript
{
  conflicts: ConflictWarning[];        // All found conflicts
  canProceed: boolean;                 // Safe to proceed without override
  estimatedAuthUtilization: 0.85;      // How much auth used
}
```

**Status Codes:**
- `200` — Results returned (may include conflicts)
- `400` — Invalid request
- `422` — Unresolvable state-specific conflict

#### GET `/api/visits/{visitId}/conflicts`
Check conflicts for a single visit (useful for detail page).

**Response:**
```typescript
{
  visitId: UUID;
  hasConflict: boolean;
  conflicts: ConflictWarning[];
  suggestions: {
    alternativeDateTimes?: [{ date: Date; startTime: string }];
    alternativeCaregivers?: { id: UUID; name: string }[];
  };
}
```

---

### 4.4 Mass Edit Operations

#### POST `/api/schedules/mass-edit`
Bulk edit multiple visits at once.

**Request:**
```typescript
{
  operationType: 'RESCHEDULE' | 'ASSIGN' | 'CANCEL' | 'UPDATE';
  visitIds: [UUID, UUID, UUID];        // Which visits to edit
  
  // RESCHEDULE operation
  newDate?: Date;
  newStartTime?: string;
  newEndTime?: string;
  
  // ASSIGN operation
  caregiverId?: UUID;
  assignmentMethod?: 'MANUAL' | 'AUTO_MATCH';
  
  // CANCEL operation
  cancelReason?: string;
  notifyCaregiver?: boolean;
  
  // All operations
  detectConflicts: true;               // Check first
  overrideConflicts?: boolean;         // Force if conflicts
  conflictOverrideReason?: string;
  
  notes?: string;
  operationReason?: string;            // "Caregiver called in sick", etc.
}
```

**Response (200 OK) — Preview Mode:**
```typescript
{
  operationType: 'RESCHEDULE';
  targetVisitCount: 12;
  
  preview: {
    successCount: 11;
    failureCount: 1;
    details: [
      {
        visitId: UUID;
        currentValue: '2026-10-01 09:00';
        newValue: '2026-10-02 09:00';
        status: 'SUCCESS';
        conflict: null;
      },
      {
        visitId: UUID;
        currentValue: '2026-10-01 14:00';
        newValue: '2026-10-02 14:00';
        status: 'CONFLICT';
        conflict: {
          type: 'CAREGIVER_DOUBLE_BOOK';
          message: '...';
        };
      }
    ];
  };
  
  conflicts: ConflictWarning[];
}
```

**Commit Mode (add `confirm: true`):**
```typescript
{
  operationType: 'RESCHEDULE';
  visitIds: [UUID, UUID, UUID];
  newDate: Date;
  
  confirm: true;                       // Actually do it
  detectConflicts: true;
  overrideConflicts: false;
}
```

**Response (201 Created):**
```typescript
{
  operationId: UUID;
  operationType: 'RESCHEDULE';
  visitIds: [UUID, UUID, UUID];
  
  applied: 11;
  failed: 1;
  errors: [
    {
      visitId: UUID;
      error: 'CONFLICT_DETECTED';
      message: '...';
    }
  ];
  
  createdAt: Timestamp;
  canUndo: true;
}
```

**Status Codes:**
- `200` — Preview only
- `201` — Changes applied
- `400` — Validation error
- `409` — Conflicts detected (show in preview, needs override)
- `422` — Some visits failed (show which ones)

#### POST `/api/schedules/mass-edit/{operationId}/undo`
Undo a mass edit operation (if still possible).

**Response (200 OK):**
```typescript
{
  operationId: UUID;
  undoneAt: Timestamp;
  changesReverted: 11;
  status: 'UNDONE';
}
```

**Status Codes:**
- `200` — Successfully undone
- `400` — Operation already undone or too old to undo
- `404` — Operation not found

---

## 5. Service Layer Architecture

### 5.1 ScheduleGenerationService

**Purpose:** Expand patterns into visits, validate, assign, and handle conflicts.

**Key Methods:**

```typescript
class ScheduleGenerationService {
  async generateSchedulePreview(
    request: ScheduleGenerationRequest
  ): Promise<ScheduleGenerationResponse>;
  
  async generateScheduleAndCommit(
    request: ScheduleGenerationRequest
  ): Promise<Schedule>;
  
  private async expandPattern(
    pattern: ServicePattern,
    startDate: Date,
    endDate: Date
  ): Promise<Partial<Visit>[]>;
  
  private async validateAuthorization(
    visits: Partial<Visit>[],
    pattern: ServicePattern
  ): Promise<AuthorizationWarning[]>;
  
  private async applyAutoAssignment(
    visits: Partial<Visit>[],
    pattern: ServicePattern
  ): Promise<Visit[]>;
  
  private async detectConflicts(
    visits: Partial<Visit>[],
    pattern: ServicePattern
  ): Promise<ConflictWarning[]>;
}
```

**Algorithm: Expand Pattern**
```
Input: ServicePattern, startDate, endDate
Output: Array of Visit objects ready to insert

1. Get recurrence rule from pattern
2. For each occurrence in date range:
   a. If pattern.recurrence.daysOfWeek = [MON, WED, FRI]
      → Generate visits for all matching days
   b. Check pattern.recurrence.excludedDates → skip if in list
   c. Check pattern.recurrence.occurrences → stop if N reached
   d. Check pattern.recurrence.untilDate → stop if reached
3. For each date:
   a. Create Visit with:
      - scheduledDate = date
      - scheduledStartTime = pattern.recurrence.startTime
      - scheduledEndTime = pattern.recurrence.endTime
      - patternId = pattern.id
      - status = 'UNASSIGNED'
      - assignmentMethod = 'PENDING' (will be set by auto-assign)
   b. Copy task IDs, requirements, notes from pattern
4. Return array of Visit objects
```

**Algorithm: Validate Authorization**
```
Input: Array of visits, ServicePattern with auth limits
Output: Array of AuthorizationWarning objects

For each visit in visits:
  1. Get authorization details from pattern:
     - authorizedHoursPerWeek
     - authorizedVisitsPerWeek
     - authorizationStartDate / authorizationEndDate
  
  2. Check expiration:
     if visit.scheduledDate > pattern.authorizationEndDate
       → Emit WARNING: "Authorization expired"
  
  3. Check weekly visit limit:
     visits_this_week = count(visits where 
       week(scheduledDate) == week(visit.scheduledDate))
     if visits_this_week > authorizedVisitsPerWeek
       → Emit WARNING: "Exceeds authorized visits/week"
  
  4. Check weekly hours limit:
     hours_this_week = sum(duration for visits in same week)
     if hours_this_week > authorizedHoursPerWeek
       → Emit WARNING: "Exceeds authorized hours/week"
  
  5. Return array of warnings
```

### 5.2 ConflictDetectionEngine

**Purpose:** Real-time detection of scheduling, authorization, and state-specific conflicts.

```typescript
class ConflictDetectionEngine {
  async detectConflicts(
    visits: (Visit | Partial<Visit>)[],
    options: ConflictDetectionOptions
  ): Promise<ConflictWarning[]>;
  
  private async checkCaregiverDoubleBook(
    visits: Visit[],
    caregiverId: UUID
  ): Promise<ConflictWarning[]>;
  
  private async checkAuthorizationLimits(
    visits: Visit[],
    pattern: ServicePattern
  ): Promise<ConflictWarning[]>;
  
  private async checkStateRules(
    visits: Visit[],
    stateCode: string
  ): Promise<ConflictWarning[]>;
  
  private async checkCaregiverAvailability(
    visits: Visit[],
    caregiverId: UUID
  ): Promise<ConflictWarning[]>;
}
```

**Conflict Detection Rules:**

| Conflict Type | Check | Source |
|---------------|-------|--------|
| `CAREGIVER_DOUBLE_BOOK` | Same caregiver, overlapping times on same day | Visit + Assignment data |
| `NO_CAREGIVER_SKILL` | No caregiver has required skills | Caregiver + Visit requirements |
| `AUTH_HOURS_EXCEEDED` | Would exceed authorized hours/week | ServicePattern + Visit |
| `AUTH_VISITS_EXCEEDED` | Would exceed authorized visits/week | ServicePattern + Visit |
| `AUTH_EXPIRED` | Authorization end date has passed | ServicePattern |
| `CAREGIVER_UNAVAILABLE` | Caregiver not marked available these hours | CaregiverAvailability schedule |
| `RN_SUPERVISION_DUE` | Last RN visit > pattern.rnSupervisionFrequencyDays | Visit history |
| `STATE_RULE_VIOLATION` | Violates state-specific requirement (TX geofence, FL Level 2 screening, etc.) | State rule engine |
| `LOCATION_NOT_VERIFIED` | Client address missing or incomplete | Visit.address |
| `GEOFENCE_VIOLATION` | Pattern requires GPS but geofence not set | Pattern + location data |

### 5.3 MassEditService

**Purpose:** Apply bulk operations to multiple visits with transaction safety.

```typescript
class MassEditService {
  async previewMassEdit(
    operationType: string,
    visitIds: UUID[],
    changes: Record<string, any>
  ): Promise<MassEditPreview>;
  
  async commitMassEdit(
    operationType: string,
    visitIds: UUID[],
    changes: Record<string, any>,
    overrideConflicts?: boolean
  ): Promise<MassEditOperation>;
  
  async undoMassEdit(
    operationId: UUID
  ): Promise<void>;
  
  private async applyBulkReschedule(
    visitIds: UUID[],
    newDate: Date,
    newStartTime: string,
    newEndTime: string
  ): Promise<{ applied: number; failed: VisitEditError[] }>;
  
  private async applyBulkAssign(
    visitIds: UUID[],
    caregiverId: UUID
  ): Promise<{ applied: number; failed: VisitEditError[] }>;
}
```

---

## 6. Database Schema

### New Tables

#### service_patterns
```sql
CREATE TABLE service_patterns (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  branch_id UUID NOT NULL REFERENCES branches(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  
  -- Pattern identity
  name VARCHAR(255) NOT NULL,
  description TEXT,
  pattern_type VARCHAR(50) NOT NULL, -- RECURRING, ONE_TIME, etc.
  
  -- Service definition
  service_type_id UUID REFERENCES service_types(id),
  service_type_name VARCHAR(255),
  task_template_ids UUID[],           -- JSON array
  
  -- Recurrence (stored as JSONB)
  recurrence JSONB NOT NULL, -- { frequency, interval, daysOfWeek, startTime, ... }
  duration_minutes INT NOT NULL,
  flexibility_window_minutes INT,
  
  -- Requirements
  required_skills VARCHAR(255)[],
  required_certifications VARCHAR(255)[],
  preferred_caregivers UUID[],
  blocked_caregivers UUID[],
  gender_preference VARCHAR(20),      -- MALE, FEMALE, NO_PREFERENCE
  language_preference VARCHAR(50),
  
  -- Timing preferences
  preferred_time_of_day VARCHAR(50),  -- EARLY_MORNING, MORNING, etc.
  must_start_by TIME,
  must_end_by TIME,
  
  -- Authorization
  authorized_hours_per_week DECIMAL(10,2),
  authorized_visits_per_week INT,
  authorization_start_date DATE,
  authorization_end_date DATE,
  funding_source_id UUID,
  
  -- Operational
  travel_time_before_minutes INT,
  travel_time_after_minutes INT,
  allow_back_to_back BOOLEAN DEFAULT true,
  
  -- State-specific
  state_code CHAR(2),                -- TX, FL, CA, etc.
  requires_gps_verification BOOLEAN,
  geofence_radius_meters INT,
  requires_rn_supervision BOOLEAN,
  rn_supervision_frequency_days INT,
  
  -- Status
  status VARCHAR(50) NOT NULL,        -- DRAFT, ACTIVE, SUSPENDED, COMPLETED, CANCELLED
  effective_from TIMESTAMP NOT NULL,
  effective_to TIMESTAMP,
  
  -- Metadata
  notes TEXT,
  client_instructions TEXT,
  caregiver_instructions TEXT,
  
  -- Audit
  created_by UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,               -- Soft delete
  is_demo_data BOOLEAN DEFAULT false,
  
  CONSTRAINT service_patterns_org_branch_client CHECK (
    organization_id IS NOT NULL AND branch_id IS NOT NULL AND client_id IS NOT NULL
  )
);

CREATE INDEX idx_service_patterns_client ON service_patterns(organization_id, client_id, status);
CREATE INDEX idx_service_patterns_generation ON service_patterns(pattern_type, status, effective_from);
```

#### schedules
```sql
CREATE TABLE schedules (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  branch_id UUID NOT NULL REFERENCES branches(id),
  client_id UUID NOT NULL REFERENCES clients(id),
  pattern_id UUID REFERENCES service_patterns(id),
  
  -- Schedule period
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  
  -- Generation metadata
  generated_at TIMESTAMP NOT NULL,
  generated_by UUID,
  generation_method VARCHAR(50),      -- AUTO, MANUAL, IMPORT
  
  -- Statistics
  total_visits INT DEFAULT 0,
  scheduled_visits INT DEFAULT 0,
  unassigned_visits INT DEFAULT 0,
  completed_visits INT DEFAULT 0,
  
  -- Status
  status VARCHAR(50) NOT NULL,        -- DRAFT, PUBLISHED, ARCHIVED
  notes TEXT,
  
  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  is_demo_data BOOLEAN DEFAULT false,
  
  CONSTRAINT schedules_valid_dates CHECK (start_date <= end_date)
);

CREATE INDEX idx_schedules_pattern ON schedules(pattern_id, status);
CREATE INDEX idx_schedules_period ON schedules(start_date, end_date, organization_id);
```

#### mass_edit_operations
```sql
CREATE TABLE mass_edit_operations (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  
  operation_type VARCHAR(50) NOT NULL, -- RESCHEDULE, ASSIGN, CANCEL, UPDATE
  target_visit_ids UUID[] NOT NULL,
  
  -- Changes (stored as JSONB)
  changes JSONB NOT NULL, -- { scheduled_date, assigned_caregiver_id, etc. }
  
  -- Metadata
  created_by UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  applied_at TIMESTAMP,
  
  -- Conflict handling
  conflicts_ignored JSONB,            -- Array of ConflictWarning objects
  conflict_override BOOLEAN DEFAULT false,
  
  -- Undo support
  can_undo BOOLEAN DEFAULT true,
  undone_at TIMESTAMP,
  previous_state JSONB,               -- For undo
  
  -- Audit
  is_demo_data BOOLEAN DEFAULT false
);

CREATE INDEX idx_mass_edit_org_date ON mass_edit_operations(organization_id, created_at DESC);
```

### Altered Tables

#### visits (add state-specific columns)
```sql
ALTER TABLE visits ADD COLUMN (
  -- State-specific EVV
  state_code CHAR(2),
  requires_gps_verification BOOLEAN,
  geofence_radius_meters INT,
  
  -- Authorization tracking
  auth_visit_number INT,              -- Which # visit in weekly auth limit
  auth_hours_used DECIMAL(10,2),      -- How many auth hours this uses
  authorization_window_start DATE,    -- Matching week of authorized period
  authorization_window_end DATE
);
```

---

## 7. State-Specific Rules Engine

### Purpose

Different US states have different EVV, supervision, screening, and scheduling requirements. The system must enforce these at:
1. Pattern creation (warn if inconsistent with state rules)
2. Schedule generation (prevent invalid schedules)
3. Assignment (block prohibited assignments)
4. Conflict detection (flag state violations)

### State Rules Database

```typescript
interface StateRule {
  stateCode: string;                  // TX, FL, CA, etc.
  name: string;
  
  // EVV requirements
  evvRequired: boolean;
  gpsRequired: boolean;
  baseGeofenceRadius: number;         // meters
  phoneVerificationAllowed: boolean;
  
  // Supervision requirements
  rnSupervisionRequired: boolean;
  rnSupervisionFrequency?: number;    // days (e.g., 60 for Florida)
  rnSupervisionMinutes?: number;      // e.g., 30 minutes
  
  // Screening requirements
  backgroundScreeningLevel: string;   // LEVEL_1, LEVEL_2, etc.
  backgroundCheckFrequency: number;   // days
  registryChecks?: string[];          // e.g., ["AbuseRegistry", "MisconductRegistry"]
  
  // Scheduling rules
  maxConsecutiveDays?: number;        // Can't work > N consecutive days
  minRestBetweenVisits?: number;      // minutes between consecutive visits
  visitAuthorizationRequired: boolean; // Must have explicit auth
  
  // Billing/payment
  minBillableUnit?: number;           // minutes
  aggregator?: string;                // HHAeXchange, Neon, etc.
  
  // Other
  notes?: string;
}
```

### Example: Texas (HHSC 26 TAC §558)

```typescript
const TEXAS_RULES: StateRule = {
  stateCode: 'TX',
  name: 'Texas - HHSC Regulations 26 TAC §558',
  
  evvRequired: true,
  gpsRequired: true,                  // Mobile EVV visits
  baseGeofenceRadius: 100,            // meters + GPS accuracy
  phoneVerificationAllowed: true,     // Fallback for manual EVV
  
  rnSupervisionRequired: false,       // Depends on service type
  
  backgroundScreeningLevel: 'LEVEL_2', // Based on service
  backgroundCheckFrequency: 365 * 5,   // Every 5 years (HHSC requirement)
  registryChecks: [
    'TexasEmployeeMisconductRegistry',
    'NationalAbuseNeglectRegistry',
  ],
  
  maxConsecutiveDays: 7,              // Reasonable workload
  minRestBetweenVisits: 10,           // minutes for travel
  visitAuthorizationRequired: true,   // Medicaid requires explicit auth
  
  minBillableUnit: 15,                // Minimum 15 minutes billable
  aggregator: 'HHAeXchange',          // HHSC EVV aggregator
};
```

### Implementation

```typescript
class StateRulesEngine {
  private stateRules: Map<string, StateRule> = new Map([
    ['TX', TEXAS_RULES],
    ['FL', FLORIDA_RULES],
    ['CA', CALIFORNIA_RULES],
    // ... all 50 states
  ]);
  
  validatePatternForState(
    pattern: ServicePattern,
    stateCode: string
  ): ValidationError[] {
    // Check that pattern respects state rules
  }
  
  validateScheduleForState(
    visits: Visit[],
    stateCode: string
  ): ConflictWarning[] {
    // Check generated visits against state rules
  }
  
  validateAssignmentForState(
    visit: Visit,
    caregiver: Caregiver,
    stateCode: string
  ): ConflictWarning[] {
    // Check if caregiver can be assigned given state requirements
    // (e.g., background screening current, credentials valid, etc.)
  }
}
```

---

## 8. Frontend Architecture

### 8.1 Pattern Creation Form

**Component:** `ServicePatternForm.tsx`

**Features:**
1. **Basic Info Section**
   - Name, description, pattern type
   - Service type dropdown
   - Effective dates

2. **Recurrence Section**
   - Frequency selector (Daily/Weekly/Biweekly/Monthly/Custom)
   - Dynamic fields for each frequency:
     - Weekly: checkboxes for days
     - Monthly: select dates (1-31)
   - Start/end times
   - Timezone selector
   - Recurrence end (date or occurrence count)

3. **Authorization Section**
   - Authorized hours/week (number input)
   - Authorized visits/week (number input)
   - Authorization period (date range)
   - Funding source selector
   - Live preview: "Estimated X hours/week, Y visits/week"

4. **Caregiver Preferences Section**
   - Preferred caregivers (multi-select)
   - Blocked caregivers (multi-select)
   - Required skills (tag input)
   - Required certifications (multi-select)
   - Gender preference (radio)

5. **State-Specific Section**
   - State code selector (auto-filled from organization)
   - Warnings: "This state requires GPS verification"
   - Checkbox: "Enable GPS verification" (with geofence radius input)
   - Checkbox: "Enable RN supervision" (with frequency days)

6. **Validation Feedback**
   - Real-time validation
   - Highlighting invalid fields
   - Conflict warnings
   - "Ready to generate schedule" → green indicator

**Data Flow:**
```
User fills form
  ↓
onChange event → validate field → show errors
  ↓
Submit button enabled when form valid
  ↓
POST /api/schedules/patterns
  ↓
Success → Navigate to pattern detail
         → Show "Pattern created, ready to generate schedule"
         → Button: "Generate Schedule for next 3 months"
```

### 8.2 Schedule Generation Page

**Component:** `ScheduleGenerationWizard.tsx`

**Flow:**

**Step 1: Select Pattern(s)**
```
"Which patterns would you like to expand?"
  ☐ Mary - Weekly PT Sessions (3 hours/week)
  ☐ James - Twice daily personal care (14 hours/week)
  
"Date range:"
  From: [2026-10-01]  To: [2026-12-31]
```

**Step 2: Generation Options**
```
☑ Automatically assign caregivers (where possible)
☑ Respect authorization limits
☑ Skip holidays (using holiday calendar: [Select calendar...])
☑ Detect conflicts before generating
□ Apply state-specific rules

Advanced:
  □ Override conflicts if necessary
  □ Force-assign even if no skill match
```

**Step 3: Preview Results**
```
Generating schedule for:
  • Mary - Weekly PT Sessions (Oct 1 - Dec 31)
    Expected: 12 visits (36 hours)

Preview Results:
  ✓ Total generated: 12 visits
  ✓ Auto-assigned: 11 visits (Sarah Martinez 9, Bob Williams 2)
  ⚠ Unassigned: 1 visit (Oct 15 - no caregiver available)
  
Conflicts detected:
  ⚠ Oct 6: Sarah double-booked (PT + personal care, 9:00-10:00)
     [Details] [Override]
  ⚠ Oct 28: Would exceed authorization (would use 3.5 of 3 hours/week)
     [Details] [Adjust]

[Preview Table of Visits]
  Date | Time | Caregiver | Status | Notes
  Oct 1 | 9:00-10:00 | Sarah Martinez | ✓ | No conflicts
  Oct 3 | 9:00-10:00 | Sarah Martinez | ✓ | No conflicts
  Oct 6 | 9:00-10:00 | [unassigned] | ⚠ | Conflicts with personal care
  ...

[← Back] [Cancel] [Generate Schedule] (disabled if conflicts shown)
         → After conflicts reviewed:
         [Generate Schedule] (enabled)
```

**Step 4: Confirmation**
```
✓ Schedule generated successfully!

Summary:
  • 12 visits created for Mary
  • 11 auto-assigned
  • 1 needs manual assignment
  • Estimated cost: $1,440 (12 hours × $120/hr)

[View Schedule] [Return to Patterns]
```

### 8.3 Calendar View (Mass Edit)

**Component:** `ScheduleCalendarView.tsx` (enhanced from FC-SCHED-001)

**New Features:**

1. **Multi-select on Calendar**
   - Click-and-drag to select multiple visits
   - Or: checkbox mode with "Select all on [date]"
   - Show selected count in toolbar

2. **Bulk Action Toolbar** (appears when visits selected)
   ```
   Selected: 5 visits
   [Reschedule] [Assign] [Cancel] [More...▼]
   ```

3. **Reschedule Modal (Bulk)**
   ```
   Reschedule 5 visits
   
   Current dates: Oct 1, 2, 3, 6, 8
   
   Options:
   ○ Move to specific date:    [2026-10-10]
   ○ Move forward by:          [3] days
   ○ Move to next available slot for caregiver
   
   Time:
   ○ Keep current times
   ○ Change to:    [09:00] - [10:00]
   
   [Preview] → Shows conflicts
   [Cancel] [Apply]
   ```

4. **Assign Modal (Bulk)**
   ```
   Assign 5 visits to:
   
   ○ Specific caregiver:      [Sarah Martinez ▼]
   ○ Auto-match each visit    (use auto-assignment)
   ○ Round-robin among team
   
   [Preview] → Shows match quality
   [Cancel] [Assign]
   ```

5. **Conflict Preview** (before committing)
   ```
   Rescheduling to Oct 10:
   
   ⚠ Conflicts detected (2):
   • Oct 10, 9:00: Sarah Martinez already has personal care
   • Oct 10, 9:00: Would exceed auth hours this week
   
   Options:
   □ Override: Sarah is OK with double-booking (with note field)
   □ Skip conflicting visits (assign 3 of 5)
   
   [Back] [Apply with overrides]
   ```

---

## 9. Testing Strategy

### 9.1 Unit Tests

**Test Files:**
- `services/__tests__/schedule-generation.test.ts`
  - Test pattern expansion (daily, weekly, monthly, custom)
  - Test recurrence rule parsing
  - Test authorization limit checking
  - Test state-specific rule application
  
- `services/__tests__/conflict-detection.test.ts`
  - Test double-booking detection
  - Test authorization exceeding
  - Test state rule violations
  - Test geofence validation
  
- `services/__tests__/mass-edit.test.ts`
  - Test bulk reschedule
  - Test bulk assignment
  - Test preview vs. commit
  - Test undo functionality

### 9.2 Integration Tests

**Test File:** `e2e/fc-sched-002-recurring.spec.ts`

**Test Scenarios:**

1. **Create and Generate Pattern**
   ```
   1. Create ServicePattern: "Mary - 3x/week PT"
   2. Generate schedule: Oct 1 - Dec 31
   3. Verify: 36 visits created (12 weeks × 3)
   4. Verify: Auto-assigned to preferred caregiver
   5. Verify: No conflicts in simple case
   ```

2. **Authorization Limit Enforcement**
   ```
   1. Create pattern: 3 hours/week max
   2. Generate for Oct (would be 12 hours)
   3. Verify: Conflict warning appears
   4. Verify: System only creates enough visits for limit
   ```

3. **Conflict Detection and Override**
   ```
   1. Create 2 patterns for same caregiver
   2. Schedule them to overlap
   3. Verify: Conflicts detected in preview
   4. Override conflicts
   5. Verify: Visits created despite conflict
   6. Verify: Conflict recorded in audit trail
   ```

4. **State-Specific Rules (Texas)**
   ```
   1. Create pattern in TX organization
   2. Verify: GPS verification required checkbox shown
   3. Enable GPS, set geofence radius
   4. Generate schedule
   5. Verify: All visits marked `requires_gps_verification`
   6. Verify: geofenceRadiusMeters = 100
   ```

5. **Mass Edit: Bulk Reschedule**
   ```
   1. Create pattern with 10 visits
   2. Select all 10 on calendar
   3. Click "Reschedule" → move forward 1 week
   4. Preview shows all 10 would move
   5. Click "Apply"
   6. Verify: All 10 dates changed by +7 days
   7. Verify: Undo available
   8. Click undo
   9. Verify: Dates reverted to original
   ```

6. **Mass Edit: Bulk Assign**
   ```
   1. Create pattern with 5 unassigned visits
   2. Select 5 on calendar
   3. Click "Assign" → select Sarah Martinez
   4. Preview shows match scores
   5. Click "Apply"
   6. Verify: All 5 assigned to Sarah
   7. Verify: Notifications sent to Sarah
   ```

---

## 10. Implementation Roadmap

### Phase 1: Data Models & Core Services (Weeks 1-2)

**Tasks:**
1. Create `service_patterns`, `schedules`, `mass_edit_operations` tables
2. Implement `ServicePatternRepository` (CRUD + queries)
3. Implement `ScheduleGenerationService` with:
   - Pattern expansion algorithm
   - Authorization validation
   - Basic conflict detection
4. Add TypeScript types for all new entities
5. Write unit tests for services

**Exit Criteria:**
- `npm run test` passes for all new tests
- Database migrations run successfully
- Service methods callable from controller

### Phase 2: API Layer (Weeks 2-3)

**Tasks:**
1. Create REST endpoints:
   - POST `/api/schedules/patterns` (create)
   - GET `/api/schedules/patterns` (list)
   - GET `/api/schedules/patterns/{id}` (detail)
   - PUT `/api/schedules/patterns/{id}` (update)
   - DELETE `/api/schedules/patterns/{id}` (soft delete)

2. Implement `/api/schedules/generate` with:
   - Preview mode (no commit)
   - Commit mode with override
   - Conflict detection response

3. Add `/api/schedules/detect-conflicts` (standalone)

4. Write API integration tests

**Exit Criteria:**
- All endpoints return 200/201 for valid requests
- Validation errors return 400
- Conflicts return 409 with details
- CI/CD passes (lint, typecheck, test, build)

### Phase 3: State Rules Engine (Week 3)

**Tasks:**
1. Implement `StateRulesEngine` with Texas & Florida rules
2. Add state validation to pattern creation
3. Add state validation to schedule generation
4. Wire state code from organization to patterns
5. Display state warnings in UI

**Exit Criteria:**
- Pattern creation validates against state rules
- Schedule generation shows state-specific conflicts
- e2e tests pass for TX and FL examples

### Phase 4: Mass Edit Services (Week 4)

**Tasks:**
1. Implement `MassEditService`:
   - Bulk reschedule
   - Bulk assign
   - Bulk cancel
2. Add `/api/schedules/mass-edit` endpoint
3. Implement preview + commit flow
4. Implement undo mechanism
5. Add audit logging

**Exit Criteria:**
- All mass edit operations preview without errors
- Commit applies changes atomically
- Undo reverts changes successfully
- Conflicts detected on preview

### Phase 5: Frontend UI (Weeks 5-6)

**Tasks:**
1. Build `ServicePatternForm.tsx`
   - Recurrence selector (daily/weekly/monthly)
   - Authorization fields
   - State-specific options
   - Real-time validation

2. Build `ScheduleGenerationWizard.tsx`
   - Pattern selection
   - Date range picker
   - Generation options
   - Preview table
   - Conflict resolution flow

3. Enhance `ScheduleCalendarView.tsx`
   - Multi-select mode
   - Bulk action toolbar
   - Reschedule/assign modals
   - Conflict preview before commit

4. Add `OperationUndoNotification`
   - Shows "Operation completed" + "Undo" button
   - Time-limited (5 minute window)

**Exit Criteria:**
- All forms validate and show errors
- Calendar view supports multi-select
- Bulk operations preview without errors
- Undo button functional and well-integrated

### Phase 6: Testing & Refinement (Week 7)

**Tasks:**
1. Write comprehensive e2e tests (see §9.2)
2. Test all state-specific scenarios (TX, FL)
3. Test edge cases:
   - Pattern with 0 occurrences
   - Pattern expiring mid-schedule
   - Authorization limits at week boundaries
   - Timezone edge cases (DST transitions)
4. Performance testing
   - Generate 1000+ visits
   - Mass edit 500+ visits
5. Load testing
   - Concurrent schedule generation
   - Concurrent conflict detection

**Exit Criteria:**
- All e2e tests pass
- Performance acceptable (< 2s for 1000 visits)
- No memory leaks
- Stress tests pass

### Phase 7: Deployment & Training (Week 8)

**Tasks:**
1. Create database backup strategy
2. Plan gradual rollout (% of users)
3. Monitor metrics:
   - Schedule generation time
   - Conflict detection accuracy
   - Undo rate
4. Gather user feedback
5. Document for support team
6. Create training videos

**Exit Criteria:**
- Deployed to production
- Metrics tracked and alarmed
- Support team trained
- User feedback collected

---

## 11. Risk Mitigation

### Known Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Recurrence rule parsing errors | MEDIUM | HIGH | Comprehensive unit tests + state machine testing |
| Authorization limit edge cases (week boundaries) | MEDIUM | MEDIUM | Explicit tests for boundary conditions |
| Timezone handling (DST) | MEDIUM | MEDIUM | Use IANA timezone library, test across DST transitions |
| State rule engine incomplete | MEDIUM | HIGH | Start with TX/FL, add others incrementally |
| Performance: 1000+ visit generation | LOW | HIGH | Index database properly, pagination for UI |
| Undo window too short (user clicks elsewhere) | LOW | MEDIUM | Make undo window 10 minutes, show prominent notification |
| Conflict override abuse | MEDIUM | MEDIUM | Log all overrides, require reason, audit review |

### Mitigation Strategies

1. **Recurrence Testing**
   - Parameterized tests for all frequency combinations
   - Test Feb 29 leap year edge case
   - Test month-end edge cases (Jan 31 + monthly pattern)

2. **Authorization Limits**
   - Explicit week boundary tests (Sat/Sun/Mon transitions)
   - Test patterns starting/ending mid-week
   - Test multiple patterns competing for same week's hours

3. **Timezone**
   - Store all times as UTC in database
   - Display in user's timezone (from organization settings)
   - Test DST transitions (spring forward, fall back)

4. **State Rules**
   - Start with 2 states (TX, FL) fully tested
   - Add 1 state per sprint (no rush)
   - Regulatory review before each state activation

5. **Performance**
   - Add database indexes on pattern_id, schedule_id, organization_id
   - Paginate visit lists (100 per page in UI)
   - Background job for large schedule generation (> 500 visits)

6. **Undo Reliability**
   - Store previous state in `mass_edit_operations.previous_state`
   - Set undo window to 10 minutes (not 5)
   - Show notification: "Your action can be undone for 10 minutes"

---

## 12. Compliance Considerations

### HIPAA

- **Access Control:** Only users with `schedule:write` permission can create/modify patterns
- **Audit Trail:** All pattern changes logged to `service_pattern_changes` table (optional separate table)
- **Data Minimization:** Don't store unnecessary PHI in pattern descriptions

### State EVV Requirements

**Texas (HHSC 26 TAC §558):**
- ✅ GPS required for mobile visits
- ✅ Geofence tolerance: 100m + GPS accuracy
- ✅ Authorization must be explicit
- ✅ VMUR (correction) process for disputed visits

**Florida (AHCA Chapter 59A-8):**
- ✅ Multi-aggregator support (HHAeXchange, Neon)
- ✅ Level 2 background screening
- ✅ RN supervision tracking (60-day rule)
- ✅ Plan of care review tracking

**Implementation:** See §7 (State-Specific Rules Engine)

---

## 13. API Documentation

### Request/Response Examples

**Create Pattern:**
```bash
curl -X POST http://localhost:3000/api/schedules/patterns \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "organizationId": "ORG-001",
    "branchId": "BRANCH-001",
    "clientId": "CLIENT-001",
    "name": "Mary - Weekly PT",
    "patternType": "RECURRING",
    "serviceTypeId": "SERVICE-PT",
    "serviceTypeName": "Physical Therapy",
    "recurrence": {
      "frequency": "WEEKLY",
      "interval": 1,
      "daysOfWeek": ["MONDAY", "WEDNESDAY", "FRIDAY"],
      "startTime": "09:00",
      "endTime": "10:00",
      "timezone": "America/Chicago"
    },
    "authorizedHoursPerWeek": 3,
    "preferredCaregivers": ["CARE-SARAH"],
    "stateCode": "TX",
    "requiresGPSVerification": true,
    "geofenceRadiusMeters": 100,
    "status": "ACTIVE",
    "effectiveFrom": "2026-10-01T00:00:00Z"
  }'

# Response:
{
  "id": "PATTERN-001",
  "organizationId": "ORG-001",
  "name": "Mary - Weekly PT",
  ... (full ServicePattern)
}
```

**Generate Schedule (Preview):**
```bash
curl -X POST http://localhost:3000/api/schedules/generate \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "patternIds": ["PATTERN-001"],
    "startDate": "2026-10-01",
    "endDate": "2026-12-31",
    "autoAssign": true,
    "detectConflicts": true,
    "preview": true
  }'

# Response:
{
  "schedule": {
    "id": "SCHED-001",
    "totalGenerated": 12,
    "assigned": 11,
    "unassigned": 1,
    "conflicts": [
      {
        "type": "CAREGIVER_DOUBLE_BOOK",
        "severity": "WARNING",
        "message": "Sarah Martinez double-booked on 2026-10-06 09:00-10:00"
      }
    ]
  },
  "preview": {
    "visits": [ ... ],
    "estimatedHours": 12.0,
    "estimatedCost": 1440
  }
}
```

---

## 14. Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Schedule generation time (100 visits) | < 2 seconds | Performance test |
| Conflict detection accuracy | 99%+ | Manual review + regression tests |
| Authorization limit enforcement | 100% | Audit trail review |
| Undo success rate | 99.9%+ | Automated test |
| User satisfaction (mass edit) | 4.5+/5 | Post-launch survey |
| Time saved (recurring pattern) | 10x faster than manual | Time tracking |

---

## 15. Appendix: Glossary

| Term | Definition |
|------|-----------|
| **Service Pattern** | Template defining what recurring services a client needs (e.g., "PT 3x/week") |
| **Recurrence Rule** | RRULE-like specification of when a pattern repeats (e.g., "every Monday/Wed/Fri") |
| **Schedule** | Set of visits generated from a pattern for a specific date range |
| **Conflict** | Scheduling issue that prevents a visit from being created or assigned |
| **Authorization** | Permission from payer (Medicaid, insurance, etc.) to provide a service for a given number of hours/visits |
| **Geofence** | Geographic boundary (GPS) used to verify caregiver is at client location (EVV requirement) |
| **EVV** | Electronic Visit Verification - federal requirement to document visit clock in/out |
| **Mass Edit** | Bulk operation on multiple visits at once (reschedule, assign, cancel) |
| **Undo** | Ability to revert a mass edit operation within a time window |

---

## Document Control

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-20 | Tech Architect | Initial TA spec |

**Status:** DRAFT → Ready for Technical Review → Implementation

---

**Next Steps:**
1. **Review with team** — Gather feedback on architecture
2. **Validate state rules** — Confirm TX/FL requirements accurate
3. **Database design review** — Check migrations and indexes
4. **API contract review** — Finalize request/response formats
5. **Kick off Phase 1** — Data models and core services
