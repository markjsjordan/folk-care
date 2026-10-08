# FC-13: Technical Analysis & Specification
## Initial Visit Workflow: Intake, Baseline Assessment, and Clinical Notes

**Ticket**: FC-13  
**Feature**: Initial Visit Workflow  
**Components**: Client Intake, Baseline Assessment, Visit Notes Documentation  
**Status**: Analysis Complete  
**Analysis Date**: 2026-09-20  

---

## Executive Summary

The **Initial Visit Workflow** is a multi-step comprehensive onboarding system that:
1. **Captures client demographics and insurance** through structured intake forms
2. **Documents baseline health assessments** including ADL/IADL evaluation, cognition, mobility
3. **Records initial visit notes** with clinical observations, vitals, and care plan alignment

This workflow spans **three primary verticals**:
- `client-demographics` - Client onboarding and service eligibility
- `visit-notes` - Clinical documentation and visit records
- `scheduling-visits` - Visit assignment and scheduling

**Architecture**: Distributed across frontend (React), backend services, and PostgreSQL with JSON-B support for flexible state-specific fields.

---

## Codebase Structure Analysis

### 1. Frontend: Client Intake Workflow

**File**: `packages/web/src/pages/clients/ClientIntakeWorkflow.tsx`  
**Size**: 1,512 lines | **Type**: React component with custom state management  
**Purpose**: 7-step wizard for comprehensive client onboarding

#### Workflow Stages (Steps 1-7):

**Step 1: Demographics & Contact**
- First/last name, date of birth, address (line1/2, city, state, postal code)
- Phone (mobile with SMS capability), email
- Emergency contacts (name, relationship, phone)
- Physician information (name, phone)
- Insurance (Medicare/Medicaid/Private/Other)
- Service authorization (number, approved hours, validity dates)

**Step 2: Care Assessment**
- **ADLs** (Activities of Daily Living): bathing, dressing, toileting, transferring, feeding
  - Each mapped to care level: `independent`, `assistance`, `dependent`
- **IADLs** (Instrumental ADLs): housekeeping, laundry, meal prep, medication, transportation
- **Mobility**: ambulatory, walker, wheelchair, bedbound
- **Cognition**: normal, mild, moderate, severe
- **Medical**: conditions, medications (name/dosage/frequency), allergies, dietary needs

**Step 3: Care Plan**
- Service types (personal care, companion, skilled nursing, etc.)
- Visit frequency: daily, 3x/week, 2x/week, weekly
- Visit duration (minutes)
- Preferred times
- Care tasks (checklist-based)
- Goals (free text)

**Step 4: Caregiver Assignment**
- Primary caregiver selection
- Backup caregivers (multiple selection)
- Preferences: gender (no-preference/female/male), languages

**Step 5: Initial Schedule**
- Schedule start date
- Recurring visit schedule (day of week, time, duration)

**Step 6: Consent & Signatures**
- Care agreement, HIPAA, financial responsibility, EVV (Electronic Visit Verification)
- Signature capture (digital signature data)
- Signed date

**Step 7: Review & Submit**
- Final review of all information
- Submit to backend

#### Key Features:
- **Auto-save**: Every 30 seconds to localStorage (not yet persisted to backend)
- **Multi-contact support**: Emergency contacts can be added dynamically
- **Medication tracking**: Add multiple medications with dosage/frequency
- **Flexible arrays**: Tasks, service types, backup caregivers, etc.
- **Demo caregivers**: Hard-coded caregiver pool for demo experience

#### Component State:
```typescript
interface IntakeData {
  // Step 1
  firstName, lastName, dateOfBirth, address, phone, email,
  emergencyContacts[], physician, insurance, authorization
  
  // Step 2
  adls: {bathing, dressing, toileting, transferring, feeding},
  iadls: {housekeeping, laundry, mealPrep, medication, transportation},
  mobility, cognitive, conditions[], medications[], allergies, dietaryNeeds
  
  // Step 3
  serviceTypes[], visitFrequency, visitDuration, preferredTimes[],
  tasks[], goals
  
  // Step 4
  primaryCaregiver, backupCaregivers[], preferences
  
  // Step 5
  scheduleStartDate, visitSchedule[]
  
  // Step 6
  consents: {careAgreement, hipaa, financialResponsibility, evv},
  signature, signedDate
}
```

