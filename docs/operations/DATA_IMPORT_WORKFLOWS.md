# Folk Care Data Import Workflows

Complete guide for importing real agency data (clients, caregivers, programs) from existing systems.

---

## Overview

Folk Care supports several methods for importing data:

1. **API Bulk Import** - CSV files via REST API
2. **Direct Database Insert** - SQL/TypeScript scripts
3. **Programmatic Service** - Using core services
4. **Demo Data** - Built-in sample data for exploration

This guide covers realistic data import scenarios and validation.

---

## Client Data Import

### CSV Format

Required columns:
```csv
client_number,first_name,last_name,date_of_birth,phone,email,street1,city,state,zipCode,status
```

Optional columns:
```csv
middle_name,preferred_name,ssn,gender,language,ethnicity,race,marital_status,veteran_status,
secondary_addresses,emergency_contact_name,emergency_contact_phone,authorized_contact_name,
primary_physician,pharmacy,medical_record_number,referral_source,special_instructions,
access_instructions,notes
```

### Complete Example CSV

**File: `clients.csv`**

```csv
client_number,first_name,middle_name,last_name,preferred_name,date_of_birth,gender,phone,email,street1,street2,city,state,zipCode,language,ethnicity,emergency_contact_name,emergency_contact_phone,status,referral_source,notes
C001,John,Michael,Smith,Mike,1950-01-15,Male,512-555-1111,john.smith@email.com,100 Oak Avenue,Apt 4B,Austin,TX,78701,English,Hispanic,Mary Smith,512-555-1112,ACTIVE,"Dr. Johnson","Mild cognitive impairment, fall risk"
C002,Mary,Lynn,Johnson,,1955-06-20,Female,512-555-2222,mary@email.com,200 Elm Street,,Austin,TX,78702,English,Caucasian,Robert Johnson,512-555-2223,ACTIVE,"Referral from BCMH","Diabetic, requires wound care"
C003,Robert,James,Williams,,1948-03-10,Male,,robert.w@email.com,300 Maple Drive,,Austin,TX,78703,Spanish/English,African American,Patricia Williams,512-555-2224,ACTIVE,"Self-referral","Lives alone, needs daily assistance"
C004,Lisa,Marie,Brown,Lisa,1960-02-28,Female,512-555-2225,,400 Pine Road,Unit 2,Austin,TX,78704,English,Asian,Brother - Michael Brown,512-555-2226,PENDING_INTAKE,"Hospital discharge","Post-surgery recovery"
C005,David,Robert,Taylor,,1952-11-05,Male,512-555-2227,david.taylor@email.com,500 Cedar Lane,,Austin,TX,78705,English,Caucasian,Wife - Susan Taylor,512-555-2228,INACTIVE,"Private pay","Moved to assisted living"
```

### Import via API

```bash
curl -X POST http://localhost:5173/api/organizations/{orgId}/import/clients \
  -H "Authorization: Bearer {adminToken}" \
  -H "Content-Type: multipart/form-data" \
  -F "file=@clients.csv" \
  -F "branchId={branchId}"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "imported": 5,
    "skipped": 0,
    "errors": [],
    "summary": {
      "total": 5,
      "created": 5,
      "updated": 0,
      "duplicates": 0
    }
  }
}
```

### Import via TypeScript Script

