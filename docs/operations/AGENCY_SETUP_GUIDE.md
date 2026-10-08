# Folk Care Agency/Organization Setup Guide

Complete guide for setting up a new agency/organization with real data in Folk Care, including database schema, data import processes, and configuration workflows.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Database Schema](#database-schema)
3. [Creating a New Organization](#creating-a-new-organization)
4. [User Management & Roles](#user-management--roles)
5. [Configuring State-Specific Settings](#configuring-state-specific-settings)
6. [Importing Data](#importing-data)
7. [Agency Configuration Workflows](#agency-configuration-workflows)
8. [Best Practices](#best-practices)

---

## Architecture Overview

### Multi-Tenant Structure

Folk Care uses a **multi-tenant architecture** where:
- **Organizations** are the root container for all agency data
- **Branches** are sub-locations within an organization (for multi-site agencies)
- **Users** belong to organizations and can access specific branches
- All data (clients, caregivers, visits, EVV records) is scoped to an organization

### Key Entities

```
Organization (Agency)
├── Branches (Locations)
├── Users (Staff with roles/permissions)
├── Programs (Service types: Medicaid, Private Pay, etc.)
├── Clients (Care recipients)
├── Caregivers (Care providers/staff)
├── Visits (Scheduled care visits with EVV)
├── Care Plans (Clinical documentation)
└── Billing (Invoices, payroll, EVV compliance)
```

---

## Database Schema

### Organizations Table

The root entity for multi-tenant isolation.

```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,              -- Display name
  legal_name VARCHAR(255),                 -- Legal registration name
  tax_id VARCHAR(50),                      -- EIN/Tax ID
  license_number VARCHAR(100),             -- State healthcare license
  phone VARCHAR(20),                       -- Main phone
  email VARCHAR(255),                      -- Main contact email
  website VARCHAR(255),                    -- Website URL
  primary_address JSONB NOT NULL,          -- Address (street1, city, state, zip)
  billing_address JSONB,                   -- Separate billing address
  settings JSONB DEFAULT '{}',             -- Organization config (custom fields)
  state_code VARCHAR(2) NOT NULL,          -- State code (TX, FL, etc.)
  status VARCHAR(50) DEFAULT 'ACTIVE',     -- ACTIVE, SUSPENDED, INACTIVE
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by UUID NOT NULL,
  version INTEGER DEFAULT 1,
  deleted_at TIMESTAMP,
  deleted_by UUID
);
```

**Key Fields:**
- `state_code`: Critical for state-specific EVV rules, billing regulations, compliance
- `primary_address`: Must include `street1`, `city`, `state`, `zipCode`
- `settings`: JSONB field for custom configuration (billing preferences, feature flags, etc.)

### Branches Table

Sub-locations for multi-site agencies.

```sql
CREATE TABLE branches (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,              -- Branch/location name
  code VARCHAR(50),                        -- Internal code (e.g., "DOWNTOWN", "NORTH")
  phone VARCHAR(20),
  email VARCHAR(255),
  address JSONB NOT NULL,                  -- Branch address
  service_area JSONB,                      -- Geographic service area definition
  settings JSONB DEFAULT '{}',             -- Branch-specific settings
  status VARCHAR(50) DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by UUID NOT NULL,
  deleted_at TIMESTAMP,
  deleted_by UUID
);
```

### Users Table

System users with authentication and permissions.

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  username VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,    -- PBKDF2 hashed
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  phone VARCHAR(20),
  roles VARCHAR(50)[] DEFAULT '{}',       -- Array: ['ORG_ADMIN', 'COORDINATOR', etc.]
  permissions VARCHAR(100)[] DEFAULT '{}',-- Array of permission strings
  branch_ids UUID[] DEFAULT '{}',         -- Branches user can access
  status VARCHAR(50) DEFAULT 'ACTIVE',
  last_login_at TIMESTAMP,
  password_changed_at TIMESTAMP,
  failed_login_attempts INTEGER DEFAULT 0,
  locked_until TIMESTAMP,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by UUID NOT NULL,
  deleted_at TIMESTAMP,
  deleted_by UUID
);
```

**Valid Roles:**
- `ORG_ADMIN` - Full organization access
- `COORDINATOR` - Care coordination, scheduling, compliance
- `CAREGIVER` - Care delivery, EVV, visit documentation
- `SUPERVISOR` - Caregiver oversight and scheduling
- `BILLING` - Invoice and payment management
- `NURSE` - Clinical oversight
- `FAMILY_MEMBER` - Client/family portal access

### Clients Table

Care recipients/patients.

```sql
CREATE TABLE clients (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  branch_id UUID NOT NULL REFERENCES branches(id),
  client_number VARCHAR(50) NOT NULL,     -- Human-readable ID (unique per org)
  first_name VARCHAR(100) NOT NULL,
  middle_name VARCHAR(100),
  last_name VARCHAR(100) NOT NULL,
  preferred_name VARCHAR(100),
  date_of_birth DATE NOT NULL,
  ssn VARCHAR(255),                       -- Encrypted SSN
  gender VARCHAR(50),
  pronouns VARCHAR(50),
  
  -- Contact information
  primary_phone JSONB,                    -- { "number": "512-555-1234", "type": "MOBILE" }
  alternate_phone JSONB,
  email VARCHAR(255),
  preferred_contact_method VARCHAR(50),   -- PHONE, EMAIL, SMS
  communication_preferences JSONB,
  
  -- Demographics
  language VARCHAR(50),                   -- Primary language
  ethnicity VARCHAR(100),
  race VARCHAR(100)[],
  marital_status VARCHAR(50),
  veteran_status BOOLEAN DEFAULT false,
  
  -- Residence
  primary_address JSONB NOT NULL,
  secondary_addresses JSONB,
  living_arrangement JSONB,               -- Lives alone, with family, etc.
  mobility_info JSONB,                    -- Mobility restrictions
  
  -- Contacts
  emergency_contacts JSONB NOT NULL,      -- Array of emergency contacts
  authorized_contacts JSONB NOT NULL,     -- Array with permissions
  
  -- Healthcare
  primary_physician JSONB,
  pharmacy JSONB,
  insurance JSONB,                        -- Insurance details
  medical_record_number VARCHAR(100),
  
  -- Service information
  programs JSONB NOT NULL,                -- Array of program enrollments
  service_eligibility JSONB NOT NULL,     -- Eligibility details
  funding_sources JSONB,
  
  -- Risk and safety
  risk_flags JSONB NOT NULL,              -- Array: ["FALL_RISK", "COGNITIVE_IMPAIRMENT"]
  allergies JSONB,
  special_instructions TEXT,
  access_instructions TEXT,
  
  -- Status
  status VARCHAR(50) DEFAULT 'PENDING_INTAKE',  -- INQUIRY, PENDING_INTAKE, ACTIVE, INACTIVE, DISCHARGED
  intake_date DATE,
  discharge_date DATE,
  discharge_reason TEXT,
  
  -- Metadata
  referral_source VARCHAR(255),
  notes TEXT,
  custom_fields JSONB,
  
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id),
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by UUID NOT NULL REFERENCES users(id),
  deleted_at TIMESTAMP,
  deleted_by UUID REFERENCES users(id),
  
  UNIQUE(organization_id, client_number)
);
```

### Caregivers Table

Care providers and staff.

```sql
CREATE TABLE caregivers (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  branch_ids UUID[] NOT NULL DEFAULT '{}',     -- Can work at multiple branches
  primary_branch_id UUID NOT NULL REFERENCES branches(id),
  
  -- Identity
  employee_number VARCHAR(50) NOT NULL,   -- Unique per organization
  first_name VARCHAR(100) NOT NULL,
  middle_name VARCHAR(100),
  last_name VARCHAR(100) NOT NULL,
  preferred_name VARCHAR(100),
  date_of_birth DATE NOT NULL,
  ssn VARCHAR(255),                       -- Encrypted
  gender VARCHAR(50),
  pronouns VARCHAR(50),
  
  -- Contact information
  primary_phone JSONB NOT NULL,
  alternate_phone JSONB,
  email VARCHAR(255) UNIQUE NOT NULL,
  preferred_contact_method VARCHAR(50) DEFAULT 'PHONE',
  communication_preferences JSONB,
  
  -- Demographics
  language VARCHAR(50),
  languages VARCHAR(50)[] DEFAULT '{}',  -- Multiple languages
  ethnicity VARCHAR(100),
  race VARCHAR(100)[] DEFAULT '{}',
  
  -- Address
  primary_address JSONB NOT NULL,
  mailing_address JSONB,
  
  -- Emergency contact
  emergency_contacts JSONB NOT NULL DEFAULT '[]',
  
  -- Employment information
  employment_type VARCHAR(50) NOT NULL,  -- FULL_TIME, PART_TIME, PER_DIEM, CONTRACT, TEMPORARY, SEASONAL
  employment_status VARCHAR(50) DEFAULT 'ACTIVE',  -- ACTIVE, ON_LEAVE, SUSPENDED, TERMINATED, RETIRED
  hire_date DATE NOT NULL,
  termination_date DATE,
  termination_reason TEXT,
  rehire_eligible BOOLEAN,
  
  -- Role and permissions
  role VARCHAR(100) NOT NULL,             -- CAREGIVER, SENIOR_CAREGIVER, CNA, HHA, PERSONAL_CARE_AIDE, COMPANION, RN, LPN, THERAPIST, COORDINATOR, SUPERVISOR, SCHEDULER, ADMINISTRATIVE
  permissions VARCHAR(100)[] DEFAULT '{}',
  supervisor_id UUID REFERENCES caregivers(id),
  
  -- Credentials and compliance
  credentials JSONB NOT NULL DEFAULT '[]',        -- Array of certifications
  background_check JSONB,                         -- BGC record
  drug_screening JSONB,                           -- Drug test record
  health_screening JSONB,                         -- Immunizations, health status
  
  -- Training and qualifications
  training JSONB NOT NULL DEFAULT '[]',          -- Training records
  skills JSONB NOT NULL DEFAULT '[]',            -- Skills with proficiency levels
  specializations VARCHAR(100)[] DEFAULT '{}',   -- Special skills/certifications
  
  -- Availability and preferences
  availability JSONB NOT NULL,                   -- Weekly schedule: { "monday": [{"start": "08:00", "end": "17:00"}], ... }
  work_preferences JSONB,                         -- Shift preferences, client preferences
  max_hours_per_week INTEGER,
  min_hours_per_week INTEGER,
  willing_to_travel BOOLEAN DEFAULT false,
  max_travel_distance INTEGER,                   -- in miles
  
  -- Compensation
  pay_rate JSONB NOT NULL,                       -- { "amount": 18.50, "currency": "USD", "type": "HOURLY" }
  alternate_pay_rates JSONB,                     -- Rates by service type
  payroll_info JSONB,                            -- Banking info (encrypted)
  
  -- Performance and compliance
  performance_rating DECIMAL(2, 1),              -- 1.0 to 5.0
  last_review_date DATE,
  next_review_date DATE,
  compliance_status VARCHAR(50) DEFAULT 'PENDING_VERIFICATION',  -- COMPLIANT, PENDING_VERIFICATION, EXPIRING_SOON, EXPIRED, NON_COMPLIANT
  last_compliance_check TIMESTAMP,
  
  -- Scheduling metadata
  reliability_score DECIMAL(3, 2),               -- 0.0 to 1.0
  preferred_clients UUID[],
  restricted_clients UUID[],                     -- Cannot be assigned to these clients
  
  -- Status
  status VARCHAR(50) DEFAULT 'PENDING_ONBOARDING',  -- APPLICATION, INTERVIEWING, PENDING_ONBOARDING, ONBOARDING, ACTIVE, INACTIVE, ON_LEAVE, SUSPENDED, TERMINATED, RETIRED
  status_reason TEXT,
  
  -- Documents
  documents JSONB,
  
  -- Metadata
  notes TEXT,
  custom_fields JSONB,
  
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id),
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by UUID NOT NULL REFERENCES users(id),
  deleted_at TIMESTAMP,
  deleted_by UUID REFERENCES users(id),
  
  UNIQUE(organization_id, employee_number),
  UNIQUE(email),
  CHECK (primary_branch_id = ANY(branch_ids))
);
```

### Programs Table

Service types and funding programs.

```sql
CREATE TABLE programs (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50),
  description TEXT,
  program_type VARCHAR(100),              -- Medicaid, Medicare, Private Pay, Waiver, etc.
  funding_source VARCHAR(100),
  eligibility_criteria JSONB,
  service_types VARCHAR(100)[],           -- PERSONAL_CARE, SKILLED_NURSING, COMPANION, etc.
  hourly_rate DECIMAL(10, 2),
  settings JSONB DEFAULT '{}',
  status VARCHAR(50) DEFAULT 'ACTIVE',
  start_date DATE,
  end_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by UUID NOT NULL,
  deleted_at TIMESTAMP,
  deleted_by UUID
);
```

### EVV State Configuration Table

State-specific EVV and compliance rules.

```sql
CREATE TABLE evv_state_config (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL,
  branch_id UUID,                         -- NULL = applies to all branches
  state_code VARCHAR(2) NOT NULL,         -- TX, FL, etc.
  
  -- Aggregator settings
  aggregator_type VARCHAR(50) NOT NULL,   -- HHAeXchange, Netsmart, HHCR, etc.
  aggregator_entity_id VARCHAR(100) NOT NULL,
  aggregator_endpoint TEXT NOT NULL,
  aggregator_api_key_encrypted TEXT,
  
  -- Program type
  program_type VARCHAR(50) NOT NULL,      -- Which program this applies to
  
  -- Verification settings
  allowed_clock_methods JSONB NOT NULL,   -- [GPS, TELEPHONY, BIOMETRIC, MANUAL]
  requires_gps_for_mobile BOOLEAN DEFAULT true,
  geo_perimeter_tolerance INTEGER DEFAULT 100,  -- meters
  
  -- Grace periods (minutes)
  clock_in_grace_period INTEGER DEFAULT 10,
  clock_out_grace_period INTEGER DEFAULT 10,
  late_clock_in_threshold INTEGER DEFAULT 15,
  
  -- Visit maintenance (TX-specific)
  vmur_enabled BOOLEAN DEFAULT false,              -- VMUR = Visit Maintenance Unlock Request
  vmur_approval_required BOOLEAN DEFAULT true,
  vmur_reason_codes_required BOOLEAN DEFAULT true,
  
  -- Multi-aggregator (FL-specific)
  additional_aggregators JSONB,
  
  -- MCO requirements (FL-specific)
  mco_requirements JSONB,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  effective_from DATE NOT NULL,
  effective_to DATE,
  
  created_at TIMESTAMP DEFAULT NOW(),
  created_by UUID NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by UUID NOT NULL,
  version INTEGER DEFAULT 1
);
```

---

## Creating a New Organization

### Method 1: Using the API (Programmatic)

#### Create Organization via POST /api/organizations/register

```bash
curl -X POST http://localhost:5173/api/organizations/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme Home Care",
    "legalName": "Acme Home Care Services, Inc.",
    "stateCode": "TX",
    "taxId": "12-3456789",
    "licenseNumber": "A-123456",
    "phone": "512-555-1234",
    "email": "contact@acmehomecare.com",
    "website": "https://acmehomecare.com",
    "primaryAddress": {
      "street1": "123 Main Street",
      "street2": "Suite 100",
      "city": "Austin",
      "state": "TX",
      "zipCode": "78701",
      "country": "US"
    },
    "billingAddress": {
      "street1": "456 Oak Avenue",
      "city": "Austin",
      "state": "TX",
      "zipCode": "78702",
      "country": "US"
    },
    "adminUser": {
      "firstName": "John",
      "lastName": "Doe",
      "email": "john.doe@acmehomecare.com",
      "phone": "512-555-5678",
      "password": "SecureP@ss123!"
    }
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "organization": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "name": "Acme Home Care",
      "stateCode": "TX",
      "status": "ACTIVE"
    },
    "adminUserId": "660e8400-e29b-41d4-a716-446655440001"
  }
}
```

### Method 2: Using TypeScript Service

```typescript
import { Database, OrganizationService } from '@folkcare/core';