---

### 2. Backend: Client Demographics Vertical

**Location**: `verticals/client-demographics/`

#### Database Schema

**Table**: `clients` (PostgreSQL)  
**Primary Fields**:
```sql
-- Identity
id (UUID, PK)
organization_id (FK)
branch_id (FK)
client_number (UNIQUE, VARCHAR 50)
first_name, middle_name, last_name, preferred_name
date_of_birth
ssn (encrypted)
gender, pronouns

-- Contact
primary_phone (JSONB)          -- {number, type, canReceiveSMS}
alternate_phone (JSONB)
email
preferred_contact_method
communication_preferences (JSONB)

-- Demographics
language
ethnicity
race (JSONB)
marital_status
veteran_status

-- Residence
primary_address (JSONB)        -- Mandatory
secondary_addresses (JSONB)
living_arrangement (JSONB)
mobility_info (JSONB)

-- Contacts
emergency_contacts (JSONB)    -- Array
authorized_contacts (JSONB)

-- Healthcare
primary_physician (JSONB)
pharmacy (JSONB)
insurance (JSONB)
medical_record_number

-- Service
programs (JSONB)              -- Service programs enrolled
service_eligibility (JSONB)
funding_sources (JSONB)

-- Risk & Safety
risk_flags (JSONB)
allergies (JSONB)
special_instructions (TEXT)
access_instructions (TEXT)

-- Lifecycle
status (VARCHAR 50)           -- PENDING_INTAKE, ACTIVE, INACTIVE, DISCHARGED
intake_date
discharge_date
discharge_reason

-- Metadata
referral_source
notes (TEXT)
custom_fields (JSONB)

-- Audit
created_at, created_by
updated_at, updated_by
version, deleted_at
```

#### State-Specific Extensions

**Texas** (`texas` JSONB field):
```typescript
medicaidMemberId           // Texas Medicaid ID
medicaidProgram            // Type of Medicaid program
hhscClientId               // HHSC community care ID
serviceDeliveryOption      // AGENCY | CDS
planOfCareNumber           // HHSC Form 1746/8606
authorizedServices[]       // List with auth dates/units
currentAuthorization       // Active authorization details
evvEntityId                // HHAeXchange entity ID
evvRequirements            // EVV-specific rules
emergencyPlanOnFile        // Bool + date
disasterEvacuationPlan     // Text
form1746Consent            // ConsentRecord
biometricDataConsent       // ConsentRecord (TX Privacy Act)
releaseOfInformation[]     // Array of release records
acuityLevel                // LOW | MODERATE | HIGH | COMPLEX
starPlusWaiverServices[]   // List of waiver services
```

**Florida** (`florida` JSONB field):
```typescript
medicaidRecipientId        // FL Medicaid ID
managedCarePlan            // MCO information
apdWaiverEnrollment        // Agency for Persons with Disabilities
doeaRiskClassification     // LOW | MODERATE | HIGH
planOfCareId               // AHCA Form 484 adaptation
planOfCareReviewDate       // Mandatory 60/90-day reviews
nextReviewDue
authorizedServices[]
evvAggregatorId            // HHAeXchange or Netsmart ID
evvSystemType              // HHAX | NETSMART | OTHER
smmcProgramEnrollment      // Statewide Medicaid Managed Care
ltcProgramEnrollment       // Long-Term Care
rnSupervisorId             // Supervised RN for 59A-8.0095
lastSupervisoryVisit
nextSupervisoryVisitDue
supervisoryVisitFrequency  // Days
hurricaneZone              // Disaster planning
biomedicalWasteExposure[]
ahcaLicenseVerification
backgroundScreeningStatus // COMPLIANT | PENDING | NON_COMPLIANT
```

#### Key Types

**File**: `verticals/client-demographics/src/types/client.ts`

