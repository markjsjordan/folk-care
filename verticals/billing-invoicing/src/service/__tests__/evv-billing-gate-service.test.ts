/**
 * Unit Tests for EVVBillingGateService and BillingService EVV Gate
 * 
 * Verifies that:
 * 1. 21st Century Cures Act six required data elements are enforced.
 * 2. GPS geofence verification (clock-in & clock-out) or approved manual override is enforced.
 * 3. Unverified EVV visits are blocked from billing batches.
 * 4. Invoices/claims cannot transition to READY_TO_SUBMIT or be exported without EVV verification.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  EVVBillingGateService,
  EVVGateBlockedError,
} from '../evv-billing-gate-service.js';
import { BillingService } from '../billing-service.js';
import {
  EVVVisitVerificationInput,
  GenerateInvoicesForVerifiedVisitsInput,
  Invoice,
  InvoiceLineItem,
} from '../../types/billing.js';
import type { BillableItemEvidence } from '../../repository/evv-evidence-repository.js';

const createValidVisit = (overrides?: Partial<EVVVisitVerificationInput>): EVVVisitVerificationInput => ({
  visitId: 'visit-101',
  serviceTypeCode: 'T1019',
  serviceTypeName: 'Personal Care Services',
  clientId: 'client-001',
  clientName: 'Alice Smith',
  clientMedicaidId: 'MED-TX-12345',
  caregiverId: 'cg-001',
  caregiverName: 'Bob Caregiver',
  caregiverNPI: '1982736450',
  serviceDate: new Date('2026-10-01'),
  serviceLocationLatitude: 30.2672,
  serviceLocationLongitude: -97.7431,
  serviceAddress: {
    line1: '123 Main St',
    city: 'Austin',
    state: 'TX',
    postalCode: '78701',
    latitude: 30.2672,
    longitude: -97.7431,
  },
  clockInTime: new Date('2026-10-01T09:00:00Z'),
  clockOutTime: new Date('2026-10-01T12:00:00Z'),
  durationMinutes: 180,
  clockInWithinGeofence: true,
  clockOutWithinGeofence: true,
  payerId: 'payer-medicaid',
  payerName: 'Texas Medicaid MCO',
  payerType: 'MEDICAID',
  units: 3,
  unitType: 'HOUR',
  rate: 25.0,
  ...overrides,
});

describe('EVVBillingGateService - 21st Century Cures Act Compliance', () => {
  let gateService: EVVBillingGateService;

  beforeEach(() => {
    gateService = new EVVBillingGateService();
  });

  describe('Six Cures Act Elements Validation', () => {
    it('should pass validation when all six elements and GPS geofence are present', () => {
      const visit = createValidVisit();
      const result = gateService.validateVisitEVV(visit);

      expect(result.isValid).toBe(true);
      expect(result.complianceStatus).toBe('VERIFIED_READY');
      expect(result.sixElementsComplete).toBe(true);
      expect(result.geofenceVerified).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.missingElements).toHaveLength(0);
    });

    it('should fail and block billing when Element 1 (Service Type) is missing', () => {
      const visit = createValidVisit({ serviceTypeCode: '', serviceTypeName: '' });
      const result = gateService.validateVisitEVV(visit);

      expect(result.isValid).toBe(false);
      expect(result.complianceStatus).toBe('EVV_INCOMPLETE');
      expect(result.missingElements).toContain('SERVICE_TYPE');
      expect(result.errors.some((e) => e.includes('Cures Act element 1'))).toBe(true);
    });

    it('should fail and block billing when Element 2 (Client Identifier) is missing', () => {
      const visit = createValidVisit({ clientId: '', clientName: '' });
      const result = gateService.validateVisitEVV(visit);

      expect(result.isValid).toBe(false);
      expect(result.complianceStatus).toBe('EVV_INCOMPLETE');
      expect(result.missingElements).toContain('CLIENT_IDENTIFIER');
      expect(result.errors.some((e) => e.includes('Cures Act element 2'))).toBe(true);
    });

    it('should fail and block billing when Element 3 (Caregiver Identifier) is missing', () => {
      const visit = createValidVisit({ caregiverId: '', caregiverName: '' });
      const result = gateService.validateVisitEVV(visit);

      expect(result.isValid).toBe(false);
      expect(result.complianceStatus).toBe('EVV_INCOMPLETE');
      expect(result.missingElements).toContain('CAREGIVER_IDENTIFIER');
      expect(result.errors.some((e) => e.includes('Cures Act element 3'))).toBe(true);
    });

    it('should fail and block billing when Element 4 (Service Date) is invalid', () => {
      const visit = createValidVisit({ serviceDate: 'invalid-date' });
      const result = gateService.validateVisitEVV(visit);

      expect(result.isValid).toBe(false);
      expect(result.complianceStatus).toBe('EVV_INCOMPLETE');
      expect(result.missingElements).toContain('SERVICE_DATE');
    });

    it('should fail and block billing when Element 5 (Location of Service Delivery) is missing', () => {
      const visit = createValidVisit({
        serviceAddress: undefined,
        serviceLocationLatitude: undefined,
        serviceLocationLongitude: undefined,
      });
      const result = gateService.validateVisitEVV(visit);

      expect(result.isValid).toBe(false);
      expect(result.complianceStatus).toBe('EVV_INCOMPLETE');
      expect(result.missingElements).toContain('SERVICE_LOCATION');
    });

    it('should fail and block billing when Element 6 (Time begins & ends): visit missing clock-out', () => {
      const visit = createValidVisit({ clockOutTime: null });
      const result = gateService.validateVisitEVV(visit);

      expect(result.isValid).toBe(false);
      expect(result.complianceStatus).toBe('EVV_INCOMPLETE');
      expect(result.missingElements).toContain('CLOCK_OUT_TIME');
      expect(result.errors.some((e) => e.includes('clock-out'))).toBe(true);
    });

    it('should fail when clock-out is before clock-in', () => {
      const visit = createValidVisit({
        clockInTime: new Date('2026-10-01T12:00:00Z'),
        clockOutTime: new Date('2026-10-01T09:00:00Z'),
      });
      const result = gateService.validateVisitEVV(visit);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid visit duration'))).toBe(true);
    });
  });

  describe('Geofence and Manual Override Gate', () => {
    it('should block visit when clock-in is outside geofence without manual override', () => {
      const visit = createValidVisit({
        clockInWithinGeofence: false,
        clockInOverrideReason: undefined,
      });
      const result = gateService.validateVisitEVV(visit);

      expect(result.isValid).toBe(false);
      expect(result.geofenceVerified).toBe(false);
      expect(result.errors.some((e) => e.includes('Clock-in GPS verification missing or outside geofence'))).toBe(true);
    });

    it('should block visit when clock-out is outside geofence without manual override', () => {
      const visit = createValidVisit({
        clockOutWithinGeofence: false,
        clockOutOverrideReason: undefined,
      });
      const result = gateService.validateVisitEVV(visit);

      expect(result.isValid).toBe(false);
      expect(result.geofenceVerified).toBe(false);
      expect(result.errors.some((e) => e.includes('Clock-out GPS verification missing or outside geofence'))).toBe(true);
    });

    it('should pass visit when outside geofence has approved manual override reason', () => {
      const visit = createValidVisit({
        clockInWithinGeofence: false,
        clockInOverrideReason: 'GPS signal blocked in concrete structure, supervisor confirmed client presence',
        isClockInOverrideApproved: true,
        clockOutWithinGeofence: false,
        clockOutOverrideReason: 'Cell tower outage; verified by family member signature',
        isClockOutOverrideApproved: true,
      });
      const result = gateService.validateVisitEVV(visit);

      expect(result.isValid).toBe(true);
      expect(result.complianceStatus).toBe('VERIFIED_READY');
      expect(result.details.hasApprovedManualOverride).toBe(true);
      expect(result.geofenceVerified).toBe(true);
    });

    it('should accept manualOverride structure from EVVLocationVerificationData', () => {
      const visit = createValidVisit({
        clockInWithinGeofence: false,
        clockInVerification: {
          isWithinGeofence: false,
          manualOverride: {
            isApproved: true,
            reason: 'Rural area GPS unavailability per Texas HHSC exception code 105',
            approvedBy: 'supervisor-1',
          },
        },
      });
      const result = gateService.validateVisitEVV(visit);

      expect(result.isValid).toBe(true);
      expect(result.complianceStatus).toBe('VERIFIED_READY');
    });
  });

  describe('manual override approval', () => {
    it('should block when an override reason exists but was never approved', () => {
      const visit = createValidVisit({
        clockInWithinGeofence: false,
        clockInOverrideReason: 'Caregiver says GPS was flaky',
        isClockInOverrideApproved: false,
      });
      const result = gateService.validateVisitEVV(visit);

      expect(result.isValid).toBe(false);
      expect(result.details.clockInGeofencePassed).toBe(false);
    });

    it('should block when an approved override has no reason recorded', () => {
      const visit = createValidVisit({
        clockOutWithinGeofence: false,
        clockOutVerification: {
          isWithinGeofence: false,
          manualOverride: { isApproved: true, reason: '   ' },
        },
      });

      expect(gateService.validateVisitEVV(visit).isValid).toBe(false);
    });
  });

  describe('assertCanTransitionToReadyToSubmit', () => {
    it('should allow transition to READY_TO_SUBMIT when all visits are EVV-verified', () => {
      const visits = [
        createValidVisit({ visitId: 'v1' }),
        createValidVisit({ visitId: 'v2' }),
      ];

      expect(() => {
        gateService.assertCanTransitionToReadyToSubmit(
          { id: 'inv-1', payerType: 'MEDICAID' },
          visits
        );
      }).not.toThrow();
    });

    it('should throw EVVGateBlockedError when any attached visit is unverified', () => {
      const visits = [
        createValidVisit({ visitId: 'v1' }),
        createValidVisit({
          visitId: 'v2',
          clockOutTime: null, // incomplete visit
        }),
      ];

      expect(() => {
        gateService.assertCanTransitionToReadyToSubmit(
          { id: 'inv-1', payerType: 'MEDICAID' },
          visits
        );
      }).toThrowError(EVVGateBlockedError);

      try {
        gateService.assertCanTransitionToReadyToSubmit(
          { id: 'inv-1', payerType: 'MEDICAID' },
          visits
        );
      } catch (err) {
        expect(err).toBeInstanceOf(EVVGateBlockedError);
        const evvErr = err as EVVGateBlockedError;
        expect(evvErr.regulatoryCitation).toContain('21st Century Cures Act');
        expect(evvErr.message).toContain('v2');
      }
    });

    it('should throw EVVGateBlockedError when invoice has empty visits array', () => {
      expect(() => {
        gateService.assertCanTransitionToReadyToSubmit(
          { id: 'inv-1', payerType: 'MEDICAID' },
          []
        );
      }).toThrowError(EVVGateBlockedError);
    });
  });

  describe('assertCanExport', () => {
    it('should block export when claim has EVV_INCOMPLETE status', () => {
      expect(() => {
        gateService.assertCanExport({ id: 'clm-1', status: 'EVV_INCOMPLETE' }, [createValidVisit()]);
      }).toThrowError(EVVGateBlockedError);
    });

    it('should block export when no EVV evidence is attached', () => {
      expect(() => {
        gateService.assertCanExport({ id: 'clm-1', status: 'READY_TO_SUBMIT' }, []);
      }).toThrowError(EVVGateBlockedError);
    });

    it('should allow export when every visit is verified', () => {
      expect(() => {
        gateService.assertCanExport({ id: 'clm-1', status: 'READY_TO_SUBMIT' }, [createValidVisit()]);
      }).not.toThrow();
    });
  });

  describe('filterVerifiedVisitsForBilling', () => {
    it('should separate verified visits from unverified visits, blocking unverified ones', () => {
      const v1 = createValidVisit({ visitId: 'v1' });
      const v2 = createValidVisit({ visitId: 'v2', clockInWithinGeofence: false, clockInOverrideReason: undefined });
      const v3 = createValidVisit({ visitId: 'v3' });
      const v4 = createValidVisit({ visitId: 'v4', serviceTypeCode: '' });

      const { verified, blocked } = gateService.filterVerifiedVisitsForBilling([v1, v2, v3, v4]);

      expect(verified).toHaveLength(2);
      expect(verified.map((v) => v.visitId)).toEqual(['v1', 'v3']);

      expect(blocked).toHaveLength(2);
      expect(blocked.map((b) => b.visitId)).toEqual(['v2', 'v4']);
      expect(blocked[0]!.reasons.length).toBeGreaterThan(0);
      expect(blocked[1]!.missingElements).toContain('SERVICE_TYPE');
    });
  });

  describe('Claim Form & Electronic Export Previews', () => {
    const invoice = createInvoice({
      status: 'READY_TO_SUBMIT',
      lineItems: [
        createLineItem({ id: 'li-1', billableItemId: 'bi-1', total: 75, units: 3 }),
        createLineItem({ id: 'li-2', billableItemId: 'bi-2', total: 75, units: 3 }),
      ],
      totalAmount: 150,
    });

    it('should generate 837P content with one service line per invoice line', () => {
      const edi = gateService.generate837PPreview(invoice, [createValidVisit(), createValidVisit()]);
      expect(edi).toContain('ST*837*0001*005010X222A1');
      expect(edi).toContain('CLM*INV-2026-001-1*150.00');
      expect(edi).toContain('LX*1~');
      expect(edi).toContain('LX*2~');
      expect(edi).toContain('SBR*P*18*******MC~');
      expect(edi).toContain('MI*MED-TX-12345~');
    });

    it('should report the correct SE segment count', () => {
      const lines = gateService.generate837PPreview(invoice, [createValidVisit()]).split('\n');
      const st = lines.findIndex((l) => l.startsWith('ST*'));
      const se = lines.findIndex((l) => l.startsWith('SE*'));
      expect(lines[se]).toBe(`SE*${se - st + 1}*0001~`);
    });

    it('should not invent identifiers it does not have', () => {
      const edi = gateService.generate837PPreview(invoice, [createValidVisit({ clientMedicaidId: undefined })]);
      expect(edi).toContain('****MI*~');
      expect(edi).toContain('*****XX*~');
    });

    it('should strip X12 delimiters from free text', () => {
      const edi = gateService.generate837PPreview(
        createInvoice({ ...invoice, clientName: 'Smith*Alice~' }),
        [createValidVisit()]
      );
      expect(edi).toContain('NM1*IL*1*SMITH ALICE****MI*');
    });

    it('should block 837P export when any visit is unverified', () => {
      expect(() => {
        gateService.generate837PPreview(invoice, [createValidVisit(), createValidVisit({ clockOutTime: null })]);
      }).toThrowError(EVVGateBlockedError);
    });

    it('should block 837P export when no EVV evidence is supplied', () => {
      expect(() => gateService.generate837PPreview(invoice, [])).toThrowError(EVVGateBlockedError);
    });

    it('should generate CMS-1500 from invoice data without placeholder PHI', () => {
      const [form, ...rest] = gateService.generateCMS1500Preview(invoice, [createValidVisit(), createValidVisit()]);
      expect(rest).toHaveLength(0);
      expect(form!.claimNumber).toBe('INV-2026-001-1');
      expect(form!.box2_patientName).toBe('Alice Smith');
      expect(form!.box3_patientBirthDate).toBeUndefined();
      expect(form!.box24_serviceLines).toHaveLength(2);
      expect(form!.box28_totalCharge).toBe(150);
      expect(form!.box32_serviceFacilityLocation).toBe('123 Main St, Austin, TX, 78701');
    });

    it('should split a multi-patient invoice into one claim per patient', () => {
      const visits = [
        createValidVisit({ clientId: 'c-1', clientName: 'Alice Smith', clientMedicaidId: 'M-1' }),
        createValidVisit({ clientId: 'c-2', clientName: 'Bob Jones', clientMedicaidId: 'M-2' }),
      ];

      const edi = gateService.generate837PPreview(invoice, visits);
      expect(edi).toContain('NM1*IL*1*ALICE SMITH****MI*M-1~');
      expect(edi).toContain('NM1*IL*1*BOB JONES****MI*M-2~');
      expect(edi).toContain('CLM*INV-2026-001-1*75.00');
      expect(edi).toContain('CLM*INV-2026-001-2*75.00');

      const forms = gateService.generateCMS1500Preview(invoice, visits);
      expect(forms.map((f) => f.box2_patientName)).toEqual(['Alice Smith', 'Bob Jones']);
    });

    it('should exclude EVV-incomplete rows from the claims CSV', () => {
      const base = {
        payorType: 'MEDICAID',
        payorName: 'Texas Medicaid MCO',
        serviceDate: '2026-10-01',
        serviceCode: 'T1019',
        unitRate: 25,
      };
      const { csv, excludedCount } = gateService.generateClaimsCSV([
        {
          ...base,
          claimNumber: 'CLM-001',
          clientName: 'Alice Smith',
          units: 4,
          totalAmount: 100,
          status: 'VERIFIED_READY',
          evvValidation: { isValid: true, complianceStatus: 'VERIFIED_READY', geofenceVerified: true },
        },
        {
          ...base,
          claimNumber: 'CLM-002',
          clientName: 'Charlie Brown',
          units: 2,
          totalAmount: 50,
          status: 'EVV_INCOMPLETE',
          evvValidation: { isValid: false, complianceStatus: 'EVV_INCOMPLETE', geofenceVerified: false },
        },
      ]);

      expect(csv).toContain('"CLM-001"');
      expect(csv).toContain('"VERIFIED_READY","YES"');
      expect(csv).not.toContain('CLM-002');
      expect(excludedCount).toBe(1);
    });

    it('should neutralize spreadsheet formulas in CSV cells', () => {
      const { csv } = gateService.generateClaimsCSV([
        {
          claimNumber: 'CLM-003',
          clientName: '=HYPERLINK("http://evil")',
          payorType: 'MEDICAID',
          payorName: 'MCO',
          serviceDate: '2026-10-01',
          serviceCode: 'T1019',
          units: 1,
          unitRate: 25,
          totalAmount: 25,
          status: 'VERIFIED_READY',
          evvValidation: { isValid: true, complianceStatus: 'VERIFIED_READY', geofenceVerified: true },
        },
      ]);
      expect(csv).toContain(`"'=HYPERLINK(""http://evil"")"`);
    });
  });
});

describe('BillingService EVV Gate Integration', () => {
  let service: BillingService;
  let mockRepository: any;
  let mockEvidence: any;

  const evidenceFor = (
    billableItemId: string,
    evv: EVVVisitVerificationInput,
    overrides: Partial<BillableItemEvidence> = {}
  ): BillableItemEvidence => ({
    billableItemId,
    branchId: 'branch-1',
    billableItemStatus: 'READY',
    isDenied: false,
    payerId: 'payer-1',
    payerType: 'MEDICAID',
    payerName: 'Texas Medicaid MCO',
    serviceTypeCode: 'T1019',
    serviceTypeName: 'Attendant Care',
    serviceDate: new Date('2026-10-01'),
    units: 4,
    unitType: 'HOUR',
    unitRate: 25,
    finalAmount: 100,
    createdAt: new Date('2026-10-01'),
    updatedAt: new Date('2026-10-01'),
    hasEvvRecord: true,
    evv,
    ...overrides,
  });

  const validVisit = createValidVisit({ visitId: 'v-100' });
  const unverifiedVisit = createValidVisit({
    visitId: 'v-200',
    clientName: 'Charlie Brown',
    clockOutTime: null,
    clockInWithinGeofence: false,
  });

  beforeEach(() => {
    service = new BillingService({ query: vi.fn(), connect: vi.fn() } as any);
    mockRepository = (service as any).repository;
    mockRepository.findInvoiceById = vi.fn();
    mockRepository.updateInvoice = vi.fn().mockImplementation((id, changes) => ({ id, ...changes }));
    mockEvidence = (service as any).evidenceRepository;
    mockEvidence.findByBillableItemIds = vi.fn();
    mockEvidence.findReadyUninvoiced = vi.fn();
    mockEvidence.findForClaimsQueue = vi.fn();
  });

  describe('transitionInvoiceToReadyToSubmit', () => {
    const draft = createInvoice({
      status: 'DRAFT',
      lineItems: [createLineItem({ billableItemId: 'bi-1' })],
    });

    it('should transition when stored EVV evidence is verified', async () => {
      mockRepository.findInvoiceById.mockResolvedValue(draft);
      mockEvidence.findByBillableItemIds.mockResolvedValue([evidenceFor('bi-1', validVisit)]);

      const result = await service.transitionInvoiceToReadyToSubmit(draft.id, 'user-1' as any);

      expect(result.status).toBe('READY_TO_SUBMIT');
      expect(mockEvidence.findByBillableItemIds).toHaveBeenCalledWith('org-1', ['bi-1']);
    });

    it('should reject the transition when stored EVV evidence is unverified', async () => {
      mockRepository.findInvoiceById.mockResolvedValue(draft);
      mockEvidence.findByBillableItemIds.mockResolvedValue([evidenceFor('bi-1', unverifiedVisit)]);

      await expect(service.transitionInvoiceToReadyToSubmit(draft.id, 'user-1' as any)).rejects.toThrowError(
        EVVGateBlockedError
      );
      expect(mockRepository.updateInvoice).not.toHaveBeenCalled();
    });

    it('should reject the transition when a line item has no EVV record at all', async () => {
      mockRepository.findInvoiceById.mockResolvedValue(draft);
      mockEvidence.findByBillableItemIds.mockResolvedValue([]);

      await expect(service.transitionInvoiceToReadyToSubmit(draft.id, 'user-1' as any)).rejects.toThrowError(
        EVVGateBlockedError
      );
      expect(mockRepository.updateInvoice).not.toHaveBeenCalled();
    });
  });

  describe('generateInvoicesForVerifiedVisits', () => {
    const input: GenerateInvoicesForVerifiedVisitsInput = {
      organizationId: 'org-1' as any,
    };

    it('should invoice only verified items and report unverified ones as blocked', async () => {
      mockEvidence.findReadyUninvoiced.mockResolvedValue([
        evidenceFor('bi-1', validVisit),
        evidenceFor('bi-2', unverifiedVisit),
      ]);
      const createInvoice = vi
        .spyOn(service, 'createInvoice')
        .mockImplementation(async (inv) => ({ ...createInvoiceFixture(), id: 'inv-new', billableItemIds: inv.billableItemIds }) as any);
      vi.spyOn(service, 'transitionInvoiceToReadyToSubmit').mockImplementation(
        async (id) => ({ ...createInvoiceFixture(), id, status: 'READY_TO_SUBMIT' }) as any
      );

      const result = await service.generateInvoicesForVerifiedVisits(input, 'user-1' as any, 'FC');

      expect(createInvoice).toHaveBeenCalledTimes(1);
      expect(createInvoice.mock.calls[0]![0].billableItemIds).toEqual(['bi-1']);
      expect(result.verifiedVisitsCount).toBe(1);
      expect(result.generatedInvoices[0]!.status).toBe('READY_TO_SUBMIT');
      expect(result.blockedVisitsCount).toBe(1);
      expect(result.blockedVisits[0]!.visitId).toBe('v-200');
    });

    it('should create no invoices when every candidate fails EVV', async () => {
      mockEvidence.findReadyUninvoiced.mockResolvedValue([
        evidenceFor('bi-2', unverifiedVisit),
        evidenceFor('bi-3', createValidVisit({ visitId: 'v-300', clockInTime: '' }), { hasEvvRecord: false }),
      ]);
      const createInvoice = vi.spyOn(service, 'createInvoice');

      const result = await service.generateInvoicesForVerifiedVisits(input, 'user-1' as any, 'FC');

      expect(createInvoice).not.toHaveBeenCalled();
      expect(result.generatedInvoices).toHaveLength(0);
      expect(result.blockedVisitsCount).toBe(2);
      expect(result.blockedVisits[1]!.reasons[0]).toBe('No EVV record found for this visit.');
    });

    it('should group verified items into one invoice per payer', async () => {
      mockEvidence.findReadyUninvoiced.mockResolvedValue([
        evidenceFor('bi-1', validVisit),
        evidenceFor('bi-4', validVisit, { payerId: 'payer-2', payerType: 'MEDICARE', payerName: 'Medicare' }),
      ]);
      const createInvoice = vi
        .spyOn(service, 'createInvoice')
        .mockImplementation(async () => createInvoiceFixture() as any);
      vi.spyOn(service, 'transitionInvoiceToReadyToSubmit').mockImplementation(async () => createInvoiceFixture() as any);

      await service.generateInvoicesForVerifiedVisits(input, 'user-1' as any, 'FC');

      expect(createInvoice).toHaveBeenCalledTimes(2);
    });
    it('should invoice each branch separately under its own branch', async () => {
      mockEvidence.findReadyUninvoiced.mockResolvedValue([
        evidenceFor('bi-1', validVisit),
        evidenceFor('bi-6', validVisit, { branchId: 'branch-2' }),
      ]);
      const createInvoice = vi
        .spyOn(service, 'createInvoice')
        .mockImplementation(async () => createInvoiceFixture() as any);
      vi.spyOn(service, 'transitionInvoiceToReadyToSubmit').mockImplementation(async () => createInvoiceFixture() as any);

      await service.generateInvoicesForVerifiedVisits(input, 'user-1' as any, 'FC');

      expect(createInvoice.mock.calls.map((c) => c[0].branchId)).toEqual(['branch-1', 'branch-2']);
    });
  });

  describe('getClaimsQueue', () => {
    it('should derive statuses from EVV evidence and invoice state', async () => {
      mockEvidence.findForClaimsQueue.mockResolvedValue([
        evidenceFor('bi-1', validVisit),
        evidenceFor('bi-2', unverifiedVisit),
        evidenceFor('bi-3', validVisit, {
          invoiceId: 'inv-1',
          invoiceNumber: 'INV-1',
          invoiceStatus: 'SUBMITTED',
          invoiceDate: new Date(),
        }),
        evidenceFor('bi-4', validVisit, { invoiceId: 'inv-2', invoiceStatus: 'PAID', invoiceDate: new Date() }),
        evidenceFor('bi-5', validVisit, { isDenied: true, denialReason: 'Auth expired' }),
      ]);

      const queue = await service.getClaimsQueue('org-1' as any);

      expect(queue.items.map((i) => i.status)).toEqual([
        'VERIFIED_READY',
        'EVV_INCOMPLETE',
        'BILLED',
        'PAID',
        'REJECTED',
      ]);
      expect(queue.summary.pendingEVVCount).toBe(1);
      expect(queue.summary.claimsReadyCount).toBe(1);
      expect(queue.summary.totalUnbilledCount).toBe(2);
      expect(queue.summary.totalBilledMtdCount).toBe(2);
      expect(queue.items[4]!.rejectionReason).toBe('Auth expired');
    });

    it('should filter by payor group', async () => {
      mockEvidence.findForClaimsQueue.mockResolvedValue([
        evidenceFor('bi-1', validVisit),
        evidenceFor('bi-2', validVisit, { payerType: 'MANAGED_CARE' }),
        evidenceFor('bi-3', validVisit, { payerType: 'VETERANS_BENEFITS' }),
      ]);

      expect((await service.getClaimsQueue('org-1' as any, { payor: 'MEDICAID_MCO' })).total).toBe(2);
      expect((await service.getClaimsQueue('org-1' as any, { payor: 'VA' })).total).toBe(1);
      expect((await service.getClaimsQueue('org-1' as any, { payor: 'PRIVATE_PAY' })).total).toBe(0);
    });
  });

  describe('updateInvoice', () => {
    it.each(['READY_TO_SUBMIT', 'SENT', 'SUBMITTED'] as const)(
      'should refuse to jump a draft to %s by editing',
      async (status) => {
        mockRepository.findInvoiceById.mockResolvedValue(createInvoice({ status: 'DRAFT' }));

        await expect(service.updateInvoice('inv-123' as any, { status }, 'user-1' as any)).rejects.toThrow(
          'use the submission workflow'
        );
        expect(mockRepository.updateInvoice).not.toHaveBeenCalled();
      }
    );

    it('should still allow moving a draft to PENDING_REVIEW', async () => {
      mockRepository.findInvoiceById.mockResolvedValue(createInvoice({ status: 'DRAFT' }));

      await service.updateInvoice('inv-123' as any, { status: 'PENDING_REVIEW' }, 'user-1' as any);

      expect(mockRepository.updateInvoice).toHaveBeenCalled();
    });
  });

  describe('sendInvoice', () => {
    it('should block sending a Medicaid DRAFT invoice whose EVV is unverified', async () => {
      mockRepository.findInvoiceById.mockResolvedValue(
        createInvoice({ status: 'DRAFT', lineItems: [createLineItem({ billableItemId: 'bi-2' })] })
      );
      mockEvidence.findByBillableItemIds.mockResolvedValue([evidenceFor('bi-2', unverifiedVisit)]);

      await expect(service.sendInvoice('inv-123' as any, 'user-1' as any)).rejects.toThrowError(EVVGateBlockedError);
      expect(mockRepository.updateInvoice).not.toHaveBeenCalled();
    });

    it('should send a private-pay invoice without consulting EVV', async () => {
      mockRepository.findInvoiceById.mockResolvedValue(createInvoice({ status: 'DRAFT', payerType: 'PRIVATE_PAY' }));

      const result = await service.sendInvoice('inv-123' as any, 'user-1' as any);

      expect(result.status).toBe('SENT');
      expect(mockEvidence.findByBillableItemIds).not.toHaveBeenCalled();
    });
  });

  describe('claim exports', () => {
    it('should refuse to export an invoice from another organization', async () => {
      mockRepository.findInvoiceById.mockResolvedValue(createInvoice({ organizationId: 'org-2' as any }));
      await expect(service.export837PClaim('inv-123' as any, 'org-1' as any)).rejects.toThrow('Invoice not found');
    });

    it('should block 837P export when stored evidence is unverified', async () => {
      mockRepository.findInvoiceById.mockResolvedValue(
        createInvoice({ lineItems: [createLineItem({ billableItemId: 'bi-2' })] })
      );
      mockEvidence.findByBillableItemIds.mockResolvedValue([evidenceFor('bi-2', unverifiedVisit)]);

      await expect(service.export837PClaim('inv-123' as any, 'org-1' as any)).rejects.toThrowError(
        EVVGateBlockedError
      );
    });
  });
});

function createLineItem(overrides: Partial<InvoiceLineItem> = {}): InvoiceLineItem {
  return {
    id: 'li-1' as any,
    billableItemId: 'bi-1' as any,
    serviceDate: new Date('2026-10-01'),
    serviceCode: 'T1019',
    serviceDescription: 'Personal Care Services',
    unitType: 'HOUR',
    units: 4,
    unitRate: 25,
    subtotal: 100,
    adjustments: 0,
    total: 100,
    ...overrides,
  } as InvoiceLineItem;
}

function createInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return { ...createInvoiceFixture(), ...overrides };
}

function createInvoiceFixture(): Invoice {
  return {
    id: 'inv-123' as any,
    organizationId: 'org-1' as any,
    branchId: 'branch-1' as any,
    invoiceNumber: 'INV-2026-001',
    invoiceType: 'STANDARD',
    payerId: 'payer-1' as any,
    payerType: 'MEDICAID',
    payerName: 'Texas Medicaid',
    periodStart: new Date('2026-10-01'),
    periodEnd: new Date('2026-10-07'),
    invoiceDate: new Date('2026-10-08'),
    dueDate: new Date('2026-11-08'),
    billableItemIds: ['bi-1' as any],
    lineItems: [createLineItem()],
    subtotal: 100,
    taxAmount: 0,
    discountAmount: 0,
    adjustmentAmount: 0,
    totalAmount: 100,
    paidAmount: 0,
    balanceDue: 100,
    status: 'DRAFT',
    statusHistory: [],
    payments: [],
    createdAt: new Date(),
    createdBy: 'user-1' as any,
    updatedAt: new Date(),
    updatedBy: 'user-1' as any,
    deletedAt: null,
    deletedBy: null,
    version: 1,
  } as Invoice;
}