const db = new Database(process.env.DATABASE_URL);
const orgService = new OrganizationService(db);

const result = await orgService.registerOrganization({
  name: "Acme Home Care",
  stateCode: "TX",
  email: "contact@acmehomecare.com",
  primaryAddress: {
    street1: "123 Main Street",
    city: "Austin",
    state: "TX",
    zipCode: "78701"
  },
  adminUser: {
    firstName: "John",
    lastName: "Doe",
    email: "john.doe@acmehomecare.com",
    password: "SecureP@ss123!"
  }
});

console.log(`Organization ID: ${result.organization.id}`);
console.log(`Admin User ID: ${result.adminUserId}`);
```

### Initial Configuration After Creation

After organization creation, perform these setup steps:

1. **Create branches** for each location
2. **Create programs** for each service type (Medicaid, Private Pay, etc.)
3. **Configure state-specific EVV settings**
4. **Invite team members** with appropriate roles
5. **Load client and caregiver data** from import

---

## User Management & Roles

### User Roles and Permissions

| Role | Can Manage | Can View | Can Report | Use Cases |
|------|-----------|----------|-----------|-----------|
| ORG_ADMIN | Everything | Everything | All reports | Owner, operations director |
| COORDINATOR | Users, schedules, care plans | Clients, caregivers, visits | Compliance, billing | Care coordinator, supervisor |
| CAREGIVER | Own visits | Own visits, client info | Time cards, evaluations | Home health aides, nurses |
| SUPERVISOR | Caregivers, schedules | Staff, clients, compliance | Performance, compliance | Shift supervisors |
| BILLING | Invoices, payroll | Financial records | Billing, payroll | Finance staff |
| NURSE | Care plans, clinical notes | Clients, visits | Clinical outcomes | Nurse supervisors, RNs |
| FAMILY_MEMBER | Messages only | Own client's records | Limited to own client | Family members, POA |

### Creating Users via Invitation

#### Step 1: Admin Creates Invitation

```bash
curl -X POST http://localhost:5173/api/organizations/{orgId}/invitations \
  -H "Authorization: Bearer {adminToken}" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "coordinator@acmehomecare.com",
    "firstName": "Sarah",
    "lastName": "Smith",
    "roles": ["COORDINATOR"],
    "branchIds": ["branch-id-1", "branch-id-2"]
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "invite_token_abc123xyz",
    "invitationLink": "https://folk.care/invitations/accept?token=invite_token_abc123xyz"
  }
}
```

#### Step 2: Invited User Accepts Invitation

```bash
curl -X POST http://localhost:5173/api/invitations/accept \
  -H "Content-Type: application/json" \
  -d '{
    "token": "invite_token_abc123xyz",
    "firstName": "Sarah",
    "lastName": "Smith",
    "password": "SecureP@ss456!",
    "phone": "512-555-9999"
  }'