```typescript
export interface Client extends Entity, SoftDeletable {
  // Demographics
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  ssn?: string; // Encrypted
  
  // Contact
  primaryPhone?: ContactPhone;
  email?: string;
  
  // Address (required)
  primaryAddress: Address;
  
  // Service info
  status: ClientStatus;  // PENDING_INTAKE | ACTIVE | INACTIVE | DISCHARGED
  intakeDate?: Date;
  
  // State-specific data
  stateSpecificData?: StateSpecificClientData;
}

export type CreateClientInput = Omit<Client, keyof Entity | keyof SoftDeletable>;
```

#### Service Layer

**File**: `verticals/client-demographics/src/service/client-service.ts`

**Key Methods**:
- `createClient(input, context)` - Creates new client with validation
  - Generates unique client number
  - Geocodes address automatically
  - Sets initial status to `PENDING_INTAKE`
  - Validates state-specific requirements
  - Triggers audit logging

- `updateClient(id, input, context)` - Updates client record
  - Version-based optimistic locking
  - Incremental geocoding on address changes
  - Audit trail for all changes

- `searchClients(filters, context)` - Advanced search
  - Full-text search on name/client number
  - Location-based filtering
  - State-specific filtering
  - Pagination support

**Validation**:
- Zod schema-based validation
- State-specific validators for TX/FL
- Phone number formatting
- Address validation
- Insurance eligibility verification

#### Repository Pattern

**File**: `verticals/client-demographics/src/repository/client-repository.ts`

Implements data access abstraction:
- `create(client)` - Insert new record
- `findById(id)` - Fetch single client
- `findByClientNumber(number, organizationId)` - Look up by number
- `search(filters, pagination)` - Advanced search with filters
- `update(client)` - Persist changes
- `delete(id)` - Soft delete

---

### 3. Visit Notes Vertical

**Location**: `verticals/visit-notes/`

#### Database Schema

**Table**: `visit_notes` (PostgreSQL)  
**Purpose**: Immutable clinical documentation from caregiver visits

**Primary Fields**:
```sql
-- Foreign keys
id (UUID, PK)
visit_id (FK → visits)
evv_record_id (FK → evv_records)
organization_id (FK)
caregiver_id (FK)

-- Note content
note_type (VARCHAR)           -- GENERAL | CLINICAL | INCIDENT | TASK
note_text (TEXT)              -- Plain text
note_html (TEXT)              -- Rich text HTML
template_id (UUID, optional)  -- Template used

-- Activities & Assessment
activities_performed (JSONB)
client_mood (VARCHAR)         -- EXCELLENT | GOOD | FAIR | POOR | DISTRESSED | UNRESPONSIVE
client_condition_notes (TEXT)

-- Incident tracking
is_incident (BOOLEAN)
incident_severity (VARCHAR)   -- LOW | MEDIUM | HIGH | CRITICAL
incident_description (TEXT)
incident_reported_at (TIMESTAMP)

-- Voice-to-text
is_voice_note (BOOLEAN)
audio_file_uri (TEXT)         -- S3 URL
transcription_confidence (DECIMAL 0.0-1.0)

-- Immutability (24-hour edit window)
is_locked (BOOLEAN)
locked_at (TIMESTAMP)
locked_by (UUID)
lock_reason (TEXT)

-- Signatures (multi-party)
requires_signature (BOOLEAN)

-- Caregiver signature
caregiver_signed (BOOLEAN)
caregiver_signature_data (TEXT)    -- Base64 image
caregiver_signature_url (TEXT)
caregiver_signed_at (TIMESTAMP)
caregiver_signature_device (TEXT)
caregiver_signature_ip (INET)

-- Client/family signature
client_signed (BOOLEAN)
client_signature_data (TEXT)
client_signature_url (TEXT)
client_signed_at (TIMESTAMP)
client_signer_name (VARCHAR)
client_signer_relationship (VARCHAR)
client_signature_device (TEXT)
client_signature_ip (INET)

-- Supervisor signature
supervisor_signed (BOOLEAN)
supervisor_signed_by (UUID)
supervisor_signature_data (TEXT)
supervisor_signature_url (TEXT)
supervisor_signed_at (TIMESTAMP)
supervisor_comments (TEXT)

-- Sync tracking (mobile offline)
is_synced (BOOLEAN)
sync_pending (BOOLEAN)
synced_at (TIMESTAMP)

-- Audit
created_at, created_by
updated_at, updated_by
deleted_at
```

