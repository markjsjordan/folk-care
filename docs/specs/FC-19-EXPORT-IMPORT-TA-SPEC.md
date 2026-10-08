# FC-19: Export/Import Features - Technical Architecture Specification

**Document Version**: 1.0  
**Date**: September 20, 2026  
**Status**: SPECIFICATION  
**Priority**: HIGH  

---

## 1. EXECUTIVE SUMMARY

FC-19 establishes a comprehensive export/import system for Folk Care, enabling bulk data operations across all verticals with support for multiple formats (CSV, Excel, PDF). The system builds on existing import infrastructure (`@folkcare/core/import`) and extends it with export capabilities, migration patterns, and full API/UI support.

**Key Objectives**:
- ✅ Bidirectional data flow (CSV import + export for all entities)
- ✅ Excel/PDF export with formatting and compliance requirements
- ✅ Data migration patterns (multi-tenant, state transitions, legacy system integration)
- ✅ Audit trail and compliance logging
- ✅ Progressive disclosure UI with dry-run and validation
- ✅ Support for all core entities (clients, caregivers, visits, care plans, medications, invoices)

---

## 2. PROBLEM STATEMENT

### Current State
- ✅ **Import infrastructure exists**: CSV parsing, validation, audit trail in `@folkcare/core/import`
- ✅ **Limited scope**: Only client import implemented via `ClientImportService`
- ❌ **No export**: Users cannot extract data in standard formats
- ❌ **No Excel support**: No structured export with formatting
- ❌ **No PDF reports**: No printable/archivable export
- ❌ **No migration tools**: No bulk state transitions or legacy system integration
- ❌ **No UI**: Export/import hidden behind API-only endpoints

### Business Impact
- **Regulatory**: HIPAA audit trail requirements demand comprehensive data lineage
- **Operational**: Agencies need to migrate between systems or consolidate data
- **Reporting**: Compliance officers require exportable audit trails and reports
- **Integration**: Legacy system integration blocked by lack of bidirectional data sync

---

## 3. DESIGN PRINCIPLES

### 3.1 Core Architecture Principles

1. **Vertical Responsibility**: Each vertical owns its import/export service
   - `@folkcare/client-demographics` → `ClientImportService`, `ClientExportService`
   - `@folkcare/caregiver-staff` → `CaregiverImportService`, `CaregiverExportService`
   - Pattern applies to all verticals

2. **Pluggable Format Support**: Format handlers isolated from business logic
   - Core formats: CSV, Excel, JSON (internal)
   - Plugin formats: PDF (via jsPDF), HL7 (healthcare), FHIR (interoperability)
   - Format-agnostic validation and transformation

3. **Dry-Run by Default**: All import/export operations support validation preview
   - Parse → Validate → Transform → (Dry-run) → Persist
   - Users see preview before committing changes

4. **Audit Trail First**: Every operation logged with full context
   - User ID, organization, timestamp, file metadata
   - Row-level error tracking and resolution history
   - Compliance-ready reports

5. **Multi-Tenant Isolation**: Strong boundaries prevent cross-org data leakage
   - Organization ID required on all operations
   - Cryptographic verification of data ownership
   - Immutable audit trail

---

## 4. TECHNICAL ARCHITECTURE

### 4.1 System Components

