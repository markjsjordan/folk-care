# FC-14: Billing Dashboard - Technical Architecture Specification

**Feature**: Billing Dashboard with Invoices, Statements, and Filters  
**Status**: Technical Architecture Specification  
**Date**: September 20, 2026  
**Audience**: Implementation Team, Code Reviewers, QA Engineers

---

## 1. Executive Summary

FC-14 delivers a comprehensive billing dashboard UI component for organization administrators to view, search, and analyze billing activity. The dashboard surfaces invoices, statements, and billing trends with real-time filtering, date range selection, and status-based views. This spec defines the technical architecture, data flow, component hierarchy, filtering strategy, and integration points.

### Key Deliverables
- **Dashboard Component**: React/React Native unified billing dashboard
- **Invoice List View**: Searchable, filterable invoice table/list
- **Statement Generator**: On-demand PDF statement generation
- **Filter System**: Multi-criteria filtering (status, date range, payer, amount)
- **Backend API**: Optimized billing query endpoints with aggregation
- **Mobile Support**: Responsive design for tablet and mobile devices

### Business Context
- Addresses administrative needs for billing visibility and reporting
- Enables revenue cycle monitoring and decision-making
- Supports invoice reconciliation workflows
- Provides data foundation for financial dashboards

---

## 2. Requirements Analysis

### Functional Requirements

#### 2.1 Invoice Dashboard View

**User Story**: "As an administrator, I want to see all invoices with key summary data so I can understand billing status at a glance."

**Requirements**:
- Display list/table of invoices with columns:
  - Invoice number (sortable, clickable)
  - Payer name (filterable)
  - Invoice date (sortable)
  - Service period (date range)
  - Amount (sortable, currency formatted)
  - Amount paid (running balance)
  - Status badge (DRAFT, SUBMITTED, PARTIAL, PAID, OVERDUE, WRITTEN_OFF, DISPUTED, ON_HOLD, IN_DISPUTE, CANCELLED, ARCHIVED)
  - Days outstanding (calculated, red if >30 days)
  - Action buttons (view PDF, duplicate, mark paid, edit)

- Summary cards (above table):
  - Total invoiced this month/period
  - Total outstanding (aging 0-30, 30-60, 60-90, 90+ days)
  - Collection rate (paid / total invoiced)
  - Average days to payment

- Pagination (25/50/100 items per page)
- Sortable columns (default: invoice date DESC)
- No data state with helpful messaging

#### 2.2 Filtering System

**User Story**: "As an administrator, I want to filter invoices by multiple criteria to find what I'm looking for quickly."

**Requirements**:
- **Status Filter**: Multi-select checkboxes (DRAFT, SUBMITTED, PARTIAL, PAID, OVERDUE, etc.)
- **Date Range Filter**: 
  - Preset options: This Month, Last Month, Last 90 Days, Last Year, Custom Date Range
  - Custom: date picker for from/to
  - Apply to: invoice date OR service period (radio selection)
- **Payer Filter**: Multi-select dropdown with search/autocomplete
- **Amount Range Filter**: Min / Max numeric inputs
- **Search Box**: Full-text search across invoice number, payer name, service description
- **Filter State Persistence**: Filters saved in URL query params (shareable)
- **Quick Filters**: Preset badges (e.g., "Overdue", "This Month", "Unpaid")
- **Clear All**: Button to reset all filters
- **Active Filter Indicator**: Show count of active filters, display active filter pills with X to remove

#### 2.3 Statement Generation

**User Story**: "As an administrator, I want to generate PDF statements for specific invoices or date ranges for records or client delivery."

**Requirements**:
- **Statement Types**:
  - Individual Invoice PDF (print-friendly format)
  - Period Statement (multiple invoices in single PDF, date range grouped)
  - Aged AR Report (invoices aged by 0-30, 30-60, 60-90, 90+)

- **PDF Content**:
  - Header: Organization name, logo, contact info
  - Statement date range
  - Payer info (if filtered to single payer)
  - Invoice details: number, date, service period, amount, paid, balance
  - Totals row: subtotal, tax (if applicable), total due
  - Notes/terms
  - Footer: page numbering, generated date/time

- **Generation Options**:
  - Single-click export (applies to visible filtered data)
  - Email delivery (to admin email)
  - Download (.pdf file)
  - Print preview

#### 2.4 Analytics & Trends

**User Story**: "As an administrator, I want to see billing trends over time to monitor cash flow and revenue patterns."

**Requirements**:
- **Charts** (optional, MVP-1):
  - Invoiced vs. Paid trend (line chart, last 12 months)
  - Payer breakdown (pie chart, invoiced amount by payer)
  - Aging analysis (bar chart, amounts in each age bucket)
  
- **Key Metrics**:
  - Total Revenue (YTD and trailing 12 months)
  - Total Collected (YTD and trailing 12 months)
  - Accounts Receivable (current)
  - Days Sales Outstanding (DSO)
  - Collection Rate %

#### 2.5 Invoice Detail View

**User Story**: "As an administrator, I want to see full invoice details including line items when I click an invoice."

**Requirements**:
- **Modal or Sidebar Panel**:
  - Invoice header (number, dates, payer)
  - Line items table:
    - Service code
    - Service description
    - Units
    - Rate
    - Amount
    - Modifiers (if applicable)
  - Totals section
  - Payment history (list of payments applied to this invoice)
  - Status history (audit trail)
  - Action buttons: Mark Paid, Resend, Download PDF, Edit, Cancel
  - Close without saving (read-only by default)

#### 2.6 Responsive Design

**User Story**: "As a mobile admin, I want to use the billing dashboard on tablet or phone."

**Requirements**:
- **Web (Desktop)**: Full table with all columns, side filters, charts
- **Tablet** (768px-1024px): Condensed columns, stacked summary cards, filters as modal or slide-out
- **Mobile** (< 768px):
  - List view (cards instead of table)
  - Filters accessible via bottom sheet or modal
  - Single-action buttons or swipe actions
  - Touch-friendly tap targets (44px minimum)
  - One-column layout for invoice detail

---

### Non-Functional Requirements

#### 2.7 Performance

- **Dashboard Load**: < 2 seconds for 1000 invoices (lazy-loaded beyond visible)
- **Filter Response**: < 500ms query + render for any filter combination
- **PDF Generation**: < 5 seconds for statement with 50 invoices
- **Pagination**: Virtual scrolling for large lists
- **Caching**: Client-side filter state, recent searches cached
- **Database Queries**: Indexed on (organization_id, invoice_date), (organization_id, status), (organization_id, payer_id)

#### 2.8 Security & Compliance

- **Authorization**: Users can only see invoices for their organization
- **HIPAA**: Invoice PDFs not cached publicly; download links time-limited (1 hour TTL)
- **Audit Trail**: All invoice views, exports, and edits logged with user/timestamp
- **Field-Level Permissions**: Finance role required to view amounts; admin can delegate view-only roles
- **Rate Limiting**: 100 requests/min per user for API endpoints

#### 2.9 Accessibility (WCAG 2.1 AA)

- Semantic HTML (`<table>` for table data, `<form>` for filters)
- ARIA labels on custom components (filter toggle, status badge)
- Keyboard navigation: Tab through filters, Enter to apply, Escape to close modals
- Color not sole indicator (status badges use text + icon + color)
- Focus indicators on interactive elements
- Screen reader support for dynamic updates (aria-live)

#### 2.10 Data Consistency

- **Eventual Consistency**: Invoices updated in real-time (WebSocket or polling)
- **Optimistic UI**: Filter applies locally, backend confirms; show spinner
- **Conflict Resolution**: If invoice state changed during view, show notification
- **Transactional Integrity**: Payment allocation and invoice status update atomically

