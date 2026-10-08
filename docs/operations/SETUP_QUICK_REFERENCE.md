# Folk Care Agency Setup - Quick Reference

Fast-track setup guide for getting a new agency up and running with real data.

---

## 30-Minute Quick Start

### 1. Create Organization (2 min)

```bash
curl -X POST http://localhost:5173/api/organizations/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Agency",
    "stateCode": "TX",
    "email": "admin@myagency.com",
    "primaryAddress": {
      "street1": "123 Main St",
      "city": "Austin",
      "state": "TX",
      "zipCode": "78701"
    },
    "adminUser": {
      "firstName": "Admin",
      "lastName": "User",
      "email": "admin@myagency.com",
      "password": "SecureP@ss123!"
    }
  }'
```

Save the returned `organizationId` and `adminToken`.

### 2. Create a Branch (1 min)

```bash
curl -X POST http://localhost:5173/api/organizations/{orgId}/branches \
  -H "Authorization: Bearer {adminToken}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Main Office",
    "code": "MAIN",
    "address": {
      "street1": "123 Main St",
      "city": "Austin",
      "state": "TX",
      "zipCode": "78701"
    }
  }'
```

### 3. Create Programs (1 min)

```bash
curl -X POST http://localhost:5173/api/organizations/{orgId}/programs \
  -H "Authorization: Bearer {adminToken}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Medicaid PCS",
    "code": "MED_PCS",
    "programType": "Medicaid",
    "serviceTypes": ["PERSONAL_CARE"],
    "hourlyRate": 19.50
  }'
```

### 4. Configure State EVV (2 min)

For **Texas**:
```bash
curl -X POST http://localhost:5173/api/organizations/{orgId}/evv-config \
  -H "Authorization: Bearer {adminToken}" \
  -H "Content-Type: application/json" \
  -d '{
    "stateCode": "TX",
    "aggregatorType": "HHAeXchange",
    "aggregatorEntityId": "YOUR_ENTITY_ID",
    "aggregatorEndpoint": "https://www.hhaechange.org/xml/xmlgw.aspx",
    "programType": "Medicaid",
    "geoPerimeterTolerance": 100,
    "clockInGracePeriod": 10,
    "vmurEnabled": true,
    "effectiveFrom": "2025-01-01"
  }'
```

For **Florida**:
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
    "geoPerimeterTolerance": 150,
    "clockInGracePeriod": 15,
    "effectiveFrom": "2025-01-01"
  }'
```

### 5. Seed Demo Data (5 min)

Load sample clients, caregivers, and visits to explore the platform:

```bash
curl -X POST http://localhost:5173/api/organizations/{orgId}/seed-demo \
  -H "Authorization: Bearer {adminToken}"
```

**Demo data includes:**
- 60 clients
- 35 caregivers  
- 600+ visits
- 50+ care plans
- All marked as demo data for easy cleanup

### 6. Test Login (1 min)

**Demo admin user:**
- Email: `admin@{stateCode}.folkcare.example`
- Password: `Demo{STATECODE}ADMIN123!`

**Example for Texas:**
- Email: `admin@tx.folkcare.example`
- Password: `DemoTXADMIN123!`

---

## Common Workflows

### Invite Team Members

```bash
# Create invitation
curl -X POST http://localhost:5173/api/organizations/{orgId}/invitations \
  -H "Authorization: Bearer {adminToken}" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "coordinator@myagency.com",
    "firstName": "Jane",
    "lastName": "Coordinator",
    "roles": ["COORDINATOR"],
    "branchIds": ["{branchId}"]
  }'

# Response includes: invitation link and token
# User clicks link or accepts with token + password
```

### Import Real Client Data

Prepare `clients.csv`:
```
client_number,first_name,last_name,date_of_birth,street1,city,state,zipCode
C001,John,Doe,1950-01-15,100 Oak Ave,Austin,TX,78701
C002,Mary,Smith,1955-06-20,200 Elm St,Austin,TX,78702
```

```bash
curl -X POST http://localhost:5173/api/organizations/{orgId}/import/clients \
  -H "Authorization: Bearer {adminToken}" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@clients.csv" \
  -F "branchId={branchId}"