```
┌─────────────────────────────────────────────────────────────┐
│                     USER INTERFACES                         │
├────────────────────────────────────────────────────────────┤
│  Web UI               Mobile             Admin Dashboard    │
│  (React)              (Expo)             (React + Admin)    │
│  - Export Modal       - Export Sheet    - Audit Trail      │
│  - Import Wizard      - Limited import  - Bulk Operations  │
│  - Template Download  - Field migration - Reports          │
└────────────┬───────────────────────────────────────────────┘
             │
┌────────────▼───────────────────────────────────────────────┐
│                  EXPRESS API LAYER                         │
├────────────────────────────────────────────────────────────┤
│  /api/export/* routes      /api/import/* routes            │
│  - GET /export/{entity}    - POST /import/{entity}         │
│  - GET /export/{entity}/:id - POST /import/{entity}/dry-run│
│  - GET /migration/*        - POST /migration/*             │
│  - Format negotiation      - Multipart file upload         │
│  - Streaming responses     - Batch operation tracking      │
└────────────┬───────────────────────────────────────────────┘
             │
┌────────────▼───────────────────────────────────────────────┐
│         CORE INFRASTRUCTURE (@folkcare/core)               │
├────────────────────────────────────────────────────────────┤
│                                                             │
│  Import Services          Export Services                  │
│  ┌──────────────────┐    ┌──────────────────┐             │
│  │ parseFile()      │    │ collectData()     │             │
│  │ validateRecord() │    │ formatData()      │             │
│  │ importBatch()    │    │ buildExport()     │             │
│  │ mapRecords()     │    │ validateExport()  │             │
│  └──────────────────┘    └──────────────────┘             │
│                                                             │
│  CSV Format Handler      Excel Format Handler             │
│  ┌──────────────────┐    ┌──────────────────┐             │
│  │ toCsv()          │    │ toExcel()        │             │
│  │ parseCsv()       │    │ parseExcel()     │             │
│  │ csvOptions       │    │ excelOptions     │             │
│  │ csvValidate()    │    │ excelValidate()  │             │
│  └──────────────────┘    └──────────────────┘             │
│                                                             │
│  PDF Format Handler      Migration Handler                │
│  ┌──────────────────┐    ┌──────────────────┐             │
│  │ toPdf()          │    │ migrateData()    │             │
│  │ pdfOptions       │    │ validateState()  │             │
│  │ templates        │    │ resolveConflicts │             │
│  └──────────────────┘    └──────────────────┘             │
│                                                             │
│  Audit Logging Service   Database Persistence             │
│  ┌──────────────────┐    ┌──────────────────┐             │
│  │ logOperation()   │    │ persistRecords() │             │
│  │ logError()       │    │ updateRecords()  │             │
│  │ auditTrail()     │    │ transaction()    │             │
│  └──────────────────┘    └──────────────────┘             │
│                                                             │
└────────────┬───────────────────────────────────────────────┘
             │
┌────────────▼───────────────────────────────────────────────┐
│         VERTICAL-SPECIFIC SERVICES                         │
├────────────────────────────────────────────────────────────┤
│  ClientImportService        ClientExportService            │
│  CaregiverImportService     CaregiverExportService         │
│  VisitImportService         VisitExportService             │
│  CarePlanImportService      CarePlanExportService         │
│  (... all verticals ...)    (... all verticals ...)        │
└────────────┬───────────────────────────────────────────────┘
             │
┌────────────▼───────────────────────────────────────────────┐
│              DATABASE LAYER (PostgreSQL)                   │
├────────────────────────────────────────────────────────────┤
│  Clients  Caregivers  Visits  CarePlans  Invoices          │
│  Medications  Permissions  AuditLog  ImportLog             │
└────────────────────────────────────────────────────────────┘
```

### 4.2 File Organization

```
packages/
├── core/src/
│   ├── import/                           # ✅ EXISTING
│   │   ├── index.ts                      # Exports
│   │   ├── types.ts                      # Interfaces
│   │   └── csv-parser.ts                 # CSV utilities (with toCsv)
│   │
│   └── export/                           # 🆕 NEW
│       ├── index.ts                      # Exports
│       ├── types.ts                      # Export interfaces
│       ├── formats/
│       │   ├── csv-formatter.ts          # CSV export logic
│       │   ├── excel-formatter.ts        # Excel export (xlsx)
│       │   ├── pdf-formatter.ts          # PDF export (jsPDF)
│       │   └── json-formatter.ts         # Internal format
│       ├── audit-logger.ts               # Import/export audit trail
│       └── migration/
│           ├── migrator.ts               # Data migration orchestrator
│           ├── validators.ts             # State validation
│           └── conflict-resolver.ts      # Duplicate handling
│
├── client-demographics/src/
│   ├── import/                           # ✅ EXISTS
│   │   └── client-import-service.ts
│   │
│   └── export/                           # 🆕 NEW
│       ├── client-export-service.ts      # Export implementation
│       ├── templates/
│       │   ├── client-export.csv         # Template for validation
│       │   └── client-export.xlsx        # Excel template
│       └── validators/
│           └── client-export-validator.ts # Business rule validation
│
├── caregiver-staff/src/
│   ├── import/                           # 🆕 NEW (parallel to clients)
│   │   └── caregiver-import-service.ts
│   └── export/                           # 🆕 NEW
│       ├── caregiver-export-service.ts
│       ├── templates/
│       └── validators/
│
├── (all other verticals follow same pattern)
│
├── app/src/
│   ├── routes/
│   │   ├── import-routes.ts              # ✅ EXISTS (clients only)
│   │   ├── export-routes.ts              # 🆕 NEW
│   │   └── migration-routes.ts           # 🆕 NEW
│   │
│   └── middleware/
│       ├── import-quota.ts               # Rate limiting
│       └── export-quota.ts               # Export frequency limits
│
└── web/src/
    ├── pages/
    │   ├── export.tsx                    # 🆕 Export page
    │   └── import.tsx                    # 🆕 Import page (enhanced)
    │
    └── components/
        ├── ExportModal.tsx               # Export UI component
        ├── ImportWizard.tsx              # Import wizard (multi-step)
        ├── ExportPreview.tsx             # Format preview
        └── AuditTrail.tsx                # Audit log viewer
```

---

## 5. DATA FLOW SPECIFICATIONS