---

## 3. Data Model

### 3.1 Core Entities

#### Invoice
```typescript
interface Invoice {
  id: UUID;
  organizationId: UUID;
  invoiceNumber: string;           // e.g., "INV-2026-09-001"
  payerId: UUID;                    // FK to payers table
  payerName: string;                // Denormalized for sorting/filtering
  invoiceDate: Date;                // When issued
  servicePeriodStart: Date;         // When services delivered
  servicePeriodEnd: Date;
  subtotalAmount: number;           // Before tax
  taxAmount: number;
  totalAmount: number;              // Subtotal + tax
  paidAmount: number;               // Sum of applied payments
  balanceAmount: number;            // totalAmount - paidAmount
  status: InvoiceStatus;            // DRAFT | SUBMITTED | PARTIAL | PAID | ...
  statusHistory: StatusChange[];    // Audit trail with timestamps
  dueDate: Date;                    // Payment due date
  notes: string | null;
  pdfUrl: string | null;            // S3 or similar
  pdfGeneratedAt: Date | null;
  lineItems: InvoiceLineItem[];     // Nested JSONB
  paymentHistory: Payment[];        // FK join to payments
  createdAt: Date;
  createdBy: UUID;
  updatedAt: Date;
  updatedBy: UUID;
  version: number;                  // Optimistic locking
}

interface InvoiceLineItem {
  id: UUID;
  invoiceId: UUID;
  billableItemId: UUID | null;      // FK to billable_items
  serviceCode: string;              // CPT or custom code
  serviceDescription: string;
  units: number;
  unitType: string;                 // HOUR | VISIT | DAY | etc.
  unitRate: number;                 // Rate per unit
  subtotal: number;                 // units * unitRate
  modifiers: Modifier[];            // Weekend, holiday, etc.
  modifiedAmount: number;           // After modifiers
  taxAmount: number;
  lineTotal: number;                // modifiedAmount + tax
  sequence: number;                 // Display order
}

type InvoiceStatus = 
  | 'DRAFT'                  // Created but not submitted
  | 'SUBMITTED'              // Sent to payer
  | 'PARTIAL'                // Partially paid
  | 'PAID'                   // Fully paid
  | 'OVERDUE'                // Past due date, unpaid
  | 'WRITTEN_OFF'            // Marked as uncollectible
  | 'DISPUTED'               // Payer disputes amount
  | 'ON_HOLD'                // Held pending review
  | 'IN_DISPUTE'             // Under investigation
  | 'CANCELLED'              // Voided/reversed
  | 'ARCHIVED';              // Old, inactive
```

#### Payer
```typescript
interface Payer {
  id: UUID;
  organizationId: UUID;
  payerName: string;
  payerType: 'MEDICARE' | 'MEDICAID' | 'INSURANCE' | 'EMPLOYER' | 'INDIVIDUAL' | 'OTHER';
  taxId: string | null;             // EIN or SSN (encrypted)
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  billingAddress: Address;          // JSONB
  remittanceAddress: Address;       // Where payments sent
  billingCycle: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'CUSTOM';
  paymentTermsDays: number;         // Net 30, etc.
  averagePaymentDays: number;       // Calculated metric
  denialRate: number;               // Percentage
  status: 'ACTIVE' | 'INACTIVE' | 'PENDING_VERIFICATION';
}

interface Address {
  street1: string;
  street2?: string;
  city: string;
  stateProvince: string;
  postalCode: string;
  country: string;
}
```

#### Payment
```typescript
interface Payment {
  id: UUID;
  organizationId: UUID;
  paymentNumber: string;            // e.g., "PAY-2026-09-001"
  payerId: UUID;                    // FK to payers
  paymentDate: Date;
  paymentMethod: 'CHECK' | 'ACH' | 'WIRE' | 'CREDIT_CARD' | 'ERA' | 'OTHER';
  paymentAmount: number;
  referenceNumber: string | null;   // Check #, wire ref, ERA reference
  depositDate: Date | null;
  status: PaymentStatus;            // RECEIVED | APPLIED | UNAPPLIED | RECONCILED
  allocations: PaymentAllocation[]; // Which invoices this payment covers
  notes: string | null;
  createdAt: Date;
  createdBy: UUID;
  updatedAt: Date;
  updatedBy: UUID;
}

type PaymentStatus = 'RECEIVED' | 'APPLIED' | 'UNAPPLIED' | 'PENDING_DEPOSIT' | 'RECONCILED' | 'DISPUTED' | 'REVERSED' | 'CANCELLED';

interface PaymentAllocation {
  id: UUID;
  paymentId: UUID;
  invoiceId: UUID;
  allocatedAmount: number;
}
```

### 3.2 Database Schema

```sql
-- Core tables
CREATE TABLE invoices (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  invoice_number VARCHAR(50) NOT NULL UNIQUE,
  payer_id UUID NOT NULL REFERENCES payers(id),
  payer_name VARCHAR(255) NOT NULL,  -- Denormalized
  invoice_date DATE NOT NULL,
  service_period_start DATE NOT NULL,
  service_period_end DATE NOT NULL,
  subtotal_amount DECIMAL(12,2) NOT NULL,
  tax_amount DECIMAL(12,2) NOT NULL,
  total_amount DECIMAL(12,2) NOT NULL,
  paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  balance_amount DECIMAL(12,2) GENERATED ALWAYS AS (total_amount - paid_amount),
  status VARCHAR(20) NOT NULL,
  status_history JSONB NOT NULL DEFAULT '[]',
  due_date DATE,
  notes TEXT,
  pdf_url VARCHAR(2048),
  pdf_generated_at TIMESTAMP,
  line_items JSONB NOT NULL,
  created_at TIMESTAMP NOT NULL,
  created_by UUID NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  updated_by UUID NOT NULL,
  version INT NOT NULL DEFAULT 1,
  
  -- Indexes for common queries
  UNIQUE(organization_id, invoice_number),
  INDEX idx_org_date (organization_id, invoice_date DESC),
  INDEX idx_org_status (organization_id, status),
  INDEX idx_org_payer (organization_id, payer_id),
  INDEX idx_org_balance (organization_id, balance_amount) WHERE balance_amount > 0,
  INDEX idx_due_date (due_date) WHERE status IN ('SUBMITTED', 'OVERDUE'),
  INDEX idx_created (created_at DESC)
);

CREATE TABLE payers (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  payer_name VARCHAR(255) NOT NULL,
  payer_type VARCHAR(20) NOT NULL,
  tax_id VARCHAR(255),  -- Encrypted
  contact_person VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(20),
  billing_address JSONB,
  remittance_address JSONB,
  billing_cycle VARCHAR(20),
  payment_terms_days INT,
  average_payment_days DECIMAL(5,1),
  denial_rate DECIMAL(5,2),
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP NOT NULL,
  created_by UUID NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  updated_by UUID NOT NULL,
  
  UNIQUE(organization_id, payer_name),
  INDEX idx_org_payer (organization_id, payer_name)
);

CREATE TABLE payments (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id),
  payment_number VARCHAR(50) NOT NULL UNIQUE,
  payer_id UUID NOT NULL REFERENCES payers(id),
  payment_date DATE NOT NULL,
  payment_method VARCHAR(20) NOT NULL,
  payment_amount DECIMAL(12,2) NOT NULL,
  reference_number VARCHAR(100),
  deposit_date DATE,
  status VARCHAR(20) NOT NULL,
  allocations JSONB NOT NULL DEFAULT '[]',  -- PaymentAllocation[]
  notes TEXT,
  created_at TIMESTAMP NOT NULL,
  created_by UUID NOT NULL,
  updated_at TIMESTAMP NOT NULL,
  updated_by UUID NOT NULL,
  
  INDEX idx_org_date (organization_id, payment_date DESC),
  INDEX idx_org_payer (organization_id, payer_id),
  INDEX idx_org_status (organization_id, status)
);

-- View for aggregated metrics
CREATE VIEW invoice_metrics AS
SELECT
  organization_id,
  COUNT(*) as invoice_count,
  SUM(total_amount) as total_invoiced,
  SUM(paid_amount) as total_paid,
  AVG(CAST(paid_amount AS DECIMAL) / NULLIF(total_amount, 0)) * 100 as collection_rate,
  AVG(EXTRACT(DAY FROM COALESCE(updated_at, invoice_date) - invoice_date)) as avg_days_to_pay
FROM invoices
WHERE status = 'PAID'
  AND invoice_date >= NOW() - INTERVAL '12 months'
GROUP BY organization_id;
```