#### Note Templates

**Table**: `note_templates`  
```sql
id (UUID, PK)
organization_id (FK)
template_name (VARCHAR)
template_type (VARCHAR)      -- INITIAL_VISIT | ROUTINE | INCIDENT | etc.
content_template (TEXT)      -- Handlebars/Mustache template
required_fields (JSONB)      -- Fields that must be completed
optional_fields (JSONB)
is_active (BOOLEAN)
created_at, created_by
```

#### Visit Note Type Hierarchy

```typescript
export type VisitNoteType = 
  | 'GENERAL'      // Standard visit documentation
  | 'CLINICAL'     // Clinical observations, vitals, assessments
  | 'INCIDENT'     // Incident/accident reports
  | 'TASK'         // Task-specific notes (medication, wound care, etc.)

export type ClientMood =
  | 'EXCELLENT'    // Positive, engaged
  | 'GOOD'         // Normal, alert
  | 'FAIR'         // Somewhat withdrawn
  | 'POOR'         // Significant withdrawal
  | 'DISTRESSED'   // Emotional distress
  | 'UNRESPONSIVE' // No communication

export type IncidentSeverity =
  | 'LOW'          // Minor issue, self-resolved
  | 'MEDIUM'       // Requires attention, no injury
  | 'HIGH'         // Significant incident with minor injury
  | 'CRITICAL'     // Serious injury, medical emergency
```

#### Compliance Features

**Immutability**:
- Notes locked 24 hours after creation
- Cannot edit locked notes, only add supervisor comments
- Lock reason field documents why note was locked

**Signature Workflow**:
- Caregiver signs at point of care (mobile or web)
- Optional client/family signature (family engagement feature)
- Supervisor signature for quality assurance
- All signatures include: timestamp, device type, IP address

**Audit Trail**:
- Created by/at fields track initial entry
- Updated by/at tracks any modifications (before lock)
- Deleted at supports soft delete for HIPAA compliance

**Mobile Sync**:
- `is_synced` flag tracks upload status
- `sync_pending` indicates offline-created notes awaiting sync
- Ensures EVV compliance even with poor connectivity

---

### 4. Scheduling Visits

**Location**: `verticals/scheduling-visits/`

**Purpose**: Coordinates initial visit scheduling based on intake workflow

**Key Integration Points**:
- Uses client `primaryAddress` for geofencing (TX/FL EVV requirements)
- Uses caregiver preferences from intake for matching
- Creates initial visit events after intake completion
- Links visit to initial assessment baseline

---

## Workflow State Machine

### Client Lifecycle

```
PENDING_INTAKE
    ↓
    [Client Intake Workflow completes]
    ↓
PENDING_INITIAL_VISIT
    ↓
    [First visit scheduled & assigned]
    ↓
ACTIVE
    ↓
    [Service continues...]
    ↓
INACTIVE (Pause) or DISCHARGED (End)
```

### Initial Visit Documentation

```
Visit Scheduled
    ↓ [Caregiver accepts assignment]
Visit Assigned to Caregiver
    ↓ [Caregiver arrives, checks in via EVV]
Visit Started (EVV Clock-In)
    ↓
Visit Note Created
    ├─ Activities performed
    ├─ Client assessment (mood, condition)
    ├─ Baseline measurements (vitals if applicable)
    └─ Care plan alignment notes
    ↓
Visit Note Signed (Caregiver)
    ↓ [Optional: Client/family signature]
    ↓
Visit Ended (EVV Clock-Out)
    ↓
Supervisor Review (optional)
    ↓
Note Locked (24 hours after creation)
```

---

## Integration Points

### 1. Intake Workflow → Client Demographics

**Flow**:
```
ClientIntakeWorkflow (React)
  ↓
useCreateClient() hook
  ↓
POST /api/clients
  ↓
ClientService.createClient()
  ↓
ClientRepository.create()
  ↓
clients table INSERT
```

**Data Mapping**:
- IntakeData.firstName → Client.firstName
- IntakeData.address → Client.primaryAddress
- IntakeData.insurance → Client.insurance (JSONB)
- IntakeData.physician → Client.primaryPhysician (JSONB)
- IntakeData.[ADLs/IADLs] → Client.serviceEligibility.assessmentResults (JSONB)