### 5.1 Import Flow (Enhanced)

```
File Upload
    │
    ▼
┌──────────────────────┐
│ Format Detection     │ (MIME type, file ext)
│ Size Validation      │ (max 10MB)
│ Encoding Check       │ (UTF-8, Latin-1)
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│ Parse File           │ formatParser.parse()
│ - CSV: papaparse     │
│ - Excel: xlsx lib    │
│ - JSON: JSON.parse   │
└──────┬───────────────┘
       │
       ├─ Errors? ──→ Return parse errors
       │
       ▼
┌──────────────────────┐
│ Extract Records      │ rows → objects
│ Normalize Headers    │ whitespace, case
│ Detect Columns       │ identify missing/extra
└──────┬───────────────┘
       │
       ├─ Missing required? ──→ Return column errors
       │
       ▼
┌──────────────────────┐
│ Validate Each Row    │ validateRecord() ×N
│ - Data types         │
│ - Foreign keys       │
│ - Business rules     │
│ - Duplicates         │
└──────┬───────────────┘
       │
       ├─ Row errors? ──→ Row-level error list
       │
       ▼
┌──────────────────────┐
│ Transform Records    │ mapToEntity()
│ - Apply defaults     │
│ - Convert types      │
│ - Resolve refs       │
└──────┬───────────────┘
       │
       ├─ DRY-RUN? ──→ Return preview
       │
       ▼
┌──────────────────────┐
│ User Approval        │ "Proceed?" dialog
│ - Summary: N records │
│ - Errors: N warnings │
│ - Conflicts: N dupes │
└──────┬───────────────┘
       │
       ├─ Cancel? ──→ Abort
       │
       ▼
┌──────────────────────┐
│ Batch Insert/Update  │ SQL: INSERT/UPDATE
│ - With transaction   │ - Foreign key checks
│ - Set audit trail    │ - Updated_by, updated_at
│ - Batch size: 100    │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│ Log Operation        │ Import completion
│ - User ID            │ - File metadata
│ - Timestamp          │ - Success count
│ - Error summary      │ - Duration
└──────┬───────────────┘
       │
       ▼
Success: N imported, M updated, K skipped, L errors
```

### 5.2 Export Flow (New)

```
API Request: GET /api/export/clients?format=csv&filters=...
    │
    ▼
┌──────────────────────┐
│ Authenticate User    │ JWT validation
│ Check Permissions    │ export_data permission
│ Verify Organization  │ multiTenant isolation
└──────┬───────────────┘
       │
       ├─ Unauthorized? ──→ 403 Forbidden
       │
       ▼
┌──────────────────────┐
│ Build Query          │ Apply filters
│ - Date range         │ - Status, type, etc
│ - Status, type       │ - Pagination (if needed)
│ - Pagination         │ - Sorting
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│ Fetch Data           │ collectData() ×N rows
│ - From database      │
│ - Apply permissions  │ (row-level filtering)
│ - Stream results     │ (memory efficient)
└──────┬───────────────┘
       │
       ├─ No data? ──→ Return empty export
       │
       ▼
┌──────────────────────┐
│ Transform to Format  │ formatData()
│ - CSV: toCsv()       │ - Field mapping
│ - Excel: toExcel()   │ - Type conversion
│ - PDF: toPdf()       │ - Formatting
│ - JSON: toJson()     │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│ Add Metadata         │
│ - Export timestamp   │ - User ID
│ - File name          │ - Organization
│ - Record count       │ - Filters applied
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│ Log Export           │ AuditLog entry
│ - Operation: EXPORT  │ - Timestamp
│ - Record count       │ - Filters
│ - User ID            │ - Duration
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│ Stream Response      │
│ - Content-Type       │ (application/vnd.ms-excel)
│ - Content-Disposition│ (attachment; filename=...)
│ - Gzip compression   │
└──────┬───────────────┘
       │
       ▼
Success: File downloaded to user's device
```

### 5.3 Migration Flow (New)