---

## 4. Component Architecture

### 4.1 Component Tree

```
BillingDashboard (container)
├── DashboardHeader
│   ├── Title & Help Text
│   └── ExportButton (PDF)
├── SummaryCards
│   ├── TotalInvoicedCard
│   ├── TotalOutstandingCard
│   ├── CollectionRateCard
│   └── AverageDaysToPaymentCard
├── FilterBar (horizontal or slide-out on mobile)
│   ├── SearchBox
│   ├── StatusFilter (multi-select)
│   ├── DateRangeFilter (with presets)
│   ├── PayerFilter (autocomplete)
│   ├── AmountRangeFilter
│   ├── ActiveFilters (display/clear)
│   └── ClearAllButton
├── InvoiceTable/List
│   ├── Header Row (sortable columns)
│   ├── InvoiceRow (virtual scrolling)
│   │   ├── InvoiceNumber (link)
│   │   ├── PayerName
│   │   ├── InvoiceDateCell
│   │   ├── ServicePeriodCell
│   │   ├── AmountCell (currency formatted)
│   │   ├── PaidCell
│   │   ├── StatusBadge
│   │   ├── DaysOutstandingCell (conditional color)
│   │   └── ActionsMenu
│   │       ├── ViewPDF
│   │       ├── Duplicate
│   │       ├── MarkPaid
│   │       └── Edit
│   ├── EmptyState
│   └── Pagination / "Load More"
├── InvoiceDetailModal (slides in from right on desktop, full screen on mobile)
│   ├── Header
│   ├── InvoiceHeader Info
│   ├── LineItemsTable
│   ├── TotalsSection
│   ├── PaymentHistory
│   ├── StatusHistory
│   ├── ActionButtons
│   └── CloseButton
└── LoadingStates & Error Boundaries
```

### 4.2 API Endpoints

#### **GET /api/v1/billing/invoices**

Query invoices with filtering, sorting, pagination.

```typescript
// Request
interface InvoiceQuery {
  organizationId: UUID;
  status?: InvoiceStatus[];           // Multi-select
  dateFrom?: Date;                    // Service or invoice date
  dateTo?: Date;
  dateField?: 'invoiceDate' | 'servicePeriod'; // Which date to filter
  payerIds?: UUID[];                  // Multi-select
  search?: string;                    // Full-text search
  minAmount?: number;
  maxAmount?: number;
  sortBy?: 'invoiceDate' | 'amount' | 'payer' | 'status' | 'daysOutstanding';
  sortOrder?: 'ASC' | 'DESC';
  limit?: number;                     // Default 25, max 100
  offset?: number;
  includeLineItems?: boolean;         // Optional; full response or summary
}

// Response
interface InvoiceListResponse {
  invoices: InvoiceSummary[];
  total: number;
  pageSize: number;
  offset: number;
  hasMore: boolean;
  facets?: {                          // For filtering UI
    statuses: { status: string; count: number }[];
    payers: { payerId: UUID; payerName: string; count: number }[];
  };
}

interface InvoiceSummary {
  id: UUID;
  invoiceNumber: string;
  payerId: UUID;
  payerName: string;
  invoiceDate: Date;
  servicePeriodStart: Date;
  servicePeriodEnd: Date;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  status: InvoiceStatus;
  dueDate: Date | null;
  daysOutstanding: number;           // Calculated (today - invoiceDate)
  lineItemCount: number;
  pdfUrl?: string;                    // If generated
}
```

**SQL Implementation** (optimized):
```sql
SELECT
  i.id,
  i.invoice_number,
  i.payer_id,
  i.payer_name,
  i.invoice_date,
  i.service_period_start,
  i.service_period_end,
  i.total_amount,
  i.paid_amount,
  i.balance_amount,
  i.status,
  i.due_date,
  EXTRACT(DAY FROM CURRENT_DATE - i.invoice_date)::INT as days_outstanding,
  jsonb_array_length(i.line_items) as line_item_count,
  i.pdf_url
FROM invoices i
WHERE i.organization_id = $1
  AND ($2::VARCHAR[] IS NULL OR i.status = ANY($2::VARCHAR[]))
  AND ($3::DATE IS NULL OR i.invoice_date >= $3)
  AND ($4::DATE IS NULL OR i.invoice_date <= $4)
  AND ($5::UUID[] IS NULL OR i.payer_id = ANY($5::UUID[]))
  AND ($6::NUMERIC IS NULL OR i.total_amount >= $6)
  AND ($7::NUMERIC IS NULL OR i.total_amount <= $7)
  AND (
    $8::TEXT IS NULL OR
    i.invoice_number ILIKE '%' || $8 || '%' OR
    i.payer_name ILIKE '%' || $8 || '%'
  )
ORDER BY
  CASE WHEN $9 = 'invoiceDate' THEN i.invoice_date END DESC NULLS LAST,
  CASE WHEN $9 = 'amount' AND $10 = 'DESC' THEN i.total_amount END DESC,
  i.invoice_date DESC
LIMIT $11 OFFSET $12;
```

---

#### **GET /api/v1/billing/invoices/{invoiceId}**

Fetch full invoice details with line items and payment history.

```typescript
interface InvoiceDetailResponse {
  invoice: Invoice;           // Full invoice object
  lineItems: InvoiceLineItem[];
  payments: PaymentWithAllocations[];
  statusHistory: StatusChange[];
}

interface StatusChange {
  status: InvoiceStatus;
  changedAt: Date;
  changedBy: UUID;
  reason?: string;
}

interface PaymentWithAllocations {
  id: UUID;
  paymentNumber: string;
  paymentDate: Date;
  paymentMethod: string;
  paymentAmount: number;
  allocations: {
    invoiceId: UUID;
    allocatedAmount: number;
  }[];
}
```

---

#### **GET /api/v1/billing/metrics**

Fetch dashboard summary metrics.

```typescript
interface BillingMetricsResponse {
  periodStart: Date;
  periodEnd: Date;
  totalInvoiced: number;
  totalPaid: number;
  totalOutstanding: number;
  collectionRate: number;              // Percentage
  averageDaysToPayment: number;
  overdueDays30: number;                // Amount > 30 days past due
  overdueDays60: number;
  overdueDays90: number;
  invoiceCount: number;
  paidInvoiceCount: number;
  overdueInvoiceCount: number;
}
```

---

#### **POST /api/v1/billing/invoices/{invoiceId}/export**

Generate PDF export of invoice or statement.

```typescript
interface ExportRequest {
  type: 'INVOICE' | 'STATEMENT';
  format: 'PDF';
  statementPeriodStart?: Date;       // For STATEMENT type
  statementPeriodEnd?: Date;
  includePaymentHistory?: boolean;
}

interface ExportResponse {
  downloadUrl: string;                // Signed S3 URL, 1-hour TTL
  fileName: string;
  contentLength: number;
  expiresAt: Date;
}
```