### 2. Client Demographics → Scheduling

**Trigger**: After client created with status `ACTIVE`
- Uses `primaryAddress` + `serviceDeligeryOption`
- Queries available caregivers based on:
  - Gender preference
  - Language requirements
  - Skill matching (care level)
  - Geographic proximity
- Creates visit calendar events

### 3. Scheduling → Visit Notes

**On First Visit Assignment**:
- Links visit record to client baseline assessment
- Pre-populates note template with client ADL/IADL data
- Sets note type to `CLINICAL` (not `GENERAL`)
- Marks requires_signature = true

---

## Current Implementation Status

### ✅ Implemented

1. **Client Intake Workflow UI** (`ClientIntakeWorkflow.tsx`)
   - 7-step wizard complete
   - State management, validation, auto-save
   - Demo caregiver list

2. **Client Demographics Backend**
   - Database schema (20251030214712_create_clients_table.ts)
   - Service layer with validation
   - Repository pattern implementation
   - Client audit service

3. **Visit Notes Schema**
   - Table structure with signature fields
   - Template support
   - Note type hierarchy
   - Compliance fields (locking, audit trail)

4. **State-Specific Extensions**
   - Texas fields (HHSC, HHAeXchange, acuity)
   - Florida fields (AHCA, RN supervision, MCO)
   - Validation schemas for each state

### ⚠️ Incomplete

1. **Client Intake → Backend Integration**
   - Frontend has `createClientMutation` hook but not fully wired
   - Auto-save goes to localStorage, not backend persistence
   - No step validation before submission

2. **Visit Note Initial Assessment**
   - Template for "Initial Visit" note type not implemented
   - No baseline assessment capture in visit notes
   - No linking of client ADLs to initial visit note

3. **Baseline Assessment Data Structure**
   - No dedicated table for baseline assessments
   - ADL/IADL data stored in client demographics but not in visit context
   - No version control for assessment updates

4. **Mobile Offline Sync**
   - Signature capture infrastructure present but not tested
   - Voice-to-text fields defined but service not integrated

5. **Compliance Workflows**
   - Note locking mechanism defined but not enforced
   - State-specific validation warnings not implemented
   - EVV integration not complete

---

## Technical Debt & Gaps

### Database

1. **Baseline Assessment Versioning**
   - Current design stores assessments in client record
   - No point-in-time history for care level changes
   - Solution: Create `client_baseline_assessments` table with versions

2. **Visit-to-Initial-Assessment Link**
   - Visit notes have no reference to baseline assessment
   - No way to compare current state to initial intake
   - Solution: Add `baseline_assessment_id` FK to visit_notes

3. **Consent Records**
   - State-specific consent types defined but no unified table
   - Solution: Create `client_consents` table with audit trail

### API & Business Logic

1. **Intake Step Validation**
   - No endpoint validation for partial intake data
   - No way to save and resume intake mid-workflow
   - Solution: Create POST /api/clients/intake-session endpoint

2. **Initial Visit Note Template**
   - Template for first visit not created
   - Missing auto-population of baseline data
   - Solution: Create `InitialVisitNoteTemplate` service

3. **Caregiver Assignment Logic**
   - Matching algorithm not implemented
   - No geographic proximity calculation
   - No skill/language matching
   - Solution: Implement matching in scheduling-visits vertical

### Frontend

1. **Error Handling**
   - No error boundaries in intake workflow
   - No validation error display per step
   - No network error retry logic

2. **Mobile Responsiveness**
   - Intake wizard designed for desktop
   - Signature capture UI not tested on mobile

3. **State Persistence**
   - Auto-save uses localStorage only
   - No backend sync on network recovery

---

## Missing Features for MVP

### Required for Initial Visit Workflow v1

1. **Baseline Assessment Table**
   ```sql
   CREATE TABLE client_baseline_assessments (
     id UUID PRIMARY KEY,
     client_id UUID NOT NULL REFERENCES clients(id),
     assessed_by UUID NOT NULL REFERENCES users(id),
     assessment_date TIMESTAMP,
     adl_scores JSONB,      -- bathing, dressing, etc. with scores
     iadl_scores JSONB,
     mobility_assessment VARCHAR,
     cognitive_assessment VARCHAR,
     conditions_at_intake TEXT[],
     medications_at_intake JSONB[],
     allergies_at_intake TEXT[],
     assessor_notes TEXT,
     version INTEGER,
     created_at TIMESTAMP,
     updated_at TIMESTAMP
   );
   ```