```
POST /api/migration/execute {sourceFormat, targetFormat, ...}
    │
    ▼
┌──────────────────────┐
│ Validate Source      │ Format plugin available?
│ Validate Target      │ Schema compatibility?
│ Validate User        │ admin permission?
└──────┬───────────────┘
       │
       ├─ Invalid? ──→ Return validation errors
       │
       ▼
┌──────────────────────┐
│ DRY-RUN: Parse       │ Extract from source
│ - Source validation  │ - Target schema check
│ - Conflict analysis  │ - Duplicate detection
│ - Row count          │ - Data quality score
└──────┬───────────────┘
       │
       ├─ Major issues? ──→ Warn user
       │
       ▼
┌──────────────────────┐
│ User Approval        │ "Proceed?" with warnings
│ - Summary            │ - Duplicates: K
│ - Conflicts: N       │ - Missing: M
│ - Data quality: X%   │ - Warnings: L
└──────┬───────────────┘
       │
       ├─ Reject? ──→ Abort
       │
       ▼
┌──────────────────────┐
│ Resolve Conflicts    │ conflictResolver
│ - Merge strategy     │ - Update existing?
│ - Dedup logic        │ - Keep new only?
│ - State transitions  │ - Custom handler?
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│ Validate State       │ stateValidator
│ - Pre-conditions     │ - All requirements met?
│ - Data consistency   │ - Referential integrity?
│ - Business rules     │ - State machine valid?
└──────┬───────────────┘
       │
       ├─ Invalid? ──→ Return state errors
       │
       ▼
┌──────────────────────┐
│ Batch Migrate        │ (with transaction)
│ - Insert new         │ - Batch size: 100
│ - Update existing    │ - Foreign key checks
│ - Set created_by     │ - Rollback on error
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│ Log Migration        │ AuditLog
│ - Source/Target      │ - User ID
│ - Record count       │ - Timestamp
│ - Conflicts resolved │ - Duration
└──────┬───────────────┘
       │
       ▼
Success: N records migrated, M conflicts resolved
```

---

## 6. API SPECIFICATION

### 6.1 Export Endpoints

#### GET /api/export/clients
Export clients in specified format
```http
GET /api/export/clients?format=csv&from_date=2026-01-01&status=active HTTP/1.1
Authorization: Bearer {token}
Accept: text/csv

Response 200:
Content-Type: text/csv; charset=utf-8
Content-Disposition: attachment; filename="clients_2026-09-20.csv"
Content-Encoding: gzip

id,first_name,last_name,email,phone,status,address,created_at
123,John,Doe,john@example.com,555-0001,active,"123 Main St",2026-01-15
124,Jane,Smith,jane@example.com,555-0002,active,"456 Oak Ave",2026-02-20
...
```

#### GET /api/export/clients/:id
Export single client record
```http
GET /api/export/clients/123?format=json HTTP/1.1
Authorization: Bearer {token}

Response 200:
{
  "id": "123",
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "phone": "555-0001",
  "status": "active",
  "address": "123 Main St",
  "createdAt": "2026-01-15T10:30:00Z",
  "createdBy": "user-456",
  "metadata": {
    "exportedAt": "2026-09-20T14:23:00Z",
    "exportedBy": "user-789",
    "format": "json"
  }
}
```

#### GET /api/export/caregivers
Export caregivers with certifications
```http
GET /api/export/caregivers?format=excel&certifications=RN,LPN HTTP/1.1
Authorization: Bearer {token}
Accept: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet

Response 200:
Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
Content-Disposition: attachment; filename="caregivers_2026-09-20.xlsx"

[Excel file with two sheets: Caregivers, Certifications]
```

#### GET /api/export/visits
Export visits with optional formatting
```http
GET /api/export/visits?format=pdf&from_date=2026-09-01&to_date=2026-09-30 HTTP/1.1
Authorization: Bearer {token}
Accept: application/pdf

Response 200:
Content-Type: application/pdf
Content-Disposition: attachment; filename="visits_sep2026.pdf"

[PDF report with formatted tables, charts, summary]
```

#### GET /api/export/audit-log
Export compliance audit trail
```http
GET /api/export/audit-log?format=csv&entity=invoices&from_date=2026-01-01 HTTP/1.1
Authorization: Bearer {token}

Response 200:
timestamp,user_id,operation,entity_type,entity_id,changes,ip_address,status
2026-09-20T14:23:00Z,user-123,EXPORT,invoice,inv-456,,192.0.2.1,success
2026-09-20T14:22:45Z,user-123,IMPORT,client,clt-789,"[name]",192.0.2.1,success
...
```

### 6.2 Import Endpoints

#### POST /api/import/clients
Import clients from CSV/Excel
```http
POST /api/import/clients HTTP/1.1
Authorization: Bearer {token}
Content-Type: multipart/form-data

form-data:
  file: clients.csv
  dryRun: true
  updateExisting: false

Response 200:
{
  "success": true,
  "imported": 95,
  "updated": 0,
  "skipped": 5,
  "total": 100,
  "errors": [
    {
      "row": 42,
      "field": "email",
      "message": "Invalid email format",
      "severity": "ERROR"
    },
    {
      "row": 78,
      "field": "phone",
      "message": "Duplicate phone number",
      "severity": "WARNING"
    }
  ],
  "importedIds": ["cli-001", "cli-002", ...],
  "metadata": {
    "startedAt": "2026-09-20T14:20:00Z",
    "completedAt": "2026-09-20T14:22:30Z",
    "durationMs": 150000,
    "sourceFile": {
      "name": "clients.csv",
      "size": 45234,
      "mimeType": "text/csv"
    }
  }
}
```