```

### Import Real Caregiver Data

Prepare `caregivers.csv`:
```
employee_number,first_name,last_name,email,phone,hire_date,role,employment_type
E001,Maria,Garcia,maria@email.com,512-555-1111,2023-01-15,HOME_HEALTH_AIDE,FULL_TIME
E002,James,Brown,james@email.com,512-555-2222,2023-03-01,COMPANION,PART_TIME
```

```bash
curl -X POST http://localhost:5173/api/organizations/{orgId}/import/caregivers \
  -H "Authorization: Bearer {adminToken}" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@caregivers.csv" \
  -F "branchId={branchId}"
```

### Create a Visit

```bash
curl -X POST http://localhost:5173/api/organizations/{orgId}/visits \
  -H "Authorization: Bearer {adminToken}" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "{clientId}",
    "caregiverId": "{caregiverId}",
    "programId": "{programId}",
    "scheduledStart": "2025-01-20T10:00:00Z",
    "scheduledEnd": "2025-01-20T12:00:00Z",
    "visitType": "PERSONAL_CARE"
  }'
```

### Test Mobile EVV (Clock-In/Out)

```bash
# Clock in (from caregiver mobile app)
curl -X POST http://localhost:5173/api/visits/{visitId}/evv/clock-in \
  -H "Authorization: Bearer {caregiverToken}" \
  -H "Content-Type: application/json" \
  -d '{
    "location": {
      "latitude": 30.2672,
      "longitude": -97.7431,
      "accuracy": 10
    },
    "verificationMethod": "GPS",
    "deviceInfo": {"appVersion": "1.0.0", "platform": "iOS"}
  }'

# Clock out
curl -X POST http://localhost:5173/api/visits/{visitId}/evv/clock-out \
  -H "Authorization: Bearer {caregiverToken}" \
  -H "Content-Type: application/json" \
  -d '{
    "location": {
      "latitude": 30.2672,
      "longitude": -97.7431,
      "accuracy": 10
    }
  }'