2. **Initial Visit Note Type Handler**
   - Create service to auto-populate initial visit notes
   - Link to baseline assessment
   - Validate all required fields completed
   - Enforce caregiver signature

3. **Intake Session Persistence**
   - Save incomplete intakes to backend
   - Allow multi-session workflows
   - Track intake progress percentage

4. **Caregiver Matching**
   - Query geographic proximity (using coordinates from geocoding)
   - Filter by gender preference + language
   - Rank by availability + skill match
   - Suggest top 3 matches to intake coordinator

5. **State-Specific Validation**
   - Texas: Enforce HHSC authorization verification
   - Florida: Validate RN supervision requirements
   - Both: Verify Medicaid eligibility before activation

---

## Dependency Map

```
ClientIntakeWorkflow.tsx
  ├─ useCreateClient() → ClientService
  │   ├─ ClientValidator
  │   ├─ ClientRepository
  │   └─ GeocodingService
  │
  ├─ DEMO_CAREGIVERS (hard-coded)
  │
  └─ navigate('/clients') on success

ClientService
  ├─ generateClientNumber() → Requires org context
  ├─ validateCreate() → Zod schemas
  ├─ geocodeAddress() → Mapbox/Google/Nominatim
  ├─ stateSpecificValidation() → TX/FL rules
  └─ auditService.logCreation()

VisitNoteTemplate
  ├─ client_baseline_assessments table
  ├─ note_templates table
  └─ visit_notes table

SchedulingVisits Integration
  ├─ Queries clients by organizationId
  ├─ Uses client.primaryAddress
  └─ Creates visit_schedule records
```

---

## Code Quality Observations

### Strengths

1. **Type Safety**: Comprehensive TypeScript interfaces throughout
2. **State-Specific Design**: Extensible JSONB fields for regulatory variations
3. **Repository Pattern**: Clean separation of data access concerns
4. **Audit Trail**: Built-in versioning and soft deletes

### Areas for Improvement

1. **Error Handling**: Limited validation feedback in intake workflow
2. **Testing**: No unit tests visible for ClientService or ClientRepository
3. **Documentation**: TypeScript comments sparse compared to codebase size
4. **Validation**: Intake step validation not enforced (can skip required fields)
5. **Mobile**: Signature capture and voice notes not fully implemented

---

## Regulatory Compliance Notes

### Texas (26 TAC §558)

**Critical for Initial Visit**:
- ✅ Verify Medicaid eligibility (HHAeXchange)
- ✅ Validate plan of care authorization
- ❌ Geofence configuration for initial visit location (TODO)
- ❌ Employee Misconduct Registry check on caregiver assignment (TODO)
- ❌ VMUR (Visit Maintenance Unlock Request) workflow (TODO)

### Florida (Chapter 59A-8)

**Critical for Initial Visit**:
- ✅ Document Level 2 background screening status
- ❌ Schedule RN supervision visit (if skilled nursing) (TODO)
- ❌ Plan of care review date scheduling (TODO)
- ❌ Multi-aggregator support (HHAeXchange vs Netsmart) (TODO)

---

## Performance Considerations

### Database

1. **Indexes Needed**:
   - `clients (organization_id, status)` - For active clients query
   - `clients (created_at DESC)` - For recent intakes
   - `visit_notes (visit_id, caregiver_id)` - For visit lookup
   - `client_baseline_assessments (client_id, assessment_date DESC)` - Latest assessment

2. **JSONB Query Performance**:
   - State-specific fields use JSONB efficiently
   - Consider materialized views for common searches
   - No full-text search indexes currently (may need for client search)

### API

1. **Pagination**: Implement for client search results (default 50)
2. **Caching**: Cache caregiver list for matching (TTL 1 hour)
3. **Geocoding**: Cache geocoding results (TTL 90 days)

---

## Security Considerations

### PII Protection