#### POST /api/import/clients/dry-run
Validate import without persisting
```http
POST /api/import/clients/dry-run HTTP/1.1
Authorization: Bearer {token}
Content-Type: multipart/form-data

form-data:
  file: clients.csv

Response 200:
{
  "success": true,
  "imported": 95,
  "updated": 0,
  "skipped": 5,
  "total": 100,
  "errors": [...],
  "preview": [
    {
      "id": null,
      "firstName": "John",
      "lastName": "Doe",
      "email": "john@example.com",
      "action": "INSERT"
    },
    {
      "id": "cli-001",
      "firstName": "Jane",
      "lastName": "Smith",
      "email": "jane@example.com",
      "action": "UPDATE"
    }
  ]
}
```

### 6.3 Migration Endpoints

#### POST /api/migration/analyze
Analyze migration feasibility (dry-run)
```http
POST /api/migration/analyze HTTP/1.1
Authorization: Bearer {token}
Content-Type: application/json

{
  "sourceFormat": "legacy_csv",
  "targetFormat": "folkcare_v2",
  "dataFile": "base64_encoded_file",
  "mappings": {
    "client_id": "id",
    "first_nm": "firstName",
    "last_nm": "lastName"
  }
}

Response 200:
{
  "success": true,
  "sourceRecords": 1250,
  "duplicates": 47,
  "conflicts": 23,
  "missingFields": ["emergency_contact"],
  "dataQualityScore": 0.92,
  "estimatedDuration": "2m 45s",
  "warnings": [
    "47 duplicate client IDs detected",
    "23 phone number format mismatches",
    "Emergency contact field not found in source"
  ],
  "canProceed": true
}
```

#### POST /api/migration/execute
Execute the migration
```http
POST /api/migration/execute HTTP/1.1
Authorization: Bearer {token}
Content-Type: application/json

{
  "sourceFormat": "legacy_csv",
  "targetFormat": "folkcare_v2",
  "dataFile": "base64_encoded_file",
  "mappings": {...},
  "conflictResolution": "merge",
  "createBackup": true
}

Response 200:
{
  "success": true,
  "migrationId": "mig-20260920-1423",
  "recordsMigrated": 1250,
  "conflictsResolved": 47,
  "errors": 0,
  "duration": "2m 43s",
  "backupFile": "backup_20260920_142300.sql",
  "auditTrail": {
    "startedAt": "2026-09-20T14:23:00Z",
    "completedAt": "2026-09-20T14:25:43Z",
    "userId": "user-123",
    "ipAddress": "192.0.2.1"
  }
}
```

---

## 7. DATA FORMAT SPECIFICATIONS

### 7.1 CSV Format

**Client Export CSV Template**:
```
id,first_name,last_name,email,phone,date_of_birth,address,city,state,zip,status,notes,created_at,updated_at,created_by
123,John,Doe,john@example.com,555-0001,1950-01-15,123 Main St,Springfield,IL,62701,active,Regular client,2026-01-15T10:00:00Z,2026-09-20T14:00:00Z,user-456
124,Jane,Smith,jane@example.com,555-0002,1955-06-20,456 Oak Ave,Springfield,IL,62702,active,New client,2026-02-20T10:00:00Z,2026-09-20T14:00:00Z,user-456
```

**Caregiver Import CSV Template**:
```
external_id,first_name,last_name,email,phone,ssn_last_4,status,certifications,specializations,hourly_rate,background_clear,availability_notes
legacy-001,Mary,Johnson,mary@example.com,555-1001,1234,active,RN|LPN,Dementia|Wound Care,35.50,true,Weekends available
legacy-002,Bob,Williams,bob@example.com,555-1002,5678,active,CNA,Patient Transport,18.50,true,Mon-Fri only
```

**Validation Rules**:
- `id`: Unique identifier (UUID or natural key)
- `phone`: Valid E.164 format or local format with country context
- `email`: RFC 5322 compliant
- `date_of_birth`: ISO 8601 (YYYY-MM-DD)
- `status`: One of [active, inactive, archived, pending]
- Sensitive fields (SSN, address): Stripped or masked in exports without "full_access" permission

---

### 7.2 Excel Format (XLSX)

**Structure**: Multiple sheets with metadata
- **Sheet 1: Clients**: Main data with headers highlighted
- **Sheet 2: Metadata**: Export info, column descriptions
- **Sheet 3 (optional): Validation**: Data quality checks, error rows

**Features**:
- Named columns with data type hints (header row formatting)
- Frozen header rows for scrolling
- Column width auto-fit
- Date formatting (MM/DD/YYYY)
- Number formatting (currency, decimals)
- Conditional formatting for status (green=active, red=inactive)
- Input validation on import-template sheets (dropdowns for status, certifications)