---

#### **POST /api/v1/billing/invoices/{invoiceId}/mark-paid**

Mark an invoice as paid (update status, record payment implicitly).

```typescript
interface MarkPaidRequest {
  paymentDate: Date;
  paymentMethod: 'CHECK' | 'ACH' | 'WIRE' | 'OTHER';
  referenceNumber?: string;
  notes?: string;
}
```

---

#### **GET /api/v1/billing/payers**

List payers for filter dropdown.

```typescript
interface PayerListResponse {
  payers: {
    id: UUID;
    payerName: string;
    payerType: string;
    invoiceCount: number;             // How many invoices for this org
  }[];
}
```

---

### 4.3 Frontend Component Implementation

#### **BillingDashboard (Container)**

```typescript
// packages/web/src/verticals/billing-invoicing/components/BillingDashboard.tsx

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';

export interface FilterState {
  statuses: InvoiceStatus[];
  dateFrom: Date | null;
  dateTo: Date | null;
  dateField: 'invoiceDate' | 'servicePeriod';
  payerIds: UUID[];
  search: string;
  minAmount: number | null;
  maxAmount: number | null;
  sortBy: string;
  sortOrder: 'ASC' | 'DESC';
  pageSize: number;
  offset: number;
}

interface DashboardProps {
  organizationId: UUID;
  userRole: 'ADMIN' | 'FINANCE' | 'VIEWER';
}

export function BillingDashboard({ organizationId, userRole }: DashboardProps) {
  // State management
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState<FilterState>(parseFiltersFromUrl(searchParams));
  const [selectedInvoice, setSelectedInvoice] = useState<UUID | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Queries
  const { data: invoices, isLoading, error, refetch } = useQuery({
    queryKey: ['invoices', organizationId, filters],
    queryFn: () => fetchInvoices(organizationId, filters),
    staleTime: 30 * 1000, // 30 seconds
  });

  const { data: metrics } = useQuery({
    queryKey: ['billing-metrics', organizationId],
    queryFn: () => fetchMetrics(organizationId),
    staleTime: 60 * 1000,
  });

  const { data: payers } = useQuery({
    queryKey: ['payers', organizationId],
    queryFn: () => fetchPayers(organizationId),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Mutations
  const { mutate: exportPDF } = useMutation({
    mutationFn: (invoiceId: UUID) => exportInvoice(invoiceId),
    onSuccess: (url) => {
      window.open(url, '_blank');
    },
  });

  // URL sync
  useEffect(() => {
    const params = new URLSearchParams();
    if (filters.statuses.length > 0) {
      params.set('status', filters.statuses.join(','));
    }
    if (filters.dateFrom) params.set('dateFrom', filters.dateFrom.toISOString());
    if (filters.dateTo) params.set('dateTo', filters.dateTo.toISOString());
    // ... other filters
    setSearchParams(params);
  }, [filters, setSearchParams]);

  // Handlers
  const handleFilterChange = useCallback((newFilters: Partial<FilterState>) => {
    setFilters((prev) => ({ ...prev, ...newFilters, offset: 0 })); // Reset pagination
  }, []);

  const handleSort = useCallback(
    (column: string) => {
      const newSortBy = column;
      const newSortOrder =
        filters.sortBy === column && filters.sortOrder === 'ASC' ? 'DESC' : 'ASC';
      handleFilterChange({ sortBy: newSortBy, sortOrder: newSortOrder });
    },
    [filters, handleFilterChange]
  );

  const handlePageChange = useCallback(
    (newOffset: number) => {
      handleFilterChange({ offset: newOffset });
    },
    [handleFilterChange]
  );

  const handleInvoiceClick = useCallback((invoiceId: UUID) => {
    setSelectedInvoice(invoiceId);
    setDetailsOpen(true);
  }, []);

  // Rendering
  return (
    <div className="billing-dashboard">
      <DashboardHeader
        onExport={() => {
          // Export all filtered invoices as statement
        }}
      />

      {metrics && (
        <SummaryCards
          totalInvoiced={metrics.totalInvoiced}
          totalOutstanding={metrics.totalOutstanding}
          collectionRate={metrics.collectionRate}
          avgDaysToPayment={metrics.averageDaysToPayment}
        />
      )}

      <FilterBar
        filters={filters}
        payers={payers?.payers || []}
        onFilterChange={handleFilterChange}
        activeFilterCount={countActiveFilters(filters)}
      />

      {error && <ErrorAlert error={error} />}

      {isLoading ? (
        <LoadingSpinner />
      ) : invoices && invoices.invoices.length > 0 ? (
        <>
          <InvoiceTable
            invoices={invoices.invoices}
            sortBy={filters.sortBy}
            sortOrder={filters.sortOrder}
            onSort={handleSort}
            onRowClick={handleInvoiceClick}
            onExport={exportPDF}
          />
          <Pagination
            total={invoices.total}
            pageSize={filters.pageSize}
            offset={filters.offset}
            onPageChange={handlePageChange}
          />
        </>
      ) : (
        <EmptyState
          title="No invoices found"
          description="Try adjusting your filters"
          actionLabel="Clear filters"
          onAction={() => handleFilterChange(getDefaultFilters())}
        />
      )}

      {detailsOpen && selectedInvoice && (
        <InvoiceDetailModal
          invoiceId={selectedInvoice}
          onClose={() => setDetailsOpen(false)}
          onExport={() => exportPDF(selectedInvoice)}
          canEdit={userRole === 'ADMIN'}
        />
      )}
    </div>
  );
}
```

---

#### **FilterBar Component**

```typescript
// packages/web/src/verticals/billing-invoicing/components/FilterBar.tsx

export interface FilterBarProps {
  filters: FilterState;
  payers: Payer[];
  onFilterChange: (filters: Partial<FilterState>) => void;
  activeFilterCount: number;
}

export function FilterBar({
  filters,
  payers,
  onFilterChange,
  activeFilterCount,
}: FilterBarProps) {
  const [isOpen, setIsOpen] = useState(false); // For mobile/tablet

  const handleStatusChange = (statuses: InvoiceStatus[]) => {
    onFilterChange({ statuses });
  };

  const handleDatePreset = (preset: string) => {
    const { dateFrom, dateTo } = getDateRangeForPreset(preset);
    onFilterChange({ dateFrom, dateTo });
  };

  const handleSearchChange = (search: string) => {
    onFilterChange({ search });
  };

  const handleClearAll = () => {
    onFilterChange(getDefaultFilters());
  };

  return (
    <div className="filter-bar">
      <div className="filter-row">
        <SearchInput
          value={filters.search}
          placeholder="Search invoice #, payer..."
          onChange={handleSearchChange}
        />

        <StatusFilter
          selected={filters.statuses}
          onChange={handleStatusChange}
        />

        <DateRangeFilter
          dateFrom={filters.dateFrom}
          dateTo={filters.dateTo}
          dateField={filters.dateField}
          onPresetSelect={handleDatePreset}
          onDateChange={(dateFrom, dateTo) =>
            onFilterChange({ dateFrom, dateTo })
          }
          onDateFieldChange={(dateField) => onFilterChange({ dateField })}
        />

        <PayerFilter
          selected={filters.payerIds}
          payers={payers}
          onChange={(payerIds) => onFilterChange({ payerIds })}
        />

        <AmountRangeFilter
          minAmount={filters.minAmount}
          maxAmount={filters.maxAmount}
          onChange={(minAmount, maxAmount) =>
            onFilterChange({ minAmount, maxAmount })
          }
        />

        {activeFilterCount > 0 && (
          <Button variant="ghost" onClick={handleClearAll}>
            Clear All ({activeFilterCount})
          </Button>
        )}
      </div>

      {/* Active filters pills */}
      <div className="active-filters">
        {filters.statuses.map((status) => (
          <FilterPill
            key={status}
            label={status}
            onRemove={() =>
              handleStatusChange(filters.statuses.filter((s) => s !== status))
            }
          />
        ))}
        {/* ... other active filter pills */}
      </div>
    </div>
  );
}
```