```

### Creating Users Programmatically (Admin Only)

```typescript
// Create user directly with admin access
const userRepo = new UserRepository(db);

const newUser = await userRepo.createUser({
  organizationId: "org-id",
  username: "sarah.smith",
  email: "sarah@acmehomecare.com",
  passwordHash: hashPassword("SecureP@ss456!"),
  firstName: "Sarah",
  lastName: "Smith",
  phone: "512-555-9999",
  roles: ["COORDINATOR"],
  branchIds: ["branch-id-1"],
  createdBy: "admin-user-id"
});
```

---

## Configuring State-Specific Settings

### State Selection During Organization Creation

When registering an organization, specify the `stateCode`:

```json
{
  "name": "Acme Home Care",
  "stateCode": "TX"  // 2-letter state code
}
```

Valid state codes: AL, AK, AZ, AR, CA, CO, CT, DE, FL, GA, HI, ID, IL, IN, IA, KS, KY, LA, ME, MD, MA, MI, MN, MS, MO, MT, NE, NV, NH, NJ, NM, NY, NC, ND, OH, OK, OR, PA, RI, SC, SD, TN, TX, UT, VT, VA, WA, WV, WI, WY, DC

### Configuring EVV State Rules

Create EVV configuration for each state and program:

#### Texas (TX) - HHAeXchange Configuration

```bash
curl -X POST http://localhost:5173/api/organizations/{orgId}/evv-config \
  -H "Authorization: Bearer {adminToken}" \
  -H "Content-Type: application/json" \
  -d '{
    "branchId": null,                   # null = all branches
    "stateCode": "TX",
    "aggregatorType": "HHAeXchange",
    "aggregatorEntityId": "YOUR_ENTITY_ID",
    "aggregatorEndpoint": "https://www.hhaechange.org/xml/xmlgw.aspx",
    "aggregatorApiKeyEncrypted": "{encrypted-api-key}",
    "programType": "Medicaid",
    "allowedClockMethods": ["GPS", "TELEPHONY", "BIOMETRIC"],
    "requiresGpsForMobile": true,
    "geoPerimeterTolerance": 100,
    "clockInGracePeriod": 10,
    "clockOutGracePeriod": 10,
    "lateClockInThreshold": 15,
    "vmurEnabled": true,                # Visit Maintenance Unlock Request
    "vmurApprovalRequired": true,
    "vmurReasonCodesRequired": true,
    "effectiveFrom": "2025-01-01"
  }'