---

### 7.3 PDF Format

**Components**:
- **Header**: Organization logo, report title, export timestamp
- **Summary**: Total records, date range, filters applied
- **Data Tables**: Formatted with alternating row colors
- **Footer**: Page numbers, data confidentiality notice, audit trail
- **Charts** (optional): Records by status, timeline trends

**Generation**: Use `jsPDF` with auto-table plugin
```typescript
const doc = new jsPDF();
const columns = ['ID', 'Name', 'Email', 'Status'];
const rows = data.map(row => [row.id, row.name, row.email, row.status]);
doc.autoTable({ columns, body: rows });
doc.save('export.pdf');
```

---

## 8. DATABASE SCHEMA EXTENSIONS

### 8.1 Import Audit Table
```sql
CREATE TABLE import_operations (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID NOT NULL REFERENCES users(id),
  
  entity_type VARCHAR(50) NOT NULL,        -- 'client', 'caregiver', etc
  file_name VARCHAR(255),
  file_size BIGINT,
  file_hash VARCHAR(64),                   -- SHA-256 for integrity
  
  total_records INT,
  imported_count INT,
  updated_count INT,
  skipped_count INT,
  error_count INT,
  
  status VARCHAR(20),                      -- 'pending', 'success', 'partial', 'failed'
  dryrun BOOLEAN DEFAULT FALSE,
  update_existing BOOLEAN DEFAULT FALSE,
  
  error_summary JSONB,                     -- Array of ImportError
  conflict_resolution_strategy VARCHAR(20),
  
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  duration_ms INT,
  
  ip_address INET,
  user_agent TEXT,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_import_ops_org_user 
  ON import_operations(organization_id, user_id);
CREATE INDEX idx_import_ops_entity 
  ON import_operations(entity_type);
CREATE INDEX idx_import_ops_created 
  ON import_operations(created_at DESC);
```

### 8.2 Export Audit Table
```sql
CREATE TABLE export_operations (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID NOT NULL REFERENCES users(id),
  
  entity_type VARCHAR(50) NOT NULL,        -- 'client', 'caregiver', etc
  format VARCHAR(20) NOT NULL,             -- 'csv', 'excel', 'pdf'
  
  record_count INT,
  file_size BIGINT,
  
  filters JSONB,                           -- Applied filters
  column_selection VARCHAR(50),            -- 'full', 'minimal', 'custom'
  
  ip_address INET,
  user_agent TEXT,
  
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  duration_ms INT,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_export_ops_org_user 
  ON export_operations(organization_id, user_id);
CREATE INDEX idx_export_ops_created 
  ON export_operations(created_at DESC);
```

### 8.3 Migration History Table
```sql
CREATE TABLE migrations (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID NOT NULL REFERENCES users(id),
  
  migration_name VARCHAR(255),
  source_format VARCHAR(50),
  target_format VARCHAR(50),
  
  total_records INT,
  migrated_count INT,
  conflict_count INT,
  
  conflict_resolution_strategy VARCHAR(50),
  mappings JSONB,                          -- Field mapping definitions
  
  backup_file_path TEXT,                   -- Path to backup for rollback
  backup_file_hash VARCHAR(64),
  
  status VARCHAR(20),                      -- 'pending', 'success', 'rolled_back'
  rollback_reason TEXT,
  
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  duration_ms INT,
  
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_migrations_org 
  ON migrations(organization_id);
```

---

## 9. SECURITY & COMPLIANCE

### 9.1 Access Control

**Required Permissions**:
```typescript
// Import
- import:clients, import:caregivers, import:visits, ...
- import:dryrun (required for test imports)

// Export  
- export:clients, export:caregivers, export:visits, ...
- export:full_access (include sensitive fields)
- export:pii (for Full SSN, etc)

// Migration
- admin:migrate (super-user only)
- admin:create_backups
```

**Row-Level Filtering**:
- Non-admin users only export/import their organization's data
- Supervisors limited to their branch/team
- Field-level masking for sensitive data (SSN, full address) unless has `export:pii` permission

### 9.2 Audit Trail

**Logged Events**:
- ✅ Every import operation (user, timestamp, file, results)
- ✅ Every export operation (user, timestamp, filters, record count)
- ✅ Conflicts detected and resolution applied
- ✅ Errors with row-level details
- ✅ All migrations with before/after snapshots
- ✅ Access to sensitive fields