---

#### **InvoiceTable Component**

```typescript
// packages/web/src/verticals/billing-invoicing/components/InvoiceTable.tsx

export interface InvoiceTableProps {
  invoices: InvoiceSummary[];
  sortBy: string;
  sortOrder: 'ASC' | 'DESC';
  onSort: (column: string) => void;
  onRowClick: (invoiceId: UUID) => void;
  onExport: (invoiceId: UUID) => void;
}

export function InvoiceTable({
  invoices,
  sortBy,
  sortOrder,
  onSort,
  onRowClick,
  onExport,
}: InvoiceTableProps) {
  return (
    <div className="invoice-table-container">
      <table className="invoice-table">
        <thead>
          <tr>
            <th onClick={() => onSort('invoiceNumber')}>
              Invoice # {sortBy === 'invoiceNumber' && <SortIcon order={sortOrder} />}
            </th>
            <th onClick={() => onSort('payer')}>
              Payer {sortBy === 'payer' && <SortIcon order={sortOrder} />}
            </th>
            <th onClick={() => onSort('invoiceDate')}>
              Invoice Date {sortBy === 'invoiceDate' && <SortIcon order={sortOrder} />}
            </th>
            <th>Service Period</th>
            <th onClick={() => onSort('amount')}>
              Amount {sortBy === 'amount' && <SortIcon order={sortOrder} />}
            </th>
            <th>Paid</th>
            <th>Balance</th>
            <th>Status</th>
            <th>Days Outstanding</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice) => (
            <tr key={invoice.id} className="invoice-row">
              <td
                className="invoice-number-cell clickable"
                onClick={() => onRowClick(invoice.id)}
              >
                {invoice.invoiceNumber}
              </td>
              <td>{invoice.payerName}</td>
              <td>{formatDate(invoice.invoiceDate)}</td>
              <td>
                {formatDate(invoice.servicePeriodStart)} –{' '}
                {formatDate(invoice.servicePeriodEnd)}
              </td>
              <td className="amount-cell">
                {formatCurrency(invoice.totalAmount)}
              </td>
              <td className="amount-cell">
                {formatCurrency(invoice.paidAmount)}
              </td>
              <td className="amount-cell balance-cell">
                {formatCurrency(invoice.balanceAmount)}
              </td>
              <td>
                <StatusBadge status={invoice.status} />
              </td>
              <td
                className={cn(
                  'days-outstanding-cell',
                  invoice.daysOutstanding > 30 && 'overdue'
                )}
              >
                {invoice.daysOutstanding} days
              </td>
              <td>
                <ActionsMenu
                  invoiceId={invoice.id}
                  onViewPDF={() => onExport(invoice.id)}
                  onDuplicate={() => {
                    // TODO: Implement
                  }}
                  onMarkPaid={() => {
                    // TODO: Implement
                  }}
                  onEdit={() => {
                    // TODO: Implement (if allowed)
                  }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

---

#### **InvoiceDetailModal Component**

```typescript
// packages/web/src/verticals/billing-invoicing/components/InvoiceDetailModal.tsx

export interface InvoiceDetailModalProps {
  invoiceId: UUID;
  onClose: () => void;
  onExport: () => void;
  canEdit: boolean;
}