```

#### Florida (FL) - Netsmart Configuration

```bash
curl -X POST http://localhost:5173/api/organizations/{orgId}/evv-config \
  -H "Authorization: Bearer {adminToken}" \
  -H "Content-Type: application/json" \
  -d '{
    "stateCode": "FL",
    "aggregatorType": "Netsmart",
    "aggregatorEntityId": "YOUR_FL_ENTITY",
    "aggregatorEndpoint": "https://www.netsmart.com/",
    "programType": "Medicaid",
    "allowedClockMethods": ["GPS", "TELEPHONY"],
    "requiresGpsForMobile": true,
    "geoPerimeterTolerance": 150,
    "clockInGracePeriod": 15,
    "clockOutGracePeriod": 15,
    "lateClockInThreshold": 20,
    "additionalAggregators": [
      {
        "aggregatorType": "HHAeXchange",
        "entityId": "SECONDARY_ENTITY",
        "endpoint": "https://www.hhaechange.org/"
      }
    ],
    "mcoRequirements": {
      "supervisoryVisitsRequired": true,
      "supervisoryFrequencyDays": 60,
      "clinicalReviewRequired": true,
      "clinicalReviewFrequencyDays": 90
    },
    "effectiveFrom": "2025-01-01"
  }'
```

### State-Specific Regulatory Considerations

**Texas (26 TAC §558):**
- GPS required for mobile EVV
- 10-minute grace period standard
- 100m base geofence + GPS accuracy allowance
- VMUR process for visit corrections
- HHAeXchange aggregator submission
- Employee Misconduct Registry checks required

**Florida (Chapter 59A-8 AHCA):**
- Level 2 background screening (5-year lifecycle)
- Multi-aggregator support (must support Netsmart, HHAeXchange)
- RN supervision visits every 60 days for skilled nursing
- 15-minute grace period
- 150m base geofence
- Plan of care review every 60/90 days
- MCO requirements

---

## Importing Data

### 1. Import Clients

#### CSV Format

Create `clients.csv`:
```csv
client_number,first_name,last_name,date_of_birth,primary_phone,email,street1,city,state,zipCode,emergency_contact_name,emergency_contact_phone,status
C001,John,Smith,1950-01-15,512-555-1111,john.smith@email.com,123 Oak St,Austin,TX,78701,Jane Smith,512-555-2222,ACTIVE
C002,Mary,Johnson,1955-06-20,512-555-3333,mary.j@email.com,456 Elm Ave,Austin,TX,78702,Bob Johnson,512-555-4444,ACTIVE
C003,Robert,Williams,1948-03-10,512-555-5555,,789 Main St,Austin,TX,78703,Patricia Williams,512-555-6666,ACTIVE
```

#### Import via API

```bash
curl -X POST http://localhost:5173/api/organizations/{orgId}/import/clients \
  -H "Authorization: Bearer {adminToken}" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@clients.csv" \
  -F "branchId={branchId}"