**Retention**:
- 7 years for healthcare compliance (HIPAA, state regulations)
- Immutable log entries (can't be edited, only archived)

### 9.3 Data Protection

**In Transit**:
- HTTPS only, TLS 1.3+
- File uploads validated before storage
- Gzip compression for responses

**At Rest**:
- Encrypted file uploads (AES-256 in transit)
- PII masked in logs (name → `[NAME]`, email → `[EMAIL]`)
- Sensitive fields excluded from default exports

**Backup/Rollback**:
- Migrations create automatic backups
- Rollback available for 30 days post-migration
- Snapshots of all modified records for audit

---

## 10. ERROR HANDLING

### 10.1 Parse Errors
```typescript
{
  "row": 0,                          // Header row
  "field": "email",
  "message": "Missing required column 'email'",
  "severity": "ERROR"
}
```

### 10.2 Validation Errors
```typescript
{
  "row": 42,
  "field": "phone",
  "message": "Invalid phone format. Expected E.164 (e.g., +1-555-0123) or local (555-0123)",
  "severity": "ERROR",
  "data": { "phone": "123" }  // Original value
}
```

### 10.3 Business Rule Errors
```typescript
{
  "row": 78,
  "field": "email",
  "message": "Email already exists (client ID: cli-001). Use dryRun=false, updateExisting=true to overwrite",
  "severity": "WARNING"
}
```

### 10.4 System Errors
```typescript
{
  "row": 0,
  "message": "Database connection timeout after 30s. Please try again.",
  "severity": "ERROR"
}
```

---

## 11. IMPLEMENTATION PHASES

### Phase 1: Foundation (Weeks 1-2)
- ✅ Extend `@folkcare/core/export` package with base infrastructure
- ✅ CSV export formatter (reuse `toCsv()` from csv-parser)
- ✅ Export routes for all entities
- ✅ Audit logging infrastructure

**Deliverables**:
- Export endpoints for: Clients, Caregivers, Visits, CarePlans
- CSV and JSON export formats
- Audit trail logging for imports and exports
- Tests: ≥80% coverage

### Phase 2: Excel & PDF (Weeks 3-4)
- ✅ Excel formatter with formatting/validation
- ✅ PDF formatter with templating
- ✅ Format templates with headers/footers
- ✅ Web UI export modal

**Deliverables**:
- Excel exports with formatting
- PDF reports with summaries
- Export modal in web UI
- Template management

### Phase 3: Import Enhancement (Week 5)
- ✅ Extend import to all verticals (parallel to Phase 2)
- ✅ Import wizard UI with multi-step flow
- ✅ Template download for each entity
- ✅ Conflict resolution UI

**Deliverables**:
- Import support for all entities (not just clients)
- Multi-step import wizard
- Template generation
- Conflict resolution

### Phase 4: Migration Tools (Week 6)
- ✅ Migration engine with conflict resolution
- ✅ State validation framework
- ✅ Backup/rollback functionality
- ✅ Admin dashboard for migrations

**Deliverables**:
- Migration analyzer (dry-run)
- Migration executor
- Backup/rollback system
- Admin UI

---

## 12. TESTING STRATEGY

### 12.1 Unit Tests
```typescript
// @folkcare/core/export
describe('CsvFormatter', () => {
  it('formats records to CSV with headers');
  it('escapes special characters in values');
  it('handles empty arrays');
  it('applies column selection filters');
});

// Vertical-specific
describe('ClientExportService', () => {
  it('collects client data with relations');
  it('applies organization filter');
  it('masks sensitive fields when needed');
  it('supports custom field selection');
});
```

### 12.2 Integration Tests
```typescript
describe('Export Flow', () => {
  it('exports clients to CSV');
  it('exports caregivers to Excel');
  it('exports audit log to PDF');
  it('logs export operation');
  it('respects user permissions');
});

describe('Import Flow', () => {
  it('imports CSV file');
  it('detects duplicates');
  it('validates data before import');
  it('supports dry-run');
  it('creates audit trail');
});
```

### 12.3 E2E Tests
```typescript
describe('Export/Import Workflow', () => {
  it('export clients to CSV');
  it('modify CSV file');
  it('import modified CSV');
  it('verify imported data matches original + modifications');
});

describe('Migration Workflow', () => {
  it('analyze legacy data');
  it('preview migration changes');
  it('execute migration');
  it('verify data integrity post-migration');
  it('rollback migration on request');
});
```

---

## 13. ACCEPTANCE CRITERIA

### AC1: CSV Export/Import
- [ ] GET /api/export/{entity}?format=csv returns valid CSV
- [ ] POST /api/import/{entity} accepts CSV file
- [ ] Import dry-run validates without persisting
- [ ] Row-level errors reported with field context
- [ ] Audit log entries created for all operations

### AC2: Excel Export/Import
- [ ] GET /api/export/{entity}?format=excel returns XLSX
- [ ] XLSX has multiple sheets (data, metadata, validation)
- [ ] Headers formatted with data types
- [ ] POST /api/import/{entity} accepts XLSX files
- [ ] Conditional formatting applied (status colors)

### AC3: PDF Export
- [ ] GET /api/export/{entity}?format=pdf returns PDF
- [ ] PDF includes header, summary, data table, footer
- [ ] Export timestamp and user ID visible
- [ ] Data confidentiality notice included

### AC4: Web UI
- [ ] Export modal accessible from entity list pages
- [ ] Format selection (CSV, Excel, PDF)
- [ ] Filter/column selection options
- [ ] Import wizard with multi-step flow
- [ ] Progress indicator and completion summary

### AC5: Permissions
- [ ] export:clients permission required for client exports
- [ ] export:full_access needed for sensitive fields
- [ ] Non-admin limited to own organization
- [ ] Supervisors limited to own branch

### AC6: Audit Trail
- [ ] Every import logged with file metadata
- [ ] Every export logged with filters applied
- [ ] Conflicts and resolutions tracked
- [ ] 7-year retention policy enforced

### AC7: Migration
- [ ] Migration analyzer (dry-run) available
- [ ] Conflict resolution strategies (merge, overwrite, skip)
- [ ] Automatic backup before migration
- [ ] Rollback available for 30 days

### AC8: Error Handling
- [ ] Parse errors with column context
- [ ] Validation errors with field descriptions
- [ ] Duplicate detection with resolution options
- [ ] Business rule violations explained

### AC9: Performance
- [ ] Exports handle ≥100k records
- [ ] Streaming response for large exports
- [ ] Batch import in 100-record chunks
- [ ] ≤5s response time for <10k records

### AC10: Quality
- [ ] `npm run lint` passes (0 errors)
- [ ] `npm run typecheck` passes (0 errors)
- [ ] `npm run test` passes (≥80% coverage)
- [ ] `npm run build` succeeds

---

## 14. DEPENDENCIES & LIBRARIES

### Existing (reuse)
- `papaparse` v5.x - CSV parsing/generation ✅
- `multer` - File upload handling ✅
- `zod` - Runtime validation ✅
- `pg` - PostgreSQL queries ✅

### New
- `xlsx` v0.18+ - Excel file generation
- `jspdf` v2.5+ - PDF generation
- `jspdf-autotable` v3.5+ - PDF tables
- `fast-csv` v4.3+ - Alternative CSV parsing (optional)

**Bundle Impact**: 
- `xlsx`: ~400KB (gzipped: ~150KB)
- `jspdf`: ~250KB (gzipped: ~80KB)
- Total additional: ~230KB gzipped

---

## 15. KNOWN LIMITATIONS & FUTURE WORK

### Current Scope
- ✅ Formats: CSV, Excel, PDF, JSON
- ✅ Entities: Clients, Caregivers, Visits, CarePlans, Medications, Invoices
- ✅ Operations: Import, Export, Migrate
- ❌ Real-time sync (batched only)
- ❌ Delta exports (full snapshot only)
- ❌ Custom field mapping UI (API only)

### Future Enhancements (FC-20+)
- [ ] **HL7 v2.x export** for legacy system integration
- [ ] **FHIR R4 export** for healthcare interoperability
- [ ] **Real-time data sync** (CDC pipeline)
- [ ] **Delta exports** (only changed records)
- [ ] **Custom field mapping** visual editor
- [ ] **Scheduled exports** (auto-run on calendar)
- [ ] **Data transformation rules** (ETL framework)
- [ ] **Integration with third-party services** (Salesforce, NetSuite)

---

## 16. GLOSSARY & DEFINITIONS

| Term | Definition |
|------|-----------|
| **DRY-RUN** | Validation-only mode: parse, validate, and return preview without persisting changes |
| **CONFLICT** | Duplicate record or state mismatch when importing (natural key collision) |
| **AUDIT TRAIL** | Immutable log of all import/export operations with user context |
| **MULTI-TENANT** | Data isolation: users only see their organization's records |
| **NATURAL KEY** | Business identifier for uniqueness (email, phone, external_id) |
| **ROW-LEVEL** | Operating at individual record level (vs. file/batch level) |
| **FIELD-LEVEL** | Operating on specific columns (vs. entire records) |
| **STREAMING** | Processing data in chunks (vs. loading entire file into memory) |
| **SANITIZATION** | Removing sensitive info (SSN, full address) from exports |
| **ROLLBACK** | Reverting migration to previous state using backup |

---

## 17. REVISION HISTORY

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-20 | Agent | Initial TA spec |

---

## 18. APPROVAL & SIGN-OFF

**Specification Status**: ✅ COMPLETE

**Next Steps**:
1. Design Review: Domain expert validates architecture
2. API Review: REST endpoint contracts confirmed
3. Security Review: Permission model and encryption verified
4. Implementation: Phase 1 development begins
5. Testing: Unit/integration/E2E coverage

---

**Document Owner**: Engineering Team  
**Last Updated**: 2026-09-20  
**Version**: 1.0