```typescript
import fs from 'fs';
import csv from 'csv-parse/sync';
import { ClientRepository } from '@folkcare/core';
import { Database } from '@folkcare/core';

async function importClients(filePath: string, orgId: string, branchId: string, adminUserId: string) {
  const db = new Database(process.env.DATABASE_URL);
  const clientRepo = new ClientRepository(db);

  // Read and parse CSV
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const records = csv.parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });

  const results = {
    imported: 0,
    skipped: 0,
    errors: [] as string[]
  };

  for (const record of records) {
    try {
      // Validate required fields
      if (!record.client_number || !record.first_name || !record.last_name) {
        results.errors.push(`Row missing required fields: ${JSON.stringify(record)}`);
        results.skipped++;
        continue;
      }

      // Parse date of birth
      const dob = new Date(record.date_of_birth);
      if (isNaN(dob.getTime())) {
        results.errors.push(`Invalid DOB for client ${record.client_number}: ${record.date_of_birth}`);
        results.skipped++;
        continue;
      }

      // Build client record
      const clientRecord = {
        organizationId: orgId,
        branchId: branchId,
        clientNumber: record.client_number,
        firstName: record.first_name,
        middleName: record.middle_name || undefined,
        lastName: record.last_name,
        preferredName: record.preferred_name,
        dateOfBirth: dob.toISOString().split('T')[0],
        gender: record.gender,
        email: record.email,
        language: record.language || 'English',
        ethnicity: record.ethnicity,
        
        primaryAddress: {
          street1: record.street1,
          street2: record.street2,
          city: record.city,
          state: record.state,
          zipCode: record.zipCode
        },
        
        emergencyContacts: record.emergency_contact_name ? [
          {
            name: record.emergency_contact_name,
            phone: record.emergency_contact_phone,
            relationship: 'Primary'
          }
        ] : [],
        
        referralSource: record.referral_source,
        notes: record.notes,
        status: record.status || 'ACTIVE',
        
        createdBy: adminUserId
      };

      // Create client
      await clientRepo.createClient(clientRecord);
      results.imported++;
      console.log(`✓ Imported client: ${record.first_name} ${record.last_name}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      results.errors.push(`Error importing ${record.client_number}: ${errorMessage}`);
      results.skipped++;
    }
  }

  console.log('\n=== Import Summary ===');
  console.log(`Imported: ${results.imported}`);
  console.log(`Skipped: ${results.skipped}`);
  if (results.errors.length > 0) {
    console.log(`Errors: ${results.errors.length}`);
    results.errors.forEach(e => console.log(`  - ${e}`));
  }

  return results;
}

// Usage
importClients('clients.csv', 'org-id', 'branch-id', 'admin-user-id')
  .catch(console.error);
```

---

## Caregiver Data Import

### CSV Format

Required columns:
```csv
employee_number,first_name,last_name,date_of_birth,email,phone,hire_date,employment_type,role
```

Optional columns:
```csv
middle_name,ssn,gender,language,languages,ethnicity,street1,city,state,zipCode,
emergency_contact_name,emergency_contact_phone,pay_rate_amount,pay_rate_type,
credentials,certifications,skills,availability_notes,max_hours_per_week,min_hours_per_week
```

### Complete Example CSV

**File: `caregivers.csv`**

```csv
employee_number,first_name,last_name,date_of_birth,gender,email,phone,hire_date,employment_type,role,languages,street1,city,state,zipCode,emergency_contact_name,emergency_contact_phone,pay_rate_amount,pay_rate_type,credentials,skills,availability_notes,max_hours_per_week,min_hours_per_week,status
E001,Maria,Garcia,1980-05-12,Female,maria.garcia@email.com,512-555-7777,2023-01-15,FULL_TIME,HOME_HEALTH_AIDE,"Spanish;English",100 Main St,Austin,TX,78701,Carlos Garcia,512-555-7778,18.50,HOURLY,"CPR;CNA;TB Test","Patient Care;Mobility;Basic Nursing","Mon-Fri 8am-5pm",40,40,ACTIVE
E002,James,Brown,1975-08-22,Male,james.brown@email.com,512-555-8888,2023-03-01,PART_TIME,COMPANION,English,200 Oak Ave,Austin,TX,78702,Linda Brown,512-555-8889,16.00,HOURLY,"CPR","Companionship;Transportation","Flexible, weekends preferred",20,15,ACTIVE
E003,Lisa,Chen,1982-11-03,Female,lisa.chen@email.com,512-555-9999,2022-06-20,FULL_TIME,CERTIFIED_NURSING_ASSISTANT,"Chinese;English",300 Elm St,Austin,TX,78703,Wei Chen,512-555-10000,19.50,HOURLY,"CPR;CNA;TB Test;License","Wound Care;Medication Support;Mobility",Mon-Fri,40,40,ACTIVE
E004,Michael,Johnson,1988-04-16,Male,michael.j@email.com,512-555-10001,2023-06-01,PER_DIEM,CAREGIVER,English,400 Pine Rd,Austin,TX,78704,Robert Johnson,512-555-10002,17.25,HOURLY,"CPR","Personal Care;Hygiene","As needed, prefer evenings",30,15,ACTIVE
E005,Patricia,Wilson,1978-09-30,Female,patricia.w@email.com,512-555-10003,2022-02-14,FULL_TIME,SUPERVISOR,"Spanish;English",500 Cedar Ln,Austin,TX,78705,James Wilson,512-555-10004,22.00,HOURLY,"CPR;CNA;Management Cert","Supervision;Scheduling;Compliance","Mon-Fri",40,40,ACTIVE
```

### Import via TypeScript Script

```typescript
import fs from 'fs';
import csv from 'csv-parse/sync';
import { CaregiverRepository } from '@folkcare/core';
import { Database } from '@folkcare/core';