```

#### Import via TypeScript

```typescript
import { ClientRepository } from '@folkcare/core';

const clientRepo = new ClientRepository(db);
const records = [
  {
    organizationId: "org-id",
    branchId: "branch-id",
    clientNumber: "C001",
    firstName: "John",
    lastName: "Smith",
    dateOfBirth: "1950-01-15",
    primaryAddress: {
      street1: "123 Oak St",
      city: "Austin",
      state: "TX",
      zipCode: "78701"
    },
    emergencyContacts: [
      {
        name: "Jane Smith",
        relationship: "Spouse",
        phone: "512-555-2222"
      }
    ],
    status: "ACTIVE",
    createdBy: "admin-user-id"
  }
];

for (const record of records) {
  await clientRepo.createClient(record);
}
```

### 2. Import Caregivers

#### CSV Format

Create `caregivers.csv`:
```csv
employee_number,first_name,last_name,date_of_birth,email,phone,hire_date,employment_type,role,primary_branch_id,languages,certifications
E001,Maria,Garcia,1980-05-12,maria.garcia@email.com,512-555-7777,2023-01-15,FULL_TIME,HOME_HEALTH_AIDE,branch-1,Spanish; English,CPR; First Aid; CNA
E002,James,Brown,1975-08-22,james.brown@email.com,512-555-8888,2023-03-01,PART_TIME,COMPANION,branch-1,English,CPR
E003,Lisa,Chen,1982-11-03,lisa.chen@email.com,512-555-9999,2022-06-20,FULL_TIME,CERTIFIED_NURSING_ASSISTANT,branch-1,Chinese; English,CPR; CNA; TB Test
```

#### Import via TypeScript

```typescript
import { CaregiverRepository } from '@folkcare/core';

