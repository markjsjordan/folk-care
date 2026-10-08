export type InvoiceStatus = 
  | 'DRAFT' 
  | 'PENDING_REVIEW' 
  | 'APPROVED' 
  | 'READY_TO_SUBMIT' 
  | 'SENT' 
  | 'SUBMITTED' 
  | 'PARTIALLY_PAID' 
  | 'PAID' 
  | 'PAST_DUE' 
  | 'DISPUTED' 
  | 'CANCELLED' 
  | 'VOIDED';

export type PaymentStatus = 
  | 'PENDING' 
  | 'RECEIVED' 
  | 'APPLIED' 
  | 'DEPOSITED' 
  | 'CLEARED' 
  | 'RETURNED' 
  | 'VOIDED' 
  | 'REFUNDED';

export type PaymentMethod = 
  | 'CHECK' 
  | 'EFT' 
  | 'ACH' 
  | 'WIRE' 
  | 'CREDIT_CARD' 
  | 'DEBIT_CARD' 
  | 'CASH' 
  | 'MONEY_ORDER' 
  | 'ERA';

export type PayerType =
  | 'MEDICAID'
  | 'MEDICARE'
  | 'MEDICARE_ADVANTAGE'
  | 'PRIVATE_INSURANCE'
  | 'MANAGED_CARE'
  | 'VETERANS_BENEFITS'
  | 'WORKERS_COMP'
  | 'PRIVATE_PAY'
  | 'GRANT'
  | 'OTHER';

export type UnitType =
  | 'HOUR'
  | 'VISIT'
  | 'DAY'
  | 'WEEK'
  | 'MONTH'
  | 'TASK'
  | 'MILE'
  | 'UNIT';

export interface InvoiceLineItem {
  id: string;
  billableItemId: string;
  serviceDate: string;
  serviceCode: string;
  serviceDescription: string;
  providerName?: string;
  providerNPI?: string;
  unitType: UnitType;
  units: number;
  unitRate: number;
  subtotal: number;
  adjustments: number;
  total: number;
  clientName?: string;
  clientId?: string;
  authorizationNumber?: string;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceType: string;
  clientId?: string;
  clientName?: string;
  payerId: string;
  payerType: PayerType;
  payerName: string;
  status: InvoiceStatus;
  periodStart: string;
  periodEnd: string;
  invoiceDate: string;
  dueDate: string;
  submittedDate?: string;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  adjustmentAmount: number;
  totalAmount: number;
  paidAmount: number;
  balanceDue: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Payment {
  id: string;
  paymentNumber: string;
  invoiceId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentDate: string;
  receivedDate: string;
  status: PaymentStatus;
  referenceNumber?: string;
  notes?: string;
  createdAt: string;
}

export interface CreateInvoiceInput {
  clientId?: string;
  payerId: string;
  payerType: PayerType;
  payerName: string;
  invoiceDate: string;
  dueDate: string;
  periodStart: string;
  periodEnd: string;
  billableItemIds: string[];
  notes?: string;
}

export interface UpdateInvoiceInput {
  status?: InvoiceStatus;
  dueDate?: string;
  notes?: string;
  taxAmount?: number;
  discountAmount?: number;
}

export interface CreatePaymentInput {
  invoiceId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  paymentDate: string;
  referenceNumber?: string;
  notes?: string;
}

export interface BillingSearchFilters {
  clientId?: string;
  payerId?: string;
  status?: InvoiceStatus;
  payerType?: PayerType;
  startDate?: string;
  endDate?: string;
  minAmount?: number;
  maxAmount?: number;
  isPastDue?: boolean;
}

export interface InvoiceListResponse {
  items: Invoice[];
  total: number;
  hasMore: boolean;
}

export interface BillingSummary {
  totalInvoiced: number;
  totalPaid: number;
  totalOutstanding: number;
  overdueAmount: number;
  invoiceCount: {
    total: number;
    draft: number;
    pending: number;
    sent: number;
    paid: number;
    overdue: number;
  };
}

export type ClaimStatus = 
  | 'EVV_INCOMPLETE' 
  | 'VERIFIED_READY' 
  | 'BILLED' 
  | 'PAID' 
  | 'REJECTED';

export type PayorTypeFilter = 
  | 'ALL' 
  | 'MEDICAID_MCO' 
  | 'MEDICARE' 
  | 'PRIVATE_PAY' 
  | 'VA';

export interface EVVValidationSummary {
  isValid: boolean;
  complianceStatus: 'VERIFIED_READY' | 'EVV_INCOMPLETE';
  sixElementsComplete: boolean;
  geofenceVerified: boolean;
  missingElements: string[];
  errors: string[];
  warnings: string[];
  details: {
    serviceTypePresent: boolean;
    clientPresent: boolean;
    caregiverPresent: boolean;
    serviceDatePresent: boolean;
    serviceLocationPresent: boolean;
    serviceTimePresent: boolean;
    clockInGeofencePassed: boolean;
    clockOutGeofencePassed: boolean;
    hasApprovedManualOverride: boolean;
  };
}

export interface ClaimsQueueItem {
  id: string;
  claimNumber: string;
  invoiceId?: string;
  invoiceNumber?: string;
  clientId: string;
  clientName: string;
  clientMedicaidId?: string;
  caregiverId: string;
  caregiverName: string;
  serviceDate: string;
  serviceCode: string;
  serviceDescription: string;
  units: number;
  unitType: UnitType;
  unitRate: number;
  totalAmount: number;
  payorType: PayerType;
  payorName: string;
  status: ClaimStatus; // EVV_INCOMPLETE | VERIFIED_READY | BILLED | PAID | REJECTED
  evvValidation: EVVValidationSummary;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BillingDashboardSummary {
  totalUnbilledAmount: number;
  totalUnbilledCount: number;
  pendingEVVCount: number;
  pendingEVVAmount: number;
  claimsReadyCount: number;
  claimsReadyAmount: number;
  totalBilledMtdAmount: number;
  totalBilledMtdCount: number;
}

export interface BatchGenerationResult {
  generatedInvoices: Invoice[];
  verifiedVisitsCount: number;
  blockedVisitsCount: number;
  blockedVisits: {
    visitId: string;
    clientName: string;
    reasons: string[];
    missingElements: string[];
  }[];
}

export interface CMS1500ClaimForm {
  claimNumber: string;
  box1_payerType: string;
  box2_patientName: string;
  box3_patientBirthDate?: string;
  box4_insuredName?: string;
  box5_patientAddress?: string;
  box10_conditionRelatedToEmployment?: boolean;
  box11_insuredPolicyGroup?: string;
  box12_patientSignatureOnFile: boolean;
  box13_insuredSignatureOnFile: boolean;
  box17_referringProvider?: string;
  box21_diagnosisCodes: string[];
  box24_serviceLines: {
    dateOfServiceFrom: string;
    dateOfServiceTo: string;
    placeOfService: string;
    procedureCode: string;
    modifiers: string[];
    diagnosisPointer: string;
    charges: number;
    daysOrUnits: number;
    renderingProviderNpi?: string;
    evvVerified: boolean;
  }[];
  box25_federalTaxId?: string;
  box28_totalCharge: number;
  box31_physicianSignature: string;
  box32_serviceFacilityLocation: string;
  box33_billingProviderInfo: string;
}