async function importCaregivers(
  filePath: string,
  orgId: string,
  branchId: string,
  adminUserId: string
) {
  const db = new Database(process.env.DATABASE_URL);
  const caregiverRepo = new CaregiverRepository(db);

  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const records = csv.parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });

  const results = {
    imported: 0,
    skipped: 0,
    errors: [] as string[]
  };

  for (const record of records) {
    try {
      // Validate required fields
      if (!record.employee_number || !record.first_name || !record.last_name || !record.email) {
        results.errors.push(`Row missing required fields: ${record.employee_number || 'unknown'}`);
        results.skipped++;
        continue;
      }

      // Parse dates
      const dob = new Date(record.date_of_birth);
      const hireDate = new Date(record.hire_date);

      if (isNaN(dob.getTime()) || isNaN(hireDate.getTime())) {
        results.errors.push(`Invalid date for ${record.employee_number}`);
        results.skipped++;
        continue;
      }

      // Parse languages (semicolon-separated)
      const languages = record.languages 
        ? record.languages.split(';').map((l: string) => l.trim())
        : record.language ? [record.language] : ['English'];

      // Parse credentials (semicolon-separated)
      const credentials = record.credentials
        ? record.credentials.split(';').map((c: string) => ({
            type: c.trim(),
            status: 'ACTIVE',
            issueDate: new Date().toISOString().split('T')[0],
            expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
          }))
        : [];

      // Parse skills
      const skills = record.skills
        ? record.skills.split(';').map((s: string) => ({
            name: s.trim(),
            proficiency: 'PROFICIENT'
          }))
        : [];

      // Build caregiver record
      const caregiverRecord = {
        organizationId: orgId,
        branchIds: [branchId],
        primaryBranchId: branchId,
        employeeNumber: record.employee_number,
        firstName: record.first_name,
        lastName: record.last_name,
        dateOfBirth: dob.toISOString().split('T')[0],
        gender: record.gender,
        email: record.email,
        primaryPhone: {
          number: record.phone,
          type: 'MOBILE'
        },
        hireDate: hireDate.toISOString().split('T')[0],
        employmentType: record.employment_type || 'FULL_TIME',
        employmentStatus: 'ACTIVE',
        role: record.role || 'CAREGIVER',
        
        primaryAddress: {
          street1: record.street1 || 'TBD',
          city: record.city || 'TBD',
          state: record.state || 'TX',
          zipCode: record.zipCode || '00000'
        },
        
        languages,
        credentials,
        skills,
        
        emergencyContacts: record.emergency_contact_name ? [
          {
            name: record.emergency_contact_name,
            phone: record.emergency_contact_phone,
            relationship: 'Emergency Contact'
          }
        ] : [],
        
        payRate: {
          amount: parseFloat(record.pay_rate_amount) || 15.00,
          currency: 'USD',
          type: 'HOURLY'
        },
        
        maxHoursPerWeek: parseInt(record.max_hours_per_week) || 40,
        minHoursPerWeek: parseInt(record.min_hours_per_week) || 20,
        
        availability: {
          monday: [{ start: '08:00', end: '17:00' }],
          tuesday: [{ start: '08:00', end: '17:00' }],
          wednesday: [{ start: '08:00', end: '17:00' }],
          thursday: [{ start: '08:00', end: '17:00' }],
          friday: [{ start: '08:00', end: '17:00' }]
        },
        
        status: record.status || 'ACTIVE',
        complianceStatus: credentials.length > 0 ? 'COMPLIANT' : 'PENDING_VERIFICATION',
        
        createdBy: adminUserId
      };

      // Create caregiver
      await caregiverRepo.createCaregiver(caregiverRecord);
      results.imported++;
      console.log(`✓ Imported caregiver: ${record.first_name} ${record.last_name}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      results.errors.push(`Error importing ${record.employee_number}: ${errorMessage}`);
      results.skipped++;
    }
  }

  console.log('\n=== Caregiver Import Summary ===');
  console.log(`Imported: ${results.imported}`);
  console.log(`Skipped: ${results.skipped}`);
  if (results.errors.length > 0) {
    console.log(`Errors: ${results.errors.length}`);
    results.errors.forEach(e => console.log(`  - ${e}`));
  }

  return results;
}

// Usage
importCaregivers('caregivers.csv', 'org-id', 'branch-id', 'admin-user-id')
  .catch(console.error);
```

---

## Program/Service Type Setup

### Example Programs Configuration

```typescript
import { ProgramRepository } from '@folkcare/core';
import { Database } from '@folkcare/core';

async function setupPrograms(orgId: string, adminUserId: string) {
  const db = new Database(process.env.DATABASE_URL);
  const programRepo = new ProgramRepository(db);

  const programs = [
    {
      organizationId: orgId,
      name: "Medicaid Personal Care Services",
      code: "MED_PCS",
      programType: "Medicaid",
      fundingSource: "State Medicaid",
      serviceTypes: ["PERSONAL_CARE", "COMPANION"],
      hourlyRate: 19.50,
      eligibilityRules: {
        requiresAuthorization: true,
        maxUnitsPerMonth: 720,  // 24 hours per day * 30 days
        requiresAuth500: true,  // Texas Auth 500 for skilled services
        requiresRNCertification: false
      },
      status: "ACTIVE",
      startDate: "2025-01-01",
      createdBy: adminUserId
    },
    {
      organizationId: orgId,
      name: "Medicaid Skilled Nursing",
      code: "MED_SKILLED",
      programType: "Medicaid",
      fundingSource: "State Medicaid",
      serviceTypes: ["SKILLED_NURSING", "WOUND_CARE"],
      hourlyRate: 45.00,
      eligibilityRules: {
        requiresAuthorization: true,
        requiresRNCertification: true,
        supervisoryVisitsRequired: true,
        supervisoryFrequencyDays: 60
      },
      status: "ACTIVE",
      startDate: "2025-01-01",
      createdBy: adminUserId
    },
    {
      organizationId: orgId,
      name: "Private Pay Services",
      code: "PRIVATE",
      programType: "PrivatePay",
      fundingSource: "Client",
      serviceTypes: ["PERSONAL_CARE", "COMPANION", "SKILLED_NURSING"],
      hourlyRate: 25.00,
      eligibilityRules: {
        requiresAuthorization: false,
        requiresAuth500: false
      },
      status: "ACTIVE",
      startDate: "2025-01-01",
      createdBy: adminUserId
    },
    {
      organizationId: orgId,
      name: "Medicare Home Health",
      code: "MEDICARE_HH",
      programType: "Medicare",
      fundingSource: "Medicare",
      serviceTypes: ["SKILLED_NURSING", "PHYSICAL_THERAPY"],
      hourlyRate: 55.00,
      eligibilityRules: {
        requiresAuthorization: true,
        requiresCertification: true,
        episodeOfCare: true
      },
      status: "ACTIVE",
      startDate: "2025-01-01",
      createdBy: adminUserId
    }
  ];

  const results = { created: 0, errors: [] as string[] };

  for (const program of programs) {
    try {
      await programRepo.createProgram(program);
      results.created++;
      console.log(`✓ Created program: ${program.name}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      results.errors.push(`Error creating ${program.code}: ${errorMessage}`);
    }
  }

  return results;
}