const caregiverRepo = new CaregiverRepository(db);

const records = [
  {
    organizationId: "org-id",
    branchIds: ["branch-1"],
    primaryBranchId: "branch-1",
    employeeNumber: "E001",
    firstName: "Maria",
    lastName: "Garcia",
    dateOfBirth: "1980-05-12",
    email: "maria.garcia@email.com",
    primaryPhone: { number: "512-555-7777", type: "MOBILE" },
    hireDate: "2023-01-15",
    employmentType: "FULL_TIME",
    role: "HOME_HEALTH_AIDE",
    primaryAddress: {
      street1: "789 Maple Dr",
      city: "Austin",
      state: "TX",
      zipCode: "78704"
    },
    languages: ["Spanish", "English"],
    credentials: [
      { type: "CPR", status: "ACTIVE", expirationDate: "2026-06-15" },
      { type: "CNA", status: "ACTIVE", expirationDate: "2027-03-20" }
    ],
    availability: {
      monday: [{ start: "08:00", end: "17:00" }],
      tuesday: [{ start: "08:00", end: "17:00" }],
      // ...
    },
    payRate: {
      amount: 18.50,
      currency: "USD",
      type: "HOURLY"
    },
    status: "ACTIVE",
    complianceStatus: "COMPLIANT",
    createdBy: "admin-user-id"
  }
];

for (const record of records) {
  await caregiverRepo.createCaregiver(record);
}
```

### 3. Import Programs

Programs define service types and billing rates.

```typescript
const programRepo = new ProgramRepository(db);

const programs = [
  {
    organizationId: "org-id",
    name: "Medicaid Personal Care Services",
    code: "MED_PCS",
    programType: "Medicaid",
    fundingSource: "Medicaid",
    serviceTypes: ["PERSONAL_CARE", "COMPANION"],
    hourlyRate: 19.50,
    status: "ACTIVE",
    createdBy: "admin-user-id"
  },
  {
    organizationId: "org-id",
    name: "Private Pay Services",
    code: "PRIVATE",
    programType: "PrivatePay",
    fundingSource: "Client",
    serviceTypes: ["PERSONAL_CARE", "COMPANION", "SKILLED_NURSING"],
    hourlyRate: 25.00,
    status: "ACTIVE",
    createdBy: "admin-user-id"
  }
];

for (const program of programs) {
  await programRepo.createProgram(program);
}
```

### 4. Demo Data Seeding

For testing and onboarding, seed comprehensive demo data:

```bash
# Seed demo data for organization
curl -X POST http://localhost:5173/api/organizations/{orgId}/seed-demo \
  -H "Authorization: Bearer {adminToken}"
```

**Creates:**
- 60 sample clients
- 35 sample caregivers
- 600+ scheduled visits
- 50+ care plans
- 40+ family members
- Full visit history with EVV records

All demo records are marked with `is_demo_data = true` for easy cleanup.

#### Clear Demo Data

```bash
curl -X DELETE http://localhost:5173/api/organizations/{orgId}/demo-data \
  -H "Authorization: Bearer {adminToken}"
```

---

## Agency Configuration Workflows

### 1. Onboarding Checklist

```
□ Create Organization
  └─ Name, address, state code, tax ID, license number
  
□ Create Branches
  └─ Headquarters and other locations
  
□ Configure State-Specific Settings
  └─ EVV aggregator credentials
  └─ Grace periods, geofence tolerances
  └─ Compliance rules for state
  
□ Create Programs
  └─ Medicaid PCS
  └─ Private Pay
  └─ Other funding sources
  
□ Invite Team Members
  └─ Admin users (operations)
  └─ Coordinators (care coordination)
  └─ Supervisors (compliance, EVV)
  └─ Billing staff (invoicing, payroll)
  
□ Import Data
  └─ Client roster
  └─ Caregiver roster
  └─ Programs and authorizations
  
□ Configure Compliance Settings
  └─ Background check requirements
  └─ Training requirements
  └─ Credential verification
  └─ Drug screening policies
  
□ Set Up Billing
  └─ Invoice templates
  └─ Payroll schedules
  └─ Rates by program
  
□ Test EVV Workflow
  └─ Create test visits
  └─ Mobile clock in/out
  └─ Verify GPS data capture
  └─ Test aggregator submission