- ✅ SSN field marked as encrypted
- ✅ Soft deletes preserve audit trail
- ❌ No field-level encryption for other sensitive data (medical_record_number, etc.)
- ❌ No data masking for staff with limited access

### Access Control

- ✅ Permission checks in ClientService (clients:create)
- ❌ No field-level access control (some roles shouldn't see SSN)
- ❌ No organization isolation verified in current code

### API Security

- ❌ No rate limiting on client creation endpoint (spam risk)
- ❌ No CSRF protection on form submission
- ❌ Signature data stored as base64 (consider encrypted storage)

---

## Recommendations for Implementation

### Phase 1 (MVP)

1. ✅ Intake workflow frontend → Complete
2. ⚠️ Create baseline assessment table
3. ⚠️ Wire intake form to backend (POST /api/clients)
4. ⚠️ Implement initial visit note auto-population
5. ⚠️ Add state-specific validation warnings

### Phase 2 (Enhancement)

1. Caregiver matching algorithm
2. Intake session persistence (save/resume mid-workflow)
3. Mobile responsive intake wizard
4. Voice-to-text for notes
5. Signature capture integration

### Phase 3 (Compliance)

1. Texas: HHAeXchange geofence configuration
2. Texas: VMUR workflow for corrections
3. Florida: RN supervision scheduling
4. Both: Automated authorization verification
5. Audit dashboard for compliance reporting

---

## Testing Strategy

### Unit Tests

- [ ] ClientService.createClient() with various inputs
- [ ] StateSpecificValidator for TX/FL rules
- [ ] VisitNoteService.createInitialVisitNote()
- [ ] Baseline assessment versioning

### Integration Tests

- [ ] Intake workflow → Client creation → Schedule initial visit
- [ ] Visit assignment → Note creation → Signature workflow
- [ ] State-specific field validation end-to-end

### E2E Tests

- [ ] Complete intake wizard on desktop
- [ ] Complete intake wizard on mobile
- [ ] Initial visit scheduling and note documentation
- [ ] Signature capture and locking workflow

---

## File Locations Reference

**Frontend**:
- Intake Workflow: `packages/web/src/pages/clients/ClientIntakeWorkflow.tsx`
- Client List: `packages/web/src/verticals/client-demographics/pages/`
- Hooks: `packages/web/src/verticals/client-demographics/hooks/useClients.ts`

**Backend**:
- Service: `verticals/client-demographics/src/service/client-service.ts`
- Repository: `verticals/client-demographics/src/repository/client-repository.ts`
- Types: `verticals/client-demographics/src/types/client.ts`
- Validation: `verticals/client-demographics/src/validation/`
- Handlers: `verticals/client-demographics/src/api/client-handlers.ts`

**Database**:
- Migrations: `packages/core/migrations/`
- Base tables: `20251029214712_create_base_tables.ts`
- Clients: `20251030214712_create_clients_table.ts`
- State-specific: `20251030214719_state_specific_fields.ts`

**Visit Notes**:
- Types: `verticals/visit-notes/src/types/index.ts`
- Repository: `verticals/visit-notes/src/repository/visit-note-repository.ts`
- Services: `verticals/visit-notes/src/services/`
- Handlers: `verticals/visit-notes/src/routes/visit-notes-handlers.ts`

---

## Conclusion

The **Initial Visit Workflow** spans three verticals with a sophisticated 7-step intake form, comprehensive client demographics storage with state-specific extensions, and visit documentation with clinical assessment support. The architecture is well-designed but requires:

1. **Database enhancements**: Baseline assessment versioning and visit-to-assessment linking
2. **API wiring**: Connect frontend intake form to backend persistence
3. **Business logic**: Implement initial visit note auto-population and caregiver matching
4. **Compliance workflows**: State-specific validation, authorization verification, RN supervision scheduling

The codebase demonstrates strong fundamentals with TypeScript safety, repository patterns, and audit trail support. Focus should be on completing the integration between frontend intake and backend services, then adding state-specific regulatory workflows.

---

**Analysis prepared by**: Claude Code (AI subagent)  
**Date**: 2026-09-20  
**Repository**: folk-care  
**Verticals**: client-demographics, visit-notes, scheduling-visits