// Usage
setupPrograms('org-id', 'admin-user-id')
  .then(results => {
    console.log('\n=== Program Setup Summary ===');
    console.log(`Created: ${results.created}`);
    if (results.errors.length > 0) {
      console.log(`Errors: ${results.errors.length}`);
      results.errors.forEach(e => console.log(`  - ${e}`));
    }
  });
```

---

## Client Authorizations

Link clients to programs with authorized hours/units:

```typescript
import { ClientAuthorizationRepository } from '@folkcare/core';

async function setupAuthorizations(
  orgId: string,
  clientMap: Map<string, string>,  // client_number -> client_id
  programMap: Map<string, string>, // program_code -> program_id
  adminUserId: string
) {
  const db = new Database(process.env.DATABASE_URL);
  const authRepo = new ClientAuthorizationRepository(db);

  const authorizations = [
    {
      clientId: clientMap.get('C001'),
      programId: programMap.get('MED_PCS'),
      authorizationNumber: "AUTH001",
      serviceType: "PERSONAL_CARE",
      authorizedUnits: 120,  // hours per month
      unitType: "HOURS",
      startDate: "2025-01-01",
      endDate: "2025-12-31",
      status: "ACTIVE"
    },
    {
      clientId: clientMap.get('C002'),
      programId: programMap.get('MED_SKILLED'),
      authorizationNumber: "AUTH002",
      serviceType: "SKILLED_NURSING",
      authorizedUnits: 60,  // hours per month
      unitType: "HOURS",
      startDate: "2025-01-01",
      endDate: "2025-06-30",
      status: "ACTIVE"
    }
  ];

  const results = { created: 0, errors: [] as string[] };

  for (const auth of authorizations) {
    try {
      if (!auth.clientId || !auth.programId) {
        results.errors.push(`Missing client or program for auth ${auth.authorizationNumber}`);
        continue;
      }

      await authRepo.createAuthorization({
        ...auth,
        createdBy: adminUserId
      });

      results.created++;
      console.log(`✓ Created authorization: ${auth.authorizationNumber}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      results.errors.push(`Error creating ${auth.authorizationNumber}: ${errorMessage}`);
    }
  }

  return results;
}
```

---

## Data Validation Checklist

### Before Importing Clients

- [ ] Client numbers are unique within organization
- [ ] Dates of birth are valid and in past
- [ ] Phone numbers follow format (10 digits minimum)
- [ ] Email addresses are valid format
- [ ] All required fields are present
- [ ] Addresses have street, city, state, zip
- [ ] Status is valid (INQUIRY, PENDING_INTAKE, ACTIVE, INACTIVE, DISCHARGED, DECEASED)
- [ ] No duplicate email addresses
- [ ] Referral source is documented for compliance

### Before Importing Caregivers

- [ ] Employee numbers are unique within organization
- [ ] Emails are unique system-wide
- [ ] Dates of birth are valid and at least 18 years old
- [ ] Hire date is valid and in past
- [ ] Employment type is valid (FULL_TIME, PART_TIME, PER_DIEM, CONTRACT, TEMPORARY, SEASONAL)
- [ ] Role is valid (CAREGIVER, SENIOR_CAREGIVER, CNA, HHA, etc.)
- [ ] Phone numbers are valid
- [ ] Primary address has required fields
- [ ] Credentials and expiration dates are accurate
- [ ] Pay rate is reasonable for role and region
- [ ] All background checks and screenings are complete

### Before Creating Visits

- [ ] Client is ACTIVE status
- [ ] Caregiver is ACTIVE status and compliant
- [ ] Caregiver has required credentials for service type
- [ ] Client has authorization for program/service type
- [ ] Authorized units are available for period
- [ ] Visit time doesn't conflict with other visits
- [ ] Caregiver availability covers scheduled time
- [ ] Client and caregiver are assigned to same branch

---

## Export/Backup Patterns

### Export Clients for Backup

```sql
-- Export all active clients
COPY (
  SELECT 
    id, client_number, first_name, last_name, date_of_birth,
    primary_phone, email, primary_address, status, created_at
  FROM clients
  WHERE organization_id = '550e8400-e29b-41d4-a716-446655440000'
    AND deleted_at IS NULL
  ORDER BY client_number
)
TO '/tmp/clients_backup.csv' WITH (FORMAT CSV, HEADER);
```

### Export Caregivers for Backup

```sql
-- Export all caregivers with credentials
COPY (
  SELECT 
    id, employee_number, first_name, last_name, email,
    employment_status, role, pay_rate, compliance_status,
    credentials, training, hire_date, created_at
  FROM caregivers
  WHERE organization_id = '550e8400-e29b-41d4-a716-446655440000'
    AND deleted_at IS NULL
  ORDER BY employee_number
)
TO '/tmp/caregivers_backup.csv' WITH (FORMAT CSV, HEADER);
```

---

## Common Import Errors & Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| `Duplicate client_number` | Client number already exists in org | Use unique client numbers, check for re-imports |
| `Invalid date format` | DOB/dates not ISO 8601 format | Use YYYY-MM-DD format: 1950-01-15 |
| `Unique violation on email` | Email exists in system | Use unique email per user, check all orgs if multi-tenant |
| `FK violation: branch not found` | Branch ID doesn't exist | Create branches first, verify branch ID |
| `Invalid state code` | State is not 2-letter code | Use valid US state abbreviation (TX, FL, CA) |
| `Address fields missing` | street1, city, state, or zip missing | All address fields required |
| `Compliance status EXPIRED` | Credentials are expired | Update expiration dates before import |
| `Invalid employment type` | Employment type doesn't match enum | Use: FULL_TIME, PART_TIME, PER_DIEM, CONTRACT, SEASONAL, TEMPORARY |

---

## Import Best Practices

1. **Test First**: Always test with small sample before full import
2. **Backup Before**: Export current data before importing new data
3. **Validate Thoroughly**: Check all data before import using validation scripts
4. **Import in Order**: Organizations → Branches → Programs → Users → Clients → Caregivers → Authorizations
5. **Use Transactions**: All imports should be atomic (all or nothing)
6. **Log Results**: Always capture import results and errors for audit trail
7. **Run Compliance Checks**: After import, verify compliance status and expiration dates
8. **Notify Admins**: Alert admins of import results for review
9. **Archive Source Files**: Keep CSV/source files for 90 days minimum
10. **Document Changes**: Add notes to audit trail about what was imported and why

---

## Performance Tips

- Import clients in batches of 500-1000 records
- Import caregivers in batches of 100-200 records
- Use database transactions for consistency
- Disable triggers/indexes during large imports (enable after)
- Run imports during off-peak hours
- Consider parallel imports for large datasets
- Monitor database connection pool usage

---

**Last Updated:** December 2025  
**For Folk Care v1.0.0+**