```

### 2. Multi-Site Setup

For agencies with multiple locations:

```typescript
// Create headquarters
const hqBranch = await branchRepo.createBranch({
  organizationId: "org-id",
  name: "Headquarters",
  code: "HQ",
  address: { street1: "123 Main St", city: "Austin", state: "TX", zipCode: "78701" },
  createdBy: "admin-id"
});

// Create satellite offices
const northBranch = await branchRepo.createBranch({
  organizationId: "org-id",
  name: "North Branch",
  code: "NORTH",
  address: { street1: "500 North St", city: "Austin", state: "TX", zipCode: "78702" },
  serviceArea: {
    center: { lat: 30.35, lon: -97.71 },
    radiusMiles: 5
  },
  createdBy: "admin-id"
});

// Assign caregivers to multiple branches
const caregiver = {
  branchIds: [hqBranch.id, northBranch.id],
  primaryBranchId: hqBranch.id,
  // ...
};
```

### 3. Credential Management

Configure required credentials for compliance:

```typescript
// Set up credential tracking
const credentialTypes = [
  {
    name: "CPR Certification",
    expirationMonths: 24,
    required: true,
    roles: ["CAREGIVER", "SENIOR_CAREGIVER"]
  },
  {
    name: "TB Test",
    expirationMonths: 12,
    required: true,
    roles: ["CAREGIVER", "CERTIFIED_NURSING_ASSISTANT"]
  },
  {
    name: "Background Check",
    expirationMonths: 60,
    required: true,
    roles: ["CAREGIVER"]
  },
  {
    name: "Nursing License",
    expirationMonths: 24,
    required: true,
    roles: ["NURSE_RN", "NURSE_LPN"]
  }
];

// Track credentials on caregiver records
const caregiver = await caregiverRepo.createCaregiver({
  // ...
  credentials: [
    {
      type: "CPR",
      credentialNumber: "CPR123456",
      issuingAuthority: "American Heart Association",
      issueDate: "2023-06-15",
      expirationDate: "2025-06-15",
      status: "ACTIVE"
    },
    {
      type: "TB Test",
      credentialNumber: "TB-2024-001",
      issueDate: "2024-01-10",
      expirationDate: "2025-01-10",
      status: "ACTIVE"
    }
  ]
});
```

### 4. EVV Configuration by State

#### Texas Configuration Script

```bash
#!/bin/bash
# Configure Folk Care for Texas Medicaid

ORGANIZATION_ID="your-org-id"
ADMIN_TOKEN="your-admin-token"

# Configure HHAeXchange aggregator
curl -X POST http://localhost:5173/api/organizations/$ORGANIZATION_ID/evv-config \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "stateCode": "TX",
    "aggregatorType": "HHAeXchange",
    "aggregatorEntityId": "'$HHAE_ENTITY_ID'",
    "aggregatorEndpoint": "https://www.hhaechange.org/xml/xmlgw.aspx",
    "programType": "Medicaid",
    "allowedClockMethods": ["GPS", "TELEPHONY"],
    "requiresGpsForMobile": true,
    "geoPerimeterTolerance": 100,
    "clockInGracePeriod": 10,
    "clockOutGracePeriod": 10,
    "lateClockInThreshold": 15,
    "vmurEnabled": true,
    "vmurApprovalRequired": true,
    "effectiveFrom": "2025-01-01"
  }'

echo "Texas EVV configuration complete"
```

---

## Best Practices

### 1. Data Quality and Validation

```typescript
// Always validate addresses
function validateAddress(address: any): boolean {
  return (
    address.street1?.trim().length > 0 &&
    address.city?.trim().length > 0 &&
    address.state?.length === 2 &&
    /^\d{5}(-\d{4})?$/.test(address.zipCode)
  );
}

// Validate phone numbers
function validatePhone(phone: string): boolean {
  return /^\d{3}-\d{3}-\d{4}$/.test(phone) || /^\d{10}$/.test(phone);
}

// Validate credentials
function validateCredential(cred: any): boolean {
  const today = new Date();
  const expirationDate = new Date(cred.expirationDate);
  
  if (expirationDate < today) {
    return false; // Expired
  }
  
  return true;
}
```

### 2. Organization Isolation

Folk Care is **multi-tenant by default**. Always ensure:

- All queries filter by `organization_id`
- Users can only access their organization's data
- Middleware validates organization membership
- API responses never leak cross-organization data

```typescript
// Always add organization filter
const clients = await db.query(
  `SELECT * FROM clients 
   WHERE organization_id = $1 AND deleted_at IS NULL`,
  [organizationId]
);

// User can only see their organization
const user = await db.query(
  `SELECT * FROM users 
   WHERE id = $1 AND organization_id = $2`,
  [userId, organizationId]
);
```

### 3. Audit Trail

All mutations are logged automatically. For compliance:

```typescript
// Every create/update records who made the change
const client = await clientRepo.createClient({
  // ...
  createdBy: currentUserId,  // Required
  organizationId: currentUserOrgId  // Required
});

