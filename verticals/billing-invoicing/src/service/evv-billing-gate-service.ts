/**
 * EVV-Before-Billing Gate Service
 * 
 * Enforces 21st Century Cures Act § 12006 and 42 CFR § 440.387 compliance
 * prior to invoicing, claim transition, and claim export.
 * 
 * Federal & State Regulatory Rules Applied:
 * 1. An invoice or claim cannot transition to 'READY_TO_SUBMIT' or be exported
 *    if attached visits lack:
 *    - Confirmed GPS clock-in AND clock-out within geofence or approved manual override reason.
 *    - Six required Cures Act data points:
 *        1) Service type performed (CPT / HCPCS)
 *        2) Individual receiving service (client)
 *        3) Individual providing service (caregiver)
 *        4) Date of service
 *        5) Location of service delivery
 *        6) Time service begins and ends
 * 2. Unverified visits billed to Medicaid risk federal clawbacks and False Claims Act penalties.
 */

import {
  EVVVisitVerificationInput,
  EVVVisitValidationResult,
  EVVBatchValidationResult,
  PayerType,
  CMS1500ClaimForm,
  Invoice,
  InvoiceLineItem,
} from '../types/billing.js';

function hasText(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function isApprovedOverride(
  override: { isApproved: boolean; reason: string } | undefined,
  shortcutApproved: boolean | undefined,
  shortcutReason: string | undefined
): boolean {
  if (override?.isApproved === true && hasText(override.reason)) return true;
  return shortcutApproved === true && hasText(shortcutReason);
}

export class EVVGateBlockedError extends Error {
  public readonly visitId?: string;
  public readonly missingElements: string[];
  public readonly validationErrors: string[];
  public readonly regulatoryCitation: string;

  constructor(
    message: string,
    details?: {
      visitId?: string;
      missingElements?: string[];
      validationErrors?: string[];
    }
  ) {
    super(message);
    this.name = 'EVVGateBlockedError';
    this.visitId = details?.visitId;
    this.missingElements = details?.missingElements ?? [];
    this.validationErrors = details?.validationErrors ?? [];
    this.regulatoryCitation = '21st Century Cures Act § 12006; 42 CFR § 440.387';
  }
}

export class EVVBillingGateService {
  /**
   * Validate a single visit against 21st Century Cures Act and geofence standards.
   */
  validateVisitEVV(visit: EVVVisitVerificationInput): EVVVisitValidationResult {
    const missingElements: string[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Element 1: Service Type (WHAT) - Service code required for billing
    const serviceTypePresent = Boolean(
      visit.serviceTypeCode && visit.serviceTypeCode.trim().length > 0
    );
    if (!serviceTypePresent) {
      missingElements.push('SERVICE_TYPE');
      errors.push('Missing required Cures Act element 1: Type of service performed (service code).');
    }

    // 2. Element 2: Individual Receiving Service (WHO receives)
    const clientPresent = Boolean(
      (visit.clientId && visit.clientId.trim().length > 0) ||
      (visit.clientName && visit.clientName.trim().length > 0)
    );
    if (!clientPresent) {
      missingElements.push('CLIENT_IDENTIFIER');
      errors.push('Missing required Cures Act element 2: Individual receiving the service.');
    }

    // 3. Element 3: Individual Providing Service (WHO provides)
    const caregiverPresent = Boolean(
      (visit.caregiverId && visit.caregiverId.trim().length > 0) ||
      (visit.caregiverName && visit.caregiverName.trim().length > 0)
    );
    if (!caregiverPresent) {
      missingElements.push('CAREGIVER_IDENTIFIER');
      errors.push('Missing required Cures Act element 3: Individual providing the service.');
    }

    // 4. Element 4: Date of Service (WHEN date)
    let serviceDatePresent = false;
    if (visit.serviceDate) {
      const d = new Date(visit.serviceDate);
      serviceDatePresent = !isNaN(d.getTime());
    }
    if (!serviceDatePresent) {
      missingElements.push('SERVICE_DATE');
      errors.push('Missing required Cures Act element 4: Date of service.');
    }

    // 5. Element 5: Location of Service Delivery (WHERE)
    const hasAddress = Boolean(
      visit.serviceAddress?.line1 ||
      (visit.serviceAddress?.city && visit.serviceAddress?.state)
    );
    const hasCoordinates = Boolean(
      (visit.serviceLocationLatitude !== undefined && visit.serviceLocationLongitude !== undefined) ||
      (visit.serviceAddress?.latitude !== undefined && visit.serviceAddress?.longitude !== undefined)
    );
    const serviceLocationPresent = hasAddress || hasCoordinates;
    if (!serviceLocationPresent) {
      missingElements.push('SERVICE_LOCATION');
      errors.push('Missing required Cures Act element 5: Location of service delivery.');
    }

    // 6. Element 6: Time Begins and Ends (WHEN time & duration)
    let serviceTimePresent = false;
    let clockInValid = false;
    let clockOutValid = false;

    if (visit.clockInTime) {
      const inDate = new Date(visit.clockInTime);
      clockInValid = !isNaN(inDate.getTime());
    }
    if (visit.clockOutTime) {
      const outDate = new Date(visit.clockOutTime);
      clockOutValid = !isNaN(outDate.getTime());
    }

    if (!clockInValid) {
      missingElements.push('CLOCK_IN_TIME');
      errors.push('Missing or invalid clock-in time.');
    }
    if (!clockOutValid) {
      missingElements.push('CLOCK_OUT_TIME');
      errors.push('Missing or incomplete clock-out time. Visit must be completed and clocked out for billing.');
    }

    if (clockInValid && clockOutValid) {
      const inTime = new Date(visit.clockInTime).getTime();
      const outTime = new Date(visit.clockOutTime!).getTime();
      if (outTime <= inTime) {
        errors.push('Invalid visit duration: clock-out time must be after clock-in time.');
      } else {
        serviceTimePresent = true;
      }
    }

    const sixElementsComplete =
      serviceTypePresent &&
      clientPresent &&
      caregiverPresent &&
      serviceDatePresent &&
      serviceLocationPresent &&
      serviceTimePresent;

    // --- Geofence and Location Verification ---
    // Clock-in location validation:
    // Either GPS confirmed within geofence OR approved manual override
    const clockInGeofenceDirect =
      visit.clockInWithinGeofence === true ||
      visit.clockInVerification?.isWithinGeofence === true;

    // An override counts only when a supervisor approved it AND a reason is recorded.
    // A reason alone (e.g. caregiver-entered) is not an approval.
    const clockInOverrideValid = isApprovedOverride(
      visit.clockInVerification?.manualOverride,
      visit.isClockInOverrideApproved,
      visit.clockInOverrideReason
    );

    const clockInPassed = clockInGeofenceDirect || clockInOverrideValid;
    if (!clockInPassed) {
      errors.push('Clock-in GPS verification missing or outside geofence without approved manual override.');
    }

    // Clock-out location validation:
    // Clock-out must exist, and either GPS confirmed within geofence OR approved manual override
    const clockOutGeofenceDirect =
      visit.clockOutWithinGeofence === true ||
      visit.clockOutVerification?.isWithinGeofence === true;

    const clockOutOverrideValid = isApprovedOverride(
      visit.clockOutVerification?.manualOverride,
      visit.isClockOutOverrideApproved,
      visit.clockOutOverrideReason
    );

    const clockOutPassed = clockOutValid && (clockOutGeofenceDirect || clockOutOverrideValid);
    if (!clockOutPassed && clockOutValid) {
      errors.push('Clock-out GPS verification missing or outside geofence without approved manual override.');
    }

    const geofenceVerified = clockInPassed && clockOutPassed;
    const hasApprovedManualOverride = clockInOverrideValid || clockOutOverrideValid;

    const isValid = sixElementsComplete && geofenceVerified;

    return {
      visitId: visit.visitId,
      isValid,
      complianceStatus: isValid ? 'VERIFIED_READY' : 'EVV_INCOMPLETE',
      sixElementsComplete,
      geofenceVerified,
      missingElements,
      errors,
      warnings,
      details: {
        serviceTypePresent,
        clientPresent,
        caregiverPresent,
        serviceDatePresent,
        serviceLocationPresent,
        serviceTimePresent,
        clockInGeofencePassed: clockInPassed,
        clockOutGeofencePassed: clockOutPassed,
        hasApprovedManualOverride,
      },
    };
  }

  /**
   * Validate a collection of visits for billing batch inclusion.
   */
  validateAttachedVisitsForBilling(
    visits: EVVVisitVerificationInput[],
    _payerType?: PayerType
  ): EVVBatchValidationResult {
    const results = visits.map((v) => this.validateVisitEVV(v));
    const verifiedCount = results.filter((r) => r.isValid).length;
    const blockedCount = results.filter((r) => !r.isValid).length;

    return {
      allValid: blockedCount === 0 && visits.length > 0,
      totalVisits: visits.length,
      verifiedCount,
      blockedCount,
      results,
    };
  }

  /**
   * Assert that an invoice/claim can transition to 'READY_TO_SUBMIT'.
   * Throws EVVGateBlockedError if any attached visit fails EVV compliance.
   */
  assertCanTransitionToReadyToSubmit(
    invoiceOrClaim: { id: string; payerType?: PayerType },
    visits: EVVVisitVerificationInput[]
  ): void {
    if (!visits || visits.length === 0) {
      throw new EVVGateBlockedError(
        `Cannot transition to READY_TO_SUBMIT: Invoice/Claim ${invoiceOrClaim.id} has no attached visits with EVV evidence.`,
        { validationErrors: ['No attached visits found to evaluate for EVV compliance'] }
      );
    }

    const failures: { visitId: string; clientName: string; errors: string[]; missingElements: string[] }[] = [];

    for (const visit of visits) {
      const validation = this.validateVisitEVV(visit);
      if (!validation.isValid) {
        failures.push({
          visitId: visit.visitId,
          clientName: visit.clientName || 'Unknown Client',
          errors: validation.errors,
          missingElements: validation.missingElements,
        });
      }
    }

    if (failures.length > 0) {
      const failureList = failures
        .map((f) => `[Visit ${f.visitId} (${f.clientName}): ${f.errors.join('; ')}]`)
        .join('; ');

      throw new EVVGateBlockedError(
        `EVV-Before-Billing Gate Rejection: Invoice/Claim ${invoiceOrClaim.id} cannot transition to READY_TO_SUBMIT. ` +
        `${failures.length} visit(s) fail 21st Century Cures Act EVV compliance: ${failureList}. ` +
        `Submitting unverified visits violates federal regulations (42 CFR § 440.387).`,
        {
          missingElements: Array.from(new Set(failures.flatMap((f) => f.missingElements))),
          validationErrors: failures.flatMap((f) => f.errors),
        }
      );
    }
  }

  /**
   * Assert that an invoice/claim can be exported (837P, CMS-1500, or CSV).
   * Export always requires EVV evidence for every attached visit: an export
   * with no evidence is blocked, never assumed compliant.
   */
  assertCanExport(
    claimOrInvoice: { id: string; status?: string },
    visits: EVVVisitVerificationInput[]
  ): void {
    if (claimOrInvoice.status === 'EVV_INCOMPLETE') {
      throw new EVVGateBlockedError(
        `Export blocked for ${claimOrInvoice.id}: Claim status is EVV_INCOMPLETE. ` +
        `Claims containing unverified visits cannot be exported for submission to prevent federal clawbacks.`,
        { validationErrors: ['Status is EVV_INCOMPLETE'] }
      );
    }

    this.assertCanTransitionToReadyToSubmit(claimOrInvoice, visits);
  }

  /**
   * Filter candidate visits into verified vs blocked groups.
   * Guarantees unverified visits are excluded from billing batches.
   */
  filterVerifiedVisitsForBilling(visits: EVVVisitVerificationInput[]): {
    verified: EVVVisitVerificationInput[];
    blocked: {
      visitId: string;
      clientName: string;
      reasons: string[];
      missingElements: string[];
    }[];
  } {
    const verified: EVVVisitVerificationInput[] = [];
    const blocked: {
      visitId: string;
      clientName: string;
      reasons: string[];
      missingElements: string[];
    }[] = [];

    for (const visit of visits) {
      const result = this.validateVisitEVV(visit);
      if (result.isValid) {
        verified.push(visit);
      } else {
        blocked.push({
          visitId: visit.visitId,
          clientName: visit.clientName || 'Unknown',
          reasons: result.errors,
          missingElements: result.missingElements,
        });
      }
    }

    return { verified, blocked };
  }

  /**
   * Generate an ANSI X12 837P (professional claim) preview for an invoice.
   * `visits[i]` must be the EVV evidence for `invoice.lineItems[i]`. An invoice
   * groups visits by payer, so it may span several patients: each patient gets
   * its own subscriber loop and CLM. Identifiers we do not hold (billing NPI,
   * tax ID, missing member IDs) are left empty rather than invented.
   */
  generate837PPreview(
    invoice: Invoice,
    visits: EVVVisitVerificationInput[],
    provider: ClaimBillingProvider = {}
  ): string {
    this.assertCanExport(invoice, visits);

    const now = new Date();
    const createdDate = formatX12Date(now);
    const createdTime = now.toISOString().slice(11, 16).replace(':', '');
    const payerName = x12(invoice.payerName).toUpperCase();
    const payerCode = payerName.replace(/\s+/g, '').slice(0, 15);

    const body: string[] = [
      `ST*837*0001*005010X222A1~`,
      `BHT*0019*00*${x12(invoice.invoiceNumber)}*${createdDate}*${createdTime}*CH~`,
      `NM1*41*2*${x12(provider.name).toUpperCase()}*****46*${x12(provider.taxId)}~`,
      `NM1*40*2*${payerName}*****46*${x12(invoice.payerId)}~`,
      `HL*1**20*1~`,
      `NM1*85*2*${x12(provider.name).toUpperCase()}*****XX*${x12(provider.npi)}~`,
    ];

    groupLinesByPatient(invoice, visits).forEach((patient, index) => {
      const claimTotal = patient.lines.reduce((sum, { line }) => sum + line.total, 0);
      body.push(
        `HL*${index + 2}*1*22*0~`,
        `SBR*P*18*******${claimFilingIndicator(invoice.payerType)}~`,
        `NM1*IL*1*${x12(patient.name).toUpperCase()}****MI*${x12(patient.memberId)}~`,
        `CLM*${x12(invoice.invoiceNumber)}-${index + 1}*${claimTotal.toFixed(2)}***12:B:1*Y*A*Y*Y~`,
        `NTE*ADD*EVV VERIFIED ${patient.lines.length} VISIT(S) PER CURES ACT SEC 12006~`
      );
      patient.lines.forEach(({ line }, lineIndex) => {
        const modifiers = (line.modifiers ?? []).map((m) => `:${x12(m.code)}`).join('');
        body.push(
          `LX*${lineIndex + 1}~`,
          `SV1*HC:${x12(line.serviceCode)}${modifiers}*${line.total.toFixed(2)}*UN*${line.units}***1~`,
          `DTP*472*D8*${formatX12Date(line.serviceDate)}~`
        );
        if (hasText(line.providerNPI)) {
          body.push(`NM1*82*1*${x12(line.providerName).toUpperCase()}*****XX*${x12(line.providerNPI)}~`);
        }
      });
    });

    // SE01 counts every segment from ST through SE inclusive.
    body.push(`SE*${body.length + 1}*0001~`);

    return [
      `ISA*00*          *00*          *ZZ*${'FOLKCARE'.padEnd(15, ' ')}*ZZ*${payerCode.padEnd(15, ' ')}*${createdDate.slice(2)}*${createdTime}*^*00501*000000001*0*T*:~`,
      `GS*HC*FOLKCARE*${payerCode}*${createdDate}*${createdTime}*1*X*005010X222A1~`,
      ...body,
      `GE*1*1~`,
      `IEA*1*000000001~`,
    ].join('\n');
  }

  /**
   * Generate CMS-1500 claim forms for an invoice, one per patient.
   * `visits[i]` must be the EVV evidence for `invoice.lineItems[i]`.
   */
  generateCMS1500Preview(
    invoice: Invoice,
    visits: EVVVisitVerificationInput[],
    provider: ClaimBillingProvider = {}
  ): CMS1500ClaimForm[] {
    this.assertCanExport(invoice, visits);

    return groupLinesByPatient(invoice, visits).map((patient, index) => {
      const address = patient.lines[0]?.visit?.serviceAddress;
      const serviceLocation = address
        ? [address.line1, address.city, address.state, address.postalCode].filter(hasText).join(', ')
        : '';

      return {
        claimNumber: `${invoice.invoiceNumber}-${index + 1}`,
        box1_payerType: invoice.payerType,
        box2_patientName: patient.name,
        box4_insuredName: patient.name,
        ...(patient.memberId ? { box11_insuredPolicyGroup: patient.memberId } : {}),
        box12_patientSignatureOnFile: false,
        box13_insuredSignatureOnFile: false,
        box21_diagnosisCodes: [],
        box24_serviceLines: patient.lines.map(({ line }) => ({
          dateOfServiceFrom: formatIsoDate(line.serviceDate),
          dateOfServiceTo: formatIsoDate(line.serviceDate),
          placeOfService: '12',
          procedureCode: line.serviceCode,
          modifiers: (line.modifiers ?? []).map((m) => m.code),
          diagnosisPointer: 'A',
          charges: line.total,
          daysOrUnits: line.units,
          ...(line.providerNPI ? { renderingProviderNpi: line.providerNPI } : {}),
          evvVerified: true,
        })),
        ...(provider.taxId ? { box25_federalTaxId: provider.taxId } : {}),
        box28_totalCharge: patient.lines.reduce((sum, { line }) => sum + line.total, 0),
        box31_physicianSignature: '',
        box32_serviceFacilityLocation: serviceLocation,
        box33_billingProviderInfo: [provider.name, provider.npi ? `NPI ${provider.npi}` : '']
          .filter(hasText)
          .join(', '),
      };
    });
  }

  /**
   * Generate a CSV of claims for clearinghouse ingestion.
   * Rows that have not passed the EVV gate are excluded, never exported as verified.
   */
  generateClaimsCSV(claims: ClaimsCsvRow[]): { csv: string; excludedCount: number } {
    const headers = [
      'Claim_Number',
      'Invoice_Number',
      'Payer_Type',
      'Payer_Name',
      'Client_Name',
      'Service_Date',
      'Service_Code',
      'Units',
      'Unit_Rate',
      'Total_Amount',
      'EVV_Status',
      'EVV_Geofence_Verified',
      'Claim_Status',
    ];

    const exportable = claims.filter((c) => c.evvValidation.isValid);

    const rows = exportable.map((c) =>
      [
        csvCell(c.claimNumber),
        csvCell(c.invoiceNumber ?? ''),
        csvCell(c.payorType),
        csvCell(c.payorName),
        csvCell(c.clientName),
        csvCell(formatIsoDate(c.serviceDate)),
        csvCell(c.serviceCode),
        c.units,
        c.unitRate.toFixed(2),
        c.totalAmount.toFixed(2),
        csvCell(c.evvValidation.complianceStatus),
        csvCell(c.evvValidation.geofenceVerified ? 'YES' : 'NO'),
        csvCell(c.status),
      ].join(',')
    );

    return {
      csv: [headers.join(','), ...rows].join('\n'),
      excludedCount: claims.length - exportable.length,
    };
  }
}

export interface ClaimBillingProvider {
  name?: string;
  npi?: string;
  taxId?: string;
}

export interface ClaimsCsvRow {
  claimNumber: string;
  invoiceNumber?: string;
  payorType: string;
  payorName: string;
  clientName: string;
  serviceDate: string | Date;
  serviceCode: string;
  units: number;
  unitRate: number;
  totalAmount: number;
  status: string;
  evvValidation: Pick<EVVVisitValidationResult, 'isValid' | 'complianceStatus' | 'geofenceVerified'>;
}

interface PatientClaimGroup {
  name: string;
  memberId?: string;
  lines: { line: InvoiceLineItem; visit?: EVVVisitVerificationInput }[];
}

/** Group invoice lines by patient, pairing each line with its EVV evidence by index. */
function groupLinesByPatient(invoice: Invoice, visits: EVVVisitVerificationInput[]): PatientClaimGroup[] {
  const groups = new Map<string, PatientClaimGroup>();
  invoice.lineItems.forEach((line, index) => {
    const visit = visits[index];
    const key = visit?.clientId || line.clientId || invoice.clientId || 'unknown';
    const group = groups.get(key) ?? {
      name: visit?.clientName || line.clientName || invoice.clientName || '',
      lines: [],
    };
    if (!group.memberId && hasText(visit?.clientMedicaidId)) group.memberId = visit!.clientMedicaidId;
    group.lines.push({ line, ...(visit ? { visit } : {}) });
    groups.set(key, group);
  });
  return [...groups.values()];
}

/** Strip X12 delimiters so free text cannot break segment structure. */
function x12(value: string | undefined | null): string {
  return (value ?? '').replace(/[~*:^]/g, ' ').trim();
}

function formatIsoDate(value: Date | string): string {
  return new Date(value).toISOString().slice(0, 10);
}

function formatX12Date(value: Date | string): string {
  return formatIsoDate(value).replace(/-/g, '');
}

/** Prefix formula-leading characters to block CSV injection in spreadsheet tools. */
function csvCell(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}

function claimFilingIndicator(payerType: PayerType): string {
  switch (payerType) {
    case 'MEDICAID':
      return 'MC';
    case 'MANAGED_CARE':
      return 'HM';
    case 'MEDICARE':
      return 'MB';
    case 'MEDICARE_ADVANTAGE':
      return '16';
    case 'VETERANS_BENEFITS':
      return 'VA';
    default:
      return 'ZZ';
  }
}