export function InvoiceDetailModal({
  invoiceId,
  onClose,
  onExport,
  canEdit,
}: InvoiceDetailModalProps) {
  const { data: invoice, isLoading, error } = useQuery({
    queryKey: ['invoice-detail', invoiceId],
    queryFn: () => fetchInvoiceDetail(invoiceId),
  });

  if (isLoading) return <LoadingSpinner />;
  if (error || !invoice) return <ErrorAlert error={error} />;

  return (
    <div className="invoice-detail-modal-overlay" onClick={onClose}>
      <div
        className="invoice-detail-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Invoice {invoice.invoice.invoiceNumber}</h2>
          <button className="close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <section className="invoice-header">
            <div className="row">
              <div className="col">
                <p className="label">Payer</p>
                <p className="value">{invoice.invoice.payerName}</p>
              </div>
              <div className="col">
                <p className="label">Invoice Date</p>
                <p className="value">{formatDate(invoice.invoice.invoiceDate)}</p>
              </div>
              <div className="col">
                <p className="label">Due Date</p>
                <p className="value">
                  {invoice.invoice.dueDate
                    ? formatDate(invoice.invoice.dueDate)
                    : 'N/A'}
                </p>
              </div>
            </div>
          </section>

          <section className="line-items">
            <h3>Line Items</h3>
            <table>
              <thead>
                <tr>
                  <th>Service Code</th>
                  <th>Description</th>
                  <th>Units</th>
                  <th>Rate</th>
                  <th>Subtotal</th>
                  <th>Modifiers</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lineItems.map((item) => (
                  <tr key={item.id}>
                    <td>{item.serviceCode}</td>
                    <td>{item.serviceDescription}</td>
                    <td>{item.units}</td>
                    <td>{formatCurrency(item.unitRate)}</td>
                    <td>{formatCurrency(item.subtotal)}</td>
                    <td>{item.modifiers.map((m) => m.type).join(', ')}</td>
                    <td>{formatCurrency(item.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="totals">
            <div className="total-row">
              <span>Subtotal:</span>
              <span>{formatCurrency(invoice.invoice.subtotalAmount)}</span>
            </div>
            <div className="total-row">
              <span>Tax:</span>
              <span>{formatCurrency(invoice.invoice.taxAmount)}</span>
            </div>
            <div className="total-row grand-total">
              <span>Total:</span>
              <span>{formatCurrency(invoice.invoice.totalAmount)}</span>
            </div>
            {invoice.invoice.balanceAmount > 0 && (
              <div className="total-row balance">
                <span>Balance Due:</span>
                <span>{formatCurrency(invoice.invoice.balanceAmount)}</span>
              </div>
            )}
          </section>

          {invoice.payments.length > 0 && (
            <section className="payment-history">
              <h3>Payment History</h3>
              <ul>
                {invoice.payments.map((payment) => (
                  <li key={payment.id}>
                    <p>
                      {payment.paymentNumber} –{' '}
                      {formatCurrency(payment.paymentAmount)} on{' '}
                      {formatDate(payment.paymentDate)} via{' '}
                      {payment.paymentMethod}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {invoice.statusHistory.length > 0 && (
            <section className="status-history">
              <h3>Status History</h3>
              <ul>
                {invoice.statusHistory.map((change) => (
                  <li key={change.changedAt.toString()}>
                    <p>
                      {change.status} on {formatDate(change.changedAt)} by{' '}
                      {change.changedBy}
                      {change.reason && ` (${change.reason})`}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="modal-footer">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button variant="secondary" onClick={onExport}>
            Download PDF
          </Button>
          {canEdit && (
            <>
              <Button variant="secondary">Duplicate</Button>
              <Button
                variant="primary"
                onClick={() => {
                  // Mark paid modal
                }}
              >
                Mark Paid
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## 5. Backend Implementation

### 5.1 Service Layer

```typescript
// packages/core/src/service/billing-dashboard-service.ts

export class BillingDashboardService {
  constructor(
    private billingRepository: IBillingRepository,
    private payerRepository: IPayerRepository,
    private db: Database
  ) {}

  /**
   * Fetch invoices with filtering, sorting, and pagination
   */
  async getInvoices(
    organizationId: UUID,
    query: InvoiceQuery
  ): Promise<InvoiceListResponse> {
    // Input validation
    validateInvoiceQuery(query);

    // Build parameterized query
    const { sql, params } = buildInvoiceQuery(organizationId, query);

    // Execute query with pagination
    const invoices = await this.db.query<InvoiceSummary>(sql, params);

    // Fetch facets for filter UI
    const facets = await this.getFacets(organizationId, query);

    return {
      invoices: invoices.rows,
      total: invoices.rows[0]?.total_count || 0,
      pageSize: query.limit || 25,
      offset: query.offset || 0,
      hasMore: (query.offset || 0) + (query.limit || 25) < (invoices.rows[0]?.total_count || 0),
      facets,
    };
  }

  /**
   * Get dashboard summary metrics
   */
  async getMetrics(
    organizationId: UUID,
    periodStart?: Date,
    periodEnd?: Date
  ): Promise<BillingMetricsResponse> {
    const start = periodStart || new Date(new Date().setMonth(new Date().getMonth() - 1));
    const end = periodEnd || new Date();

    const query = `
      SELECT
        SUM(CASE WHEN status = 'PAID' THEN total_amount ELSE 0 END) as total_paid,
        SUM(total_amount) as total_invoiced,
        SUM(balance_amount) as total_outstanding,
        COUNT(*) as invoice_count,
        COUNT(CASE WHEN status = 'PAID' THEN 1 END) as paid_invoice_count,
        COUNT(CASE WHEN status = 'OVERDUE' OR (balance_amount > 0 AND due_date < CURRENT_DATE) THEN 1 END) as overdue_invoice_count,
        SUM(CASE WHEN balance_amount > 0 AND CURRENT_DATE - due_date > 90 THEN balance_amount ELSE 0 END) as overdue_days_90,
        SUM(CASE WHEN balance_amount > 0 AND CURRENT_DATE - due_date > 60 AND CURRENT_DATE - due_date <= 90 THEN balance_amount ELSE 0 END) as overdue_days_60,
        SUM(CASE WHEN balance_amount > 0 AND CURRENT_DATE - due_date > 30 AND CURRENT_DATE - due_date <= 60 THEN balance_amount ELSE 0 END) as overdue_days_30,
        AVG(EXTRACT(DAY FROM updated_at - invoice_date))::DECIMAL(5,1) as avg_days_to_payment
      FROM invoices
      WHERE organization_id = $1
        AND invoice_date >= $2
        AND invoice_date <= $3
    `;

    const result = await this.db.query<any>(query, [organizationId, start, end]);
    const row = result.rows[0];

    return {
      periodStart: start,
      periodEnd: end,
      totalInvoiced: row?.total_invoiced || 0,
      totalPaid: row?.total_paid || 0,
      totalOutstanding: row?.total_outstanding || 0,
      collectionRate: row?.total_invoiced > 0 
        ? ((row?.total_paid || 0) / row?.total_invoiced * 100).toFixed(2) 
        : 0,
      averageDaysToPayment: row?.avg_days_to_payment || 0,
      invoiceCount: row?.invoice_count || 0,
      paidInvoiceCount: row?.paid_invoice_count || 0,
      overdueInvoiceCount: row?.overdue_invoice_count || 0,
      overdueDays30: row?.overdue_days_30 || 0,
      overdueDays60: row?.overdue_days_60 || 0,
      overdueDays90: row?.overdue_days_90 || 0,
    };
  }

  /**
   * Export invoices as PDF statement
   */
  async exportStatement(
    organizationId: UUID,
    invoiceIds: UUID[],
    options?: { type?: 'INVOICE' | 'STATEMENT' }
  ): Promise<{ url: string; fileName: string }> {
    // Fetch invoices with line items
    const invoices = await this.billingRepository.getInvoicesByIds(invoiceIds, organizationId);

    // Generate PDF using template
    const pdfBuffer = await generatePDF(invoices, options);

    // Upload to S3 with signed URL
    const fileName = `statement-${new Date().toISOString().split('T')[0]}.pdf`;
    const url = await uploadToS3(pdfBuffer, organizationId, fileName);

    return { url, fileName };
  }

  /**
   * Get facets for filter UI (status counts, payer counts)
   */
  private async getFacets(
    organizationId: UUID,
    query: InvoiceQuery
  ): Promise<BillingMetricsResponse['facets']> {
    // Query for status distribution
    const statusQuery = `
      SELECT status, COUNT(*) as count
      FROM invoices
      WHERE organization_id = $1
      GROUP BY status
    `;
    const statuses = await this.db.query<{ status: string; count: number }>(
      statusQuery,
      [organizationId]
    );

    // Query for payer distribution
    const payerQuery = `
      SELECT payer_id, payer_name, COUNT(*) as count
      FROM invoices
      WHERE organization_id = $1
      GROUP BY payer_id, payer_name
    `;
    const payers = await this.db.query<{ payer_id: UUID; payer_name: string; count: number }>(
      payerQuery,
      [organizationId]
    );

    return {
      statuses: statuses.rows,
      payers: payers.rows,
    };
  }
}
```

---

### 5.2 API Routes

```typescript
// packages/app/src/routes/billing-routes.ts

import { Router, Request, Response } from 'express';
import { BillingDashboardService } from '@folkcare/core/service/billing-dashboard-service.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validateQuery, validateBody } from '../middleware/validation.js';

export function createBillingRoutes(service: BillingDashboardService): Router {
  const router = Router();

  /**
   * GET /api/v1/billing/invoices
   * Query invoices with filtering
   */
  router.get(
    '/invoices',
    requireAuth,
    requireRole('ADMIN', 'FINANCE'),
    validateQuery({
      status: 'array?',
      dateFrom: 'date?',
      dateTo: 'date?',
      payerIds: 'array?',
      search: 'string?',
      minAmount: 'number?',
      maxAmount: 'number?',
      sortBy: 'string?',
      sortOrder: 'enum?[ASC,DESC]',
      limit: 'number?',
      offset: 'number?',
    }),
    async (req: Request, res: Response) => {
      try {
        const { organizationId } = req.user;

        const query: InvoiceQuery = {
          organizationId,
          status: req.query.status as InvoiceStatus[] | undefined,
          dateFrom: req.query.dateFrom as Date | undefined,
          dateTo: req.query.dateTo as Date | undefined,
          payerIds: req.query.payerIds as UUID[] | undefined,
          search: req.query.search as string | undefined,
          minAmount: req.query.minAmount as number | undefined,
          maxAmount: req.query.maxAmount as number | undefined,
          sortBy: req.query.sortBy as string | undefined,
          sortOrder: (req.query.sortOrder as 'ASC' | 'DESC' | undefined) || 'DESC',
          limit: Math.min(Number(req.query.limit) || 25, 100),
          offset: Number(req.query.offset) || 0,
        };

        const result = await service.getInvoices(organizationId, query);
        res.json(result);
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    }
  );

  /**
   * GET /api/v1/billing/invoices/:invoiceId
   * Get full invoice detail
   */
  router.get(
    '/invoices/:invoiceId',
    requireAuth,
    requireRole('ADMIN', 'FINANCE', 'VIEWER'),
    async (req: Request, res: Response) => {
      try {
        const { organizationId } = req.user;
        const { invoiceId } = req.params;

        const invoice = await service.getInvoiceDetail(
          organizationId,
          invoiceId as UUID
        );

        if (!invoice) {
          return res.status(404).json({ error: 'Invoice not found' });
        }

        res.json(invoice);
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    }
  );

  /**
   * GET /api/v1/billing/metrics
   * Get dashboard summary metrics
   */
  router.get(
    '/metrics',
    requireAuth,
    requireRole('ADMIN', 'FINANCE'),
    async (req: Request, res: Response) => {
      try {
        const { organizationId } = req.user;
        const { periodStart, periodEnd } = req.query;

        const metrics = await service.getMetrics(
          organizationId,
          periodStart as Date | undefined,
          periodEnd as Date | undefined
        );

        res.json(metrics);
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    }
  );

  /**
   * POST /api/v1/billing/invoices/:invoiceId/export
   * Export invoice as PDF
   */
  router.post(
    '/invoices/:invoiceId/export',
    requireAuth,
    requireRole('ADMIN', 'FINANCE'),
    validateBody({
      type: 'enum[INVOICE,STATEMENT]',
      format: 'enum[PDF]',
    }),
    async (req: Request, res: Response) => {
      try {
        const { organizationId } = req.user;
        const { invoiceId } = req.params;
        const { type } = req.body;

        const { url, fileName } = await service.exportStatement(
          organizationId,
          [invoiceId as UUID],
          { type }
        );

        res.json({ downloadUrl: url, fileName, expiresAt: new Date(Date.now() + 3600000) });
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    }
  );

  /**
   * GET /api/v1/billing/payers
   * List payers for filter dropdown
   */
  router.get(
    '/payers',
    requireAuth,
    requireRole('ADMIN', 'FINANCE'),
    async (req: Request, res: Response) => {
      try {
        const { organizationId } = req.user;

        const payers = await service.getPayers(organizationId);
        res.json({ payers });
      } catch (error) {
        res.status(400).json({ error: error.message });
      }
    }
  );

  return router;
}
```

---

## 6. Data Flow & Interactions

### 6.1 User Initiates Dashboard View

```
User navigates to /billing/dashboard
  │
  ├─ BillingDashboard component mounts
  │   ├─ useQuery: fetchMetrics (summary cards)
  │   ├─ useQuery: fetchInvoices (with default filters: last 30 days, all statuses)
  │   └─ useQuery: fetchPayers (for filter dropdowns)
  │
  └─ Render:
      ├─ Loading spinners while queries resolve
      └─ Summary cards + Filter bar + Invoice table
```

**Backend Flow:**
```
GET /api/v1/billing/invoices?limit=25&offset=0&sortBy=invoiceDate&sortOrder=DESC
  │
  ├─ AuthMiddleware: Verify JWT, extract organizationId
  ├─ RequireRoleMiddleware: Ensure ADMIN or FINANCE role
  ├─ ValidationMiddleware: Validate query parameters
  │
  └─ BillingDashboardService.getInvoices()
      ├─ buildInvoiceQuery(): SQL with all filters
      ├─ db.query(): Execute with pagination
      ├─ getFacets(): Count by status/payer for UI
      └─ Return InvoiceListResponse
          ├─ invoices: Array of InvoiceSummary
          ├─ total: Count for pagination
          ├─ facets: For filter UI
          └─ hasMore: Boolean
```

---

### 6.2 User Applies Filter

```
User selects status="OVERDUE", date range="Last 90 days"
  │
  ├─ FilterBar onChange triggers handleFilterChange()
  │   ├─ Update local state: filters = {..., statuses: ['OVERDUE'], dateFrom, dateTo}
  │   ├─ Reset pagination: offset = 0
  │   ├─ Show loading spinner
  │   └─ URL sync: setSearchParams() adds query params
  │
  ├─ React Query re-runs due to queryKey change
  │   └─ POST /api/v1/billing/invoices?status=OVERDUE&dateFrom=...
  │
  └─ Render:
      ├─ Active filter pills (display selected filters, allow remove)
      └─ Filtered invoice table (25 invoices per page)
```

---

### 6.3 User Exports Statement

```
User clicks "Download PDF" from invoice row
  │
  ├─ ActionsMenu onClick → exportPDF(invoiceId)
  ├─ Mutation triggered: exportInvoice(invoiceId)
  │   └─ Show loading spinner ("Generating PDF...")
  │
  └─ POST /api/v1/billing/invoices/{invoiceId}/export
      ├─ BillingDashboardService.exportStatement()
      │   ├─ Fetch full invoice with line items
      │   ├─ generatePDF(): Use template engine (Handlebars + PDFKit)
      │   └─ uploadToS3(): Save with TTL, return signed URL
      │
      └─ Response: { downloadUrl, fileName, expiresAt }
          └─ onSuccess: window.open(url, '_blank')
              └─ Browser downloads PDF
```

---

## 7. Testing Strategy

### 7.1 Unit Tests

**BillingDashboardService**:
```typescript
describe('BillingDashboardService', () => {
  it('should return filtered invoices with pagination', async () => {
    const result = await service.getInvoices(orgId, {
      status: ['OVERDUE'],
      dateFrom: new Date('2026-08-20'),
      dateTo: new Date('2026-09-20'),
      limit: 25,
      offset: 0,
    });

    expect(result.invoices).toHaveLength(lessThanOrEqual(25));
    expect(result.invoices.every((inv) => inv.status === 'OVERDUE')).toBe(true);
    expect(result.total).toBeGreaterThanOrEqual(result.invoices.length);
  });

  it('should calculate metrics correctly', async () => {
    const metrics = await service.getMetrics(orgId);

    expect(metrics.totalOutstanding).toBe(
      metrics.totalInvoiced - metrics.totalPaid
    );
    expect(metrics.collectionRate).toBeLessThanOrEqual(100);
  });

  it('should enforce authorization checks', async () => {
    await expect(service.getInvoices(wrongOrgId, query)).rejects.toThrow(
      'Unauthorized'
    );
  });
});
```

### 7.2 Integration Tests

```typescript
describe('Billing Dashboard API', () => {
  it('should return invoices filtered by status', async () => {
    const response = await request(app)
      .get('/api/v1/billing/invoices?status=OVERDUE')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.invoices[0].status).toBe('OVERDUE');
  });

  it('should reject unauthenticated requests', async () => {
    await request(app)
      .get('/api/v1/billing/invoices')
      .expect(401);
  });

  it('should reject users without FINANCE role', async () => {
    await request(app)
      .get('/api/v1/billing/invoices')
      .set('Authorization', `Bearer ${viewerToken}`)
      .expect(403);
  });

  it('should export invoice as PDF', async () => {
    const response = await request(app)
      .post(`/api/v1/billing/invoices/${invoiceId}/export`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'INVOICE', format: 'PDF' })
      .expect(200);

    expect(response.body).toHaveProperty('downloadUrl');
    expect(response.body.downloadUrl).toMatch(/\.pdf$/);
  });
});
```

### 7.3 E2E Tests (Playwright)

```typescript
test.describe('Billing Dashboard E2E', () => {
  test('user can filter invoices and view details', async ({ page }) => {
    // Navigate to dashboard
    await page.goto('/billing/dashboard');

    // Wait for initial load
    await page.waitForSelector('[data-testid="invoice-table"]');

    // Apply filter
    await page.click('[data-testid="status-filter"]');
    await page.click('[data-testid="status-option-OVERDUE"]');

    // Verify results
    const invoices = await page.locator('[data-testid="invoice-row"]').count();
    expect(invoices).toBeGreaterThan(0);

    // Click first invoice
    await page.click('[data-testid="invoice-row"]:first-child');

    // Modal opens
    await page.waitForSelector('[data-testid="invoice-detail-modal"]');
    expect(await page.locator('h2').textContent()).toContain('Invoice');

    // Export PDF
    await page.click('[data-testid="export-pdf-btn"]');
    // Verify download started
  });

  test('summary cards display correct metrics', async ({ page }) => {
    await page.goto('/billing/dashboard');

    const totalOutstanding = await page
      .locator('[data-testid="total-outstanding-value"]')
      .textContent();
    expect(totalOutstanding).toMatch(/\$[\d,]+\.\d{2}/); // Currency format
  });
});
```

---

## 8. Performance Considerations

### 8.1 Database Optimization

**Indexes**:
```sql
-- Primary filter columns
CREATE INDEX idx_invoices_org_date ON invoices(organization_id, invoice_date DESC);
CREATE INDEX idx_invoices_org_status ON invoices(organization_id, status);
CREATE INDEX idx_invoices_org_payer ON invoices(organization_id, payer_id);

-- Partial indexes for common queries
CREATE INDEX idx_invoices_outstanding 
  ON invoices(organization_id, balance_amount) 
  WHERE balance_amount > 0;

CREATE INDEX idx_invoices_overdue 
  ON invoices(organization_id, due_date) 
  WHERE status = 'OVERDUE' OR balance_amount > 0;

-- For sorting
CREATE INDEX idx_invoices_amount ON invoices(organization_id, total_amount DESC);
```

### 8.2 Query Optimization

- Use `SELECT COUNT(*) OVER()` for total count without extra query
- Denormalize `payer_name` to avoid JOIN on every query
- Cache facets (status/payer counts) for 5 minutes
- Use prepared statements to prevent SQL injection and improve plan caching

### 8.3 Frontend Optimization

- **Pagination**: Load 25 invoices initially, 100 max per page
- **Virtual Scrolling**: Render only visible rows (if list > 500 items)
- **Lazy Loading**: Load invoice detail on-demand when modal opens
- **Debounce Search**: 300ms debounce on search input to reduce API calls
- **Memoization**: useMemo for computed values (DSO, collection rate)
- **Query Caching**: React Query with 30s stale time, 5min cache time

---

## 9. Security Considerations

### 9.1 Authorization

```typescript
// Verify user has access to this organization
const invoice = await billingRepository.getInvoiceById(invoiceId);
if (invoice?.organizationId !== user.organizationId) {
  throw new UnauthorizedError('Invoice not found');
}

// Role-based access control
if (userRole === 'VIEWER') {
  // Read-only access, no exports or edits
} else if (userRole === 'FINANCE') {
  // Can view, export, but not edit
} else if (userRole === 'ADMIN') {
  // Full access
}
```

### 9.2 PDF Security

- Store PDFs in S3 with restricted ACLs (private)
- Generate time-limited signed URLs (1-hour TTL)
- Audit all PDF downloads (log user, invoice, timestamp)
- Don't cache PDFs client-side in localStorage/IndexedDB (contains PHI)

### 9.3 API Rate Limiting

```typescript
// 100 requests per minute per user
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  keyGenerator: (req) => req.user.id,
});

router.use('/billing', limiter);
```

---

## 10. Accessibility & Responsive Design

### 10.1 Mobile Layout

**Breakpoints**:
- Desktop (≥1024px): Full table, side filters, all columns visible
- Tablet (768-1023px): Collapsed table, filters in modal, condensed columns
- Mobile (<768px): Card list, full-screen filter modal, stacked layout

**Mobile Filters**:
```typescript
// On mobile, show filters in bottom sheet
<BottomSheet isOpen={showFilters} onClose={() => setShowFilters(false)}>
  <div className="mobile-filter-panel">
    <h2>Filters</h2>
    {/* All filter components */}
    <Button onClick={() => applyFilters()}>Apply</Button>
  </div>
</BottomSheet>
```

### 10.2 Keyboard Navigation

- **Tab**: Navigate through filters, table rows, action buttons
- **Enter**: Apply filter, open detail modal, trigger action
- **Escape**: Close modal, cancel edit
- **Arrow Keys**: Navigate table rows (up/down), expand/collapse (left/right)

---

## 11. Deployment & Monitoring

### 11.1 Feature Flags

```typescript
// Gradual rollout of billing dashboard
const BILLING_DASHBOARD_ENABLED = feature.isEnabled('billing-dashboard', {
  organizationId,
  percentage: 50, // 50% of orgs initially
});

if (!BILLING_DASHBOARD_ENABLED) {
  return <ComingSoonPage />;
}
```

### 11.2 Monitoring & Alerts

**Metrics to Track**:
- API response time (GET /invoices should be < 500ms)
- Database query performance (slow queries > 1s)
- PDF generation time (< 5s)
- Error rates (< 0.1%)
- User engagement (active users, feature usage)

**Alerts**:
- Response time > 2s
- Error rate > 1%
- Database query > 5s
- Unauthorized access attempts (> 5 in 1 minute)

---

## 12. Phase Delivery

### Phase 1 (MVP): Core Dashboard & Filtering
- ✅ Invoice list view with pagination
- ✅ Basic filters (status, date range, payer, search)
- ✅ Summary metrics cards
- ✅ Invoice detail modal
- ✅ PDF export (single invoice)

### Phase 2: Advanced Features
- Statement generation (multi-invoice, aged AR)
- Charts & analytics (trend lines, payer breakdown)
- Payment recording UI
- Invoice editing & duplication

### Phase 3: Optimizations & Polish
- Advanced filtering (saved filters, smart queries)
- Mobile app integration
- Real-time updates (WebSocket)
- Offline support (service worker caching)

---

## 13. Success Criteria

✅ **Functional Completeness**:
- All invoice records display with correct data
- Filters work correctly in all combinations
- PDF export generates valid, printable documents
- Pagination handles 10,000+ invoices efficiently

✅ **Performance**:
- Dashboard loads in < 2 seconds
- Filter response < 500ms
- PDF generation < 5 seconds
- No jank or layout shift

✅ **User Experience**:
- Filters are intuitive and discoverable
- Active filters clearly displayed
- Mobile layout is usable at < 480px width
- Error states provide actionable guidance

✅ **Security & Compliance**:
- Authorization enforced (users see only their org's invoices)
- PDF exports time-limited and audited
- HIPAA-compliant data handling
- Rate limiting prevents abuse

---

## Appendix: Technical References

### A.1 Dependencies

```json
{
  "@tanstack/react-query": "^5.x",
  "react-router-dom": "^6.x",
  "date-fns": "^3.x",
  "zod": "^3.x",
  "pdfkit": "^0.13.x",
  "aws-sdk": "^2.x"
}
```

### A.2 Environment Variables

```bash
# PDF generation
PDF_BUCKET_NAME=folk-care-documents
PDF_EXPIRY_SECONDS=3600

# API
API_RATE_LIMIT=100
API_RATE_LIMIT_WINDOW_MS=60000

# Database (via core package)
DATABASE_URL=postgresql://...
```

### A.3 File Structure

```
packages/
├── core/
│   ├── src/service/billing-dashboard-service.ts
│   └── src/repository/billing-repository.ts
├── web/
│   └── src/verticals/billing-invoicing/
│       ├── components/
│       │   ├── BillingDashboard.tsx
│       │   ├── FilterBar.tsx
│       │   ├── InvoiceTable.tsx
│       │   ├── InvoiceDetailModal.tsx
│       │   └── SummaryCards.tsx
│       ├── hooks/
│       │   ├── useInvoiceFilters.ts
│       │   └── useBillingMetrics.ts
│       ├── types/
│       │   └── billing.ts
│       └── pages/
│           └── BillingDashboardPage.tsx
└── app/
    └── src/routes/billing-routes.ts
```

---

**Document Status**: Specification Complete  
**Next Phase**: Implementation Planning & Development Kickoff  
**Prepared By**: Architecture Review Team