// Access logs track PHI access
const accessLog = {
  eventId: uuid(),
  timestamp: now(),
  userId: currentUserId,
  organizationId: currentUserOrgId,
  eventType: "CLIENT_VIEW",
  resource: "clients",
  resourceId: clientId,
  action: "VIEW",
  result: "SUCCESS"
};
```

### 4. Encryption of Sensitive Data

Sensitive fields should be encrypted at rest:

- SSN (Social Security Number)
- Payroll information (banking details)
- Health screening results
- Some drug screening data

```typescript
import { encryptSSN, decryptSSN } from '@folkcare/core/crypto';

// Store encrypted
const client = {
  ssn: encryptSSN("123-45-6789"),  // Stored as encrypted blob
  // ...
};

// Decrypt only when needed and authorized
const decrypted = decryptSSN(client.ssn);
```

### 5. Production Deployment Checklist

```
□ Database
  └─ PostgreSQL 14+ with uuid-ossp, pgcrypto
  └─ Run all migrations
  └─ Verify SSL connections
  └─ Set up automated backups
  
□ Secrets Management
  └─ Store all API keys in secure vault
  └─ Rotate credentials regularly
  └─ Never commit .env files
  
□ Organization Setup
  └─ Create production organization(s)
  └─ Configure all state EVV settings
  └─ Set up audit logging
  └─ Enable email verification
  
□ Users and Access
  └─ Create admin users
  └─ Set up role-based access control
  └─ Enable MFA for critical roles
  └─ Test authentication flows
  
□ Data Import
  └─ Validate all client data
  └─ Verify caregiver credentials
  └─ Test billing and payroll imports
  └─ Audit trail should show all imports
  
□ Compliance
  └─ Verify HIPAA audit logging
  └─ Test EVV aggregator submissions
  └─ Validate state compliance rules
  └─ Run security audit
  
□ Testing
  └─ Create test visits end-to-end
  └─ Verify mobile EVV clock-in/out
  └─ Test billing invoice generation
  └─ Validate aggregator feedback
```

### 6. Common Errors and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| `ORGANIZATION_MISMATCH` | User accessing wrong organization | Verify org_id in request matches user's organization |
| `INVALID_STATE_CODE` | Invalid state code provided | Use valid 2-letter state codes (TX, FL, CA, etc.) |
| `DUPLICATE_EMAIL` | Email already exists | Check for duplicate user emails within organization |
| `INVALID_CREDENTIALS` | Credential format error | Verify credential JSON matches schema |
| `COMPLIANCE_STATUS_EXPIRED` | Caregiver credentials expired | Update credentials with new expiration dates |
| `AGGREGATOR_SUBMISSION_FAILED` | EVV aggregator rejected submission | Check geofence, timestamps, caregiver/client status |
| `INSUFFICIENT_PERMISSIONS` | User lacks required role | Assign appropriate role to user account |

---

## API Summary for Agency Setup

### Organizations
- `POST /api/organizations/register` - Create new organization
- `GET /api/organizations/:id` - Retrieve organization details
- `PUT /api/organizations/:id` - Update organization profile
- `POST /api/organizations/:id/seed-demo` - Load demo data
- `DELETE /api/organizations/:id/demo-data` - Clear demo data

### Users and Invitations
- `POST /api/organizations/:id/invitations` - Create user invitation
- `GET /api/organizations/:id/invitations` - List pending invitations
- `GET /api/invitations/:token` - Get invitation details
- `POST /api/invitations/accept` - Accept invitation and create user
- `DELETE /api/invitations/:token` - Revoke invitation

### Clients
- `POST /api/organizations/:id/clients` - Create client record
- `GET /api/organizations/:id/clients` - List clients
- `GET /api/clients/:id` - Get client details
- `PUT /api/clients/:id` - Update client record
- `DELETE /api/clients/:id` - Delete client (soft delete)
- `POST /api/organizations/:id/import/clients` - Bulk import CSV

### Caregivers
- `POST /api/organizations/:id/caregivers` - Create caregiver record
- `GET /api/organizations/:id/caregivers` - List caregivers
- `GET /api/caregivers/:id` - Get caregiver details
- `PUT /api/caregivers/:id` - Update caregiver record
- `POST /api/organizations/:id/import/caregivers` - Bulk import CSV

### Programs
- `POST /api/organizations/:id/programs` - Create program
- `GET /api/organizations/:id/programs` - List programs
- `PUT /api/programs/:id` - Update program

### EVV Configuration
- `POST /api/organizations/:id/evv-config` - Create state EVV config
- `GET /api/organizations/:id/evv-config` - List EVV configurations
- `PUT /api/evv-config/:id` - Update EVV configuration

---

## References

- [Database Schema Documentation](./docs/DATABASE_SCHEMA.md)
- [Deployment Guide](./DEPLOYMENT.md)
- [Seeding Guide](./SEEDING.md)
- [API Documentation](./docs/API_DOCUMENTATION.md)
- [Architecture Overview](./docs/ARCHITECTURE.md)

---

**Last Updated:** December 2025
**Folk Care Version:** 1.0.0+
**Maintained by:** Neighborhood Lab Community