```

---

## Database Schema at a Glance

### Core Tables

```sql
organizations              -- Agency master record
├── branches               -- Locations/offices
├── users                  -- System users (staff)
├── programs               -- Service types (Medicaid, Private Pay, etc.)
├── clients                -- Care recipients
├── caregivers             -- Care providers
├── visits                 -- Scheduled care visits
├── evv_records            -- GPS/verification clock-in/out
├── care_plans             -- Clinical care plans
└── audit_events           -- Compliance logging
```

### State-Specific Tables

```sql
evv_state_config          -- EVV rules per state (TX, FL, etc.)
texas_vmur                -- Visit Maintenance Unlock Requests (TX only)
state_aggregator_submissions  -- Submissions to state systems
```

---

## User Roles Quick Reference

| Role | Create/Edit | View | Most Common Tasks |
|------|-----------|------|------------------|
| **ORG_ADMIN** | Everything | Everything | Org setup, user management, compliance |
| **COORDINATOR** | Users, schedules, care plans | Clients, visits, staff | Care coordination, scheduling |
| **CAREGIVER** | Own visits | Own data | Clock in/out, visit notes |
| **SUPERVISOR** | Caregivers, schedules | All staff/clients | EVV review, compliance checks |
| **BILLING** | Invoices, payroll | Financial records | Invoicing, payroll processing |
| **NURSE** | Care plans, clinical notes | All clients | Clinical oversight, care plans |
| **FAMILY_MEMBER** | Messages only | Own client data | View care status, message caregivers |

---

## State Abbreviations for Reference

```
AL, AK, AZ, AR, CA, CO, CT, DE, FL, GA
HI, ID, IL, IN, IA, KS, KY, LA, ME, MD
MA, MI, MN, MS, MO, MT, NE, NV, NH, NJ
NM, NY, NC, ND, OH, OK, OR, PA, RI, SC
SD, TN, TX, UT, VT, VA, WA, WV, WI, WY
DC (District of Columbia)
```

---

## Typical Data Import Order

1. **Organizations** ← Create first
2. **Branches** ← Create per location
3. **Programs** ← Define service types
4. **Users** ← Invite team members
5. **Clients** ← Import from CSV or create manually
6. **Caregivers** ← Import from CSV or create manually
7. **Credentials** ← Assign to caregivers
8. **Visits** ← Create schedules
9. **Care Plans** ← Link to clients

---

## Validation Rules

### Organization
- Name: Required, 1-255 characters
- State Code: Required, 2-letter US state code
- Primary Address: Required (street1, city, state, zipCode)
- Email: Required, valid format

### Users  
- Email: Unique within organization
- Password: Min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special char
- Roles: Array of valid role strings

### Clients
- Client Number: Unique per organization
- DOB: Valid date (ISO 8601 format)
- Status: Must be INQUIRY, PENDING_INTAKE, ACTIVE, INACTIVE, DISCHARGED, or DECEASED

### Caregivers
- Employee Number: Unique per organization
- Email: Must be unique
- Hire Date: Required, valid date
- Primary Branch: Must be included in branch_ids array

### Credentials
- Expiration Date: If set, must be in future
- Status: ACTIVE, EXPIRED, PENDING_VERIFICATION, REVOKED

---

## Troubleshooting

### "Organization not found"
- Check `organizationId` is correct
- Verify organization exists in database
- Ensure user belongs to that organization

### "Invalid email"
- Must contain @ and domain
- No spaces allowed
- Check for typos

### "Duplicate email"  
- User email already exists in system
- Use unique email per user account
- Check across all organizations if multi-tenant

### "Invalid state code"
- Must be 2-letter US state abbreviation
- Uppercase (TX, FL, CA)
- Must be valid US state or DC

### "Geofence tolerance out of range"
- Must be 0-500 (meters)
- TX typical: 100m
- FL typical: 150m

### "Grace period out of range"
- Must be 0-60 (minutes)
- TX typical: 10 minutes
- FL typical: 15 minutes

---

## Environment Variables

Required for production setup:

```bash
DATABASE_URL=postgresql://user:password@host:5432/folkcare
JWT_SECRET=your-secret-key-min-32-chars
NODE_ENV=production
PORT=3000

# Optional state-specific secrets
TX_HHAE_API_KEY=your-hhaechange-key
TX_HHAE_ENTITY_ID=your-entity-id
FL_NETSMART_API_KEY=your-netsmart-key
FL_NETSMART_ENTITY_ID=your-entity-id
```

---

## Common SQL Queries

### Find all organizations
```sql
SELECT id, name, state_code, status, created_at 
FROM organizations 
WHERE deleted_at IS NULL;
```

### Find caregivers with expired credentials
```sql
SELECT c.id, c.first_name, c.last_name, c.compliance_status
FROM caregivers c
WHERE c.deleted_at IS NULL 
AND c.compliance_status IN ('EXPIRED', 'EXPIRING_SOON');
```

### Find visits not yet clock out
```sql
SELECT id, client_id, caregiver_id, scheduled_start
FROM visits
WHERE actual_end IS NULL 
AND scheduled_start < NOW() 
AND deleted_at IS NULL;
```

### Count demo data for cleanup
```sql
SELECT COUNT(*) as demo_records
FROM clients
WHERE organization_id = '{orgId}'
AND is_demo_data = true;
```

### View audit trail for compliance
```sql
SELECT event_type, resource, action, result, timestamp
FROM audit_events
WHERE organization_id = '{orgId}'
AND timestamp > NOW() - INTERVAL '30 days'
ORDER BY timestamp DESC
LIMIT 100;
```

---

## Support & Documentation

- **Full Schema Docs:** `./FOLK_CARE_AGENCY_SETUP_GUIDE.md`
- **API Docs:** `./docs/API_DOCUMENTATION.md`  
- **Database Schema:** `./docs/DATABASE_SCHEMA.md`
- **Deployment Guide:** `./DEPLOYMENT.md`
- **Architecture:** `./docs/ARCHITECTURE.md`

---

**Last Updated:** December 2025  
**For Folk Care v1.0.0+**
