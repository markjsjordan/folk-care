/**
 * Billing Service
 * 
 * Core billing service implementing SOLID principles
 * Orchestrates billing operations with proper separation of concerns
 */

import { Pool, PoolClient } from 'pg';
import { v4 as uuid } from 'uuid';
import { UUID } from '@folkcare/core';
import { BillingRepository } from '../repository/billing-repository';
import {
  CreateBillableItemInput,
  CreateInvoiceInput,
  CreatePaymentInput,
  AllocatePaymentInput,
  BillableItem,
  Invoice,
  Payment,
  InvoiceLineItem,
  EVVVisitVerificationInput,
  GenerateInvoicesForVerifiedVisitsInput,
  GenerateInvoicesBatchResult,
  CMS1500ClaimForm,
  PayerType,
  PayorTypeFilter,
  InvoiceStatus,
  ClaimsQueueItem,
  ClaimsQueueResult,
  ClaimStatus,
} from '../types/billing.js';
import { EVVBillingGateService } from './evv-billing-gate-service.js';
import { EVVEvidenceRepository, BillableItemEvidence } from '../repository/evv-evidence-repository.js';
import {
  validateCreateBillableItem,
  validateCreateInvoice,
  validateCreatePayment,
  validateAllocatePayment,
} from '../validation/billing-validator.js';
import {
  calculateUnits,
  calculateBaseAmount,
  applyModifiers,
  calculateInvoiceTotal,
  generateInvoiceNumber,
  generatePaymentNumber,
  calculateDueDate,
} from '../utils/billing-calculations.js';

export class BillingService {
  private repository: BillingRepository;
  private evvGateService: EVVBillingGateService;
  private evidenceRepository: EVVEvidenceRepository;

  constructor(private pool: Pool) {
    this.repository = new BillingRepository(pool);
    this.evvGateService = new EVVBillingGateService();
    this.evidenceRepository = new EVVEvidenceRepository(pool);
  }

  getEVVGateService(): EVVBillingGateService {
    return this.evvGateService;
  }

  /**
   * Create billable item from completed visit/EVV record
   */
  async createBillableItem(
    input: CreateBillableItemInput,
    userId: UUID
  ): Promise<BillableItem> {
    // Validate input
    const validation = validateCreateBillableItem(input);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    // Look up rate schedule
    const rateSchedule = await this.repository.findActiveRateSchedule(
      input.organizationId,
      input.payerId
    );

    if (!rateSchedule) {
      throw new Error('No active rate schedule found for payer');
    }

    // Find matching rate for service
    const serviceRate = rateSchedule.rates.find(
      (r) => r.serviceTypeCode === input.serviceTypeCode
    );

    if (!serviceRate) {
      throw new Error(
        `No rate found for service code ${input.serviceTypeCode}`
      );
    }

    // Calculate units and amounts
    const units = input.units || calculateUnits(
      input.durationMinutes,
      input.unitType,
      serviceRate.roundingRule
    );

    const unitRate = input.rateScheduleId
      ? serviceRate.unitRate
      : serviceRate.unitRate;

    const subtotal = calculateBaseAmount(units, unitRate);
    const finalAmount = applyModifiers(subtotal, input.modifiers);

    // Check authorization if required
    let authorizationRemainingUnits: number | undefined;
    let isAuthorized = false;

    if (input.authorizationId) {
      const auth = await this.repository.findAuthorizationByNumber(
        input.authorizationNumber!
      );

      if (!auth) {
        throw new Error('Authorization not found');
      }

      if (auth.status !== 'ACTIVE') {
        throw new Error(`Authorization is ${auth.status}, not ACTIVE`);
      }

      if (auth.remainingUnits < units) {
        throw new Error(
          `Insufficient authorization units. Needed: ${units}, Available: ${auth.remainingUnits}`
        );
      }

      authorizationRemainingUnits = auth.remainingUnits - units;
      isAuthorized = true;
    }

    // Create billable item
    const billableItem: Omit<
      BillableItem,
      'id' | 'createdAt' | 'updatedAt' | 'version' | 'deletedAt' | 'deletedBy'
    > = {
      ...input,
      units,
      unitRate,
      subtotal,
      finalAmount,
      isAuthorized,
      ...(authorizationRemainingUnits !== undefined ? { authorizationRemainingUnits } : {}),
      status: 'PENDING',
      statusHistory: [
        {
          id: uuid(),
          fromStatus: null,
          toStatus: 'PENDING',
          timestamp: new Date(),
          changedBy: userId,
          reason: 'Billable item created from service delivery',
        },
      ],
      isHold: false,
      requiresReview: false,
      isDenied: false,
      isAppealable: false,
      isPaid: false,
      createdBy: userId,
      updatedBy: userId,
    };

    const created = await this.repository.createBillableItem(billableItem);

    // Update authorization units if applicable
    if (input.authorizationId && isAuthorized) {
      await this.repository.updateAuthorizationUnits(
        input.authorizationId,
        units,
        0, // not yet billed
        userId
      );
    }

    return created;
  }

  /**
   * Create invoice from billable items
   */
  async createInvoice(
    input: CreateInvoiceInput,
    userId: UUID,
    orgCode: string
  ): Promise<Invoice> {
    // Validate input
    const validation = validateCreateInvoice(input);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Get billable items
      const billableItems = await this.repository.searchBillableItems({
        organizationId: input.organizationId,
      });

      const items = billableItems.filter((item) =>
        input.billableItemIds.includes(item.id)
      );

      if (items.length === 0) {
        throw new Error('No billable items found');
      }

      // Verify all items are for the same payer
      const payerIds = new Set(items.map((item) => item.payerId));
      if (payerIds.size > 1) {
        throw new Error('All billable items must be for the same payer');
      }

      // Verify all items are in READY status
      const notReady = items.filter((item) => item.status !== 'READY');
      if (notReady.length > 0) {
        throw new Error(
          `${notReady.length} items are not in READY status`
        );
      }

      // Calculate totals
      const subtotal = items.reduce((sum, item) => sum + item.finalAmount, 0);
      const taxAmount = 0; // Healthcare services typically tax-exempt
      const totalAmount = calculateInvoiceTotal(subtotal, taxAmount, 0, 0);
      const balanceDue = totalAmount;

      // Generate invoice number
      const invoiceCount = await this.getInvoiceCount(
        input.organizationId,
        new Date().getFullYear(),
        client
      );
      const invoiceNumber = generateInvoiceNumber(
        orgCode,
        invoiceCount + 1,
        new Date().getFullYear()
      );

      // Create line items
      const lineItems: InvoiceLineItem[] = items.map((item) => {
        const lineItem: InvoiceLineItem = {
          id: uuid(),
          billableItemId: item.id,
          serviceDate: item.serviceDate,
          serviceCode: item.serviceTypeCode,
          serviceDescription: item.serviceTypeName,
          unitType: item.unitType,
          units: item.units,
          unitRate: item.unitRate,
          subtotal: item.subtotal,
          adjustments: 0,
          total: item.finalAmount,
          clientId: item.clientId,
        };
        if (item.caregiverName) lineItem.providerName = item.caregiverName;
        if (item.providerNPI) lineItem.providerNPI = item.providerNPI;
        if (item.modifiers) lineItem.modifiers = item.modifiers;
        if (item.authorizationNumber) lineItem.authorizationNumber = item.authorizationNumber;
        return lineItem;
      });

      // Get payer info
      const payer = await this.repository.findPayerById(input.payerId);
      if (!payer) {
        throw new Error('Payer not found');
      }

      // Calculate due date
      const dueDate = calculateDueDate(input.invoiceDate, payer.paymentTermsDays);

      // Create invoice
      const invoice: Omit<
        Invoice,
        'id' | 'createdAt' | 'updatedAt' | 'version' | 'deletedAt' | 'deletedBy'
      > = {
        organizationId: input.organizationId,
        branchId: input.branchId,
        invoiceNumber,
        invoiceType: input.invoiceType,
        payerId: input.payerId,
        payerType: input.payerType,
        payerName: input.payerName,
        ...(payer.billingAddress ? { payerAddress: payer.billingAddress } : (payer.address ? { payerAddress: payer.address } : {})),
        ...(input.clientId ? { clientId: input.clientId } : {}),
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        invoiceDate: input.invoiceDate,
        dueDate,
        billableItemIds: input.billableItemIds,
        lineItems,
        subtotal,
        taxAmount,
        discountAmount: 0,
        adjustmentAmount: 0,
        totalAmount,
        paidAmount: 0,
        balanceDue,
        status: 'DRAFT',
        statusHistory: [
          {
            id: uuid(),
            fromStatus: null,
            toStatus: 'DRAFT',
            timestamp: new Date(),
            changedBy: userId,
            reason: 'Invoice created',
          },
        ],
        payments: [],
        ...(input.notes ? { notes: input.notes } : {}),
        createdBy: userId,
        updatedBy: userId,
      };

      const created = await this.repository.createInvoice(invoice, client);
      await this.repository.linkBillableItemsToInvoice(
        items.map((item) => item.id),
        created.id,
        input.invoiceDate,
        client
      );

      // Update billable items to INVOICED status
      for (const item of items) {
        await this.repository.updateBillableItemStatus(
          item.id,
          'INVOICED',
          {
            id: uuid(),
            fromStatus: 'READY',
            toStatus: 'INVOICED',
            timestamp: new Date(),
            changedBy: userId,
            reason: `Added to invoice ${invoiceNumber}`,
          },
          userId,
          client
        );
      }

      await client.query('COMMIT');
      return created;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update invoice fields; only allowed while invoice is editable.
   */
  async updateInvoice(id: UUID, input: Partial<Invoice>, userId: UUID): Promise<Invoice> {
    const invoice = await this.repository.findInvoiceById(id);
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    if (invoice.status !== 'DRAFT' && invoice.status !== 'PENDING_REVIEW') {
      throw new Error(`Cannot edit invoice in ${invoice.status} status`);
    }

    // Submission statuses are reachable only through transitionInvoiceToReadyToSubmit
    // and sendInvoice, which enforce the EVV gate.
    if (input.status !== undefined && input.status !== invoice.status && !EDITABLE_TARGET_STATUSES.has(input.status)) {
      throw new Error(`Cannot change invoice status to ${input.status} by editing; use the submission workflow`);
    }

    return this.repository.updateInvoice(id, input, userId);
  }

  /**
   * Soft-delete an invoice; only allowed while still a draft.
   */
  async deleteInvoice(id: UUID, userId: UUID): Promise<void> {
    const invoice = await this.repository.findInvoiceById(id);
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    if (invoice.status !== 'DRAFT') {
      throw new Error(`Cannot delete invoice in ${invoice.status} status`);
    }

    await this.repository.deleteInvoice(id, userId);
  }

  /**
   * Transition invoice to READY_TO_SUBMIT after the EVV-before-billing gate.
   * Evidence is loaded from evv_records for every line item; callers cannot supply it.
   * Mandated by 21st Century Cures Act § 12006 for Medicaid home care billing.
   */
  async transitionInvoiceToReadyToSubmit(id: UUID, userId: UUID): Promise<Invoice> {
    const invoice = await this.repository.findInvoiceById(id);
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    if (invoice.status !== 'DRAFT' && invoice.status !== 'PENDING_REVIEW' && invoice.status !== 'APPROVED') {
      throw new Error(`Cannot transition invoice in ${invoice.status} status to READY_TO_SUBMIT`);
    }

    const visits = await this.loadInvoiceEvidence(invoice);
    this.evvGateService.assertCanTransitionToReadyToSubmit(invoice, visits);

    return this.repository.updateInvoice(
      id,
      {
        status: 'READY_TO_SUBMIT',
        statusHistory: [
          ...invoice.statusHistory,
          {
            id: uuid(),
            fromStatus: invoice.status,
            toStatus: 'READY_TO_SUBMIT',
            timestamp: new Date(),
            changedBy: userId,
            reason: `EVV verified for ${visits.length} visit(s) per 21st Century Cures Act § 12006`,
          },
        ],
      },
      userId
    );
  }

  /**
   * Batch action: invoice every READY billable item whose EVV record passes the gate.
   * Items lacking EVV evidence, geofence confirmation, or Cures Act data points are
   * left uninvoiced and reported back as blocked.
   */
  async generateInvoicesForVerifiedVisits(
    input: GenerateInvoicesForVerifiedVisitsInput,
    userId: UUID,
    orgCode: string
  ): Promise<GenerateInvoicesBatchResult> {
    let candidates = await this.evidenceRepository.findReadyUninvoiced(input.organizationId, input.payerId);
    if (input.branchId) {
      candidates = candidates.filter((c) => c.branchId === input.branchId);
    }
    if (input.billableItemIds && input.billableItemIds.length > 0) {
      const wanted = new Set(input.billableItemIds);
      candidates = candidates.filter((c) => wanted.has(c.billableItemId));
    }

    const verified: BillableItemEvidence[] = [];
    const blockedVisits: GenerateInvoicesBatchResult['blockedVisits'] = [];
    for (const candidate of candidates) {
      const result = this.evvGateService.validateVisitEVV(candidate.evv);
      if (result.isValid) {
        verified.push(candidate);
      } else {
        blockedVisits.push({
          visitId: candidate.evv.visitId,
          clientName: candidate.evv.clientName || 'Unknown',
          reasons: candidate.hasEvvRecord ? result.errors : ['No EVV record found for this visit.', ...result.errors],
          missingElements: result.missingElements,
        });
      }
    }

    // One invoice per payer per branch: the invoice belongs to the branch that delivered the care.
    const groups = new Map<string, BillableItemEvidence[]>();
    for (const item of verified) {
      const key = `${item.payerId}:${item.branchId}`;
      const group = groups.get(key) ?? [];
      group.push(item);
      groups.set(key, group);
    }

    const generatedInvoices: Invoice[] = [];
    const today = new Date();
    for (const items of groups.values()) {
      const first = items[0]!;
      const serviceTimes = items.map((i) => new Date(i.serviceDate).getTime());
      const draft = await this.createInvoice(
        {
          organizationId: input.organizationId,
          branchId: first.branchId,
          invoiceType: 'STANDARD',
          payerId: first.payerId,
          payerType: first.payerType,
          payerName: first.payerName,
          periodStart: input.periodStart ?? new Date(Math.min(...serviceTimes)),
          periodEnd: input.periodEnd ?? new Date(Math.max(...serviceTimes)),
          invoiceDate: today,
          dueDate: today,
          billableItemIds: items.map((i) => i.billableItemId),
        },
        userId,
        orgCode
      );
      // Re-runs the gate against the stored evidence before marking ready.
      generatedInvoices.push(await this.transitionInvoiceToReadyToSubmit(draft.id, userId));
    }

    return {
      generatedInvoices,
      verifiedVisitsCount: verified.length,
      blockedVisitsCount: blockedVisits.length,
      blockedVisits,
    };
  }

  /**
   * Claims queue for the billing dashboard: one row per billable item, with the
   * EVV gate result computed from the stored EVV record.
   */
  async getClaimsQueue(
    organizationId: UUID,
    filters: { payor?: PayorTypeFilter; search?: string } = {}
  ): Promise<ClaimsQueueResult> {
    const rows = await this.evidenceRepository.findForClaimsQueue(organizationId);
    const payor = filters.payor ?? 'ALL';
    const search = (filters.search ?? '').trim().toLowerCase();

    const items: ClaimsQueueItem[] = rows
      .filter((row) => matchesPayorFilter(row.payerType, payor))
      .map((row) => {
        const evvValidation = this.evvGateService.validateVisitEVV(row.evv);
        if (!row.hasEvvRecord) {
          evvValidation.errors.unshift('No EVV record found for this visit.');
        }
        return {
          id: row.billableItemId,
          claimNumber: row.invoiceNumber ? `${row.invoiceNumber}-${row.billableItemId.slice(0, 4).toUpperCase()}` : `BI-${row.billableItemId.slice(0, 8).toUpperCase()}`,
          ...(row.invoiceId ? { invoiceId: row.invoiceId, invoiceNumber: row.invoiceNumber } : {}),
          clientId: row.evv.clientId,
          clientName: row.evv.clientName,
          ...(row.evv.clientMedicaidId ? { clientMedicaidId: row.evv.clientMedicaidId } : {}),
          caregiverId: row.evv.caregiverId,
          caregiverName: row.evv.caregiverName,
          serviceDate: new Date(row.serviceDate).toISOString(),
          serviceCode: row.serviceTypeCode,
          serviceDescription: row.serviceTypeName,
          units: row.units,
          unitType: row.unitType,
          unitRate: row.unitRate,
          totalAmount: row.finalAmount,
          payorType: row.payerType,
          payorName: row.payerName,
          status: deriveClaimStatus(row, evvValidation.isValid),
          evvValidation,
          ...(row.denialReason ? { rejectionReason: row.denialReason } : {}),
          createdAt: new Date(row.createdAt).toISOString(),
          updatedAt: new Date(row.updatedAt).toISOString(),
        };
      })
      .filter((item) =>
        search === ''
          ? true
          : [item.clientName, item.caregiverName, item.claimNumber, item.payorName, item.serviceCode]
              .some((field) => field.toLowerCase().includes(search))
      );

    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
    const billedThisMonth = (item: ClaimsQueueItem): boolean => {
      if (item.status !== 'BILLED' && item.status !== 'PAID') return false;
      const row = rows.find((r) => r.billableItemId === item.id);
      return row?.invoiceDate !== undefined && new Date(row.invoiceDate).getTime() >= monthStart;
    };

    const sum = (list: ClaimsQueueItem[]): number => list.reduce((total, i) => total + i.totalAmount, 0);
    const pending = items.filter((i) => i.status === 'EVV_INCOMPLETE');
    const ready = items.filter((i) => i.status === 'VERIFIED_READY');
    // Unbilled = not yet submitted to a payer, whether or not it sits on a draft invoice.
    const unbilled = items.filter((i) => i.status === 'EVV_INCOMPLETE' || i.status === 'VERIFIED_READY');
    const billed = items.filter(billedThisMonth);

    return {
      items,
      total: items.length,
      summary: {
        totalUnbilledAmount: sum(unbilled),
        totalUnbilledCount: unbilled.length,
        pendingEVVCount: pending.length,
        pendingEVVAmount: sum(pending),
        claimsReadyCount: ready.length,
        claimsReadyAmount: sum(ready),
        totalBilledMtdAmount: sum(billed),
        totalBilledMtdCount: billed.length,
      },
    };
  }

  /**
   * Export an invoice as an 837P preview. Blocked unless every line passes the EVV gate.
   */
  async export837PClaim(invoiceId: UUID, organizationId: UUID): Promise<{ invoice: Invoice; content: string }> {
    const invoice = await this.findInvoiceForOrganization(invoiceId, organizationId);
    const visits = await this.loadInvoiceEvidence(invoice);
    return { invoice, content: this.evvGateService.generate837PPreview(invoice, visits) };
  }

  /**
   * Export an invoice as CMS-1500 forms (one per patient). Blocked unless every line passes the EVV gate.
   */
  async exportCMS1500Claim(invoiceId: UUID, organizationId: UUID): Promise<CMS1500ClaimForm[]> {
    const invoice = await this.findInvoiceForOrganization(invoiceId, organizationId);
    const visits = await this.loadInvoiceEvidence(invoice);
    return this.evvGateService.generateCMS1500Preview(invoice, visits);
  }

  /**
   * Export the claims queue to CSV. Rows failing the EVV gate are excluded.
   */
  async exportClaimsCSV(
    organizationId: UUID,
    filters: { payor?: PayorTypeFilter } = {}
  ): Promise<{ csv: string; excludedCount: number }> {
    const queue = await this.getClaimsQueue(organizationId, filters);
    return this.evvGateService.generateClaimsCSV(queue.items);
  }

  private async findInvoiceForOrganization(invoiceId: UUID, organizationId: UUID): Promise<Invoice> {
    const invoice = await this.repository.findInvoiceById(invoiceId);
    if (invoice?.organizationId !== organizationId) {
      throw new Error('Invoice not found');
    }
    return invoice;
  }

  /** EVV evidence for each invoice line item, in line-item order. */
  private async loadInvoiceEvidence(invoice: Invoice): Promise<EVVVisitVerificationInput[]> {
    const billableItemIds = invoice.lineItems.map((li) => li.billableItemId);
    const evidence = await this.evidenceRepository.findByBillableItemIds(invoice.organizationId, billableItemIds);
    const byId = new Map(evidence.map((e) => [e.billableItemId, e.evv]));
    // A line item whose billable item cannot be found has no evidence at all.
    return billableItemIds.map(
      (id) =>
        byId.get(id) ?? {
          visitId: id,
          serviceTypeCode: '',
          clientId: '',
          clientName: '',
          caregiverId: '',
          caregiverName: '',
          serviceDate: '',
          clockInTime: '',
        }
    );
  }

  /**
   * Send invoice to payer; allowed from DRAFT or READY_TO_SUBMIT.
   */
  async sendInvoice(id: UUID, userId: UUID): Promise<Invoice> {
    const invoice = await this.repository.findInvoiceById(id);
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    if (invoice.status !== 'DRAFT' && invoice.status !== 'READY_TO_SUBMIT') {
      throw new Error(`Cannot send invoice in ${invoice.status} status`);
    }

    // Medicaid (fee-for-service and MCO) claims may not leave the agency without
    // EVV, even when sent straight from DRAFT. Re-checked here so an EVV record
    // voided after READY_TO_SUBMIT still blocks submission.
    if (EVV_REQUIRED_PAYER_TYPES.has(invoice.payerType)) {
      const visits = await this.loadInvoiceEvidence(invoice);
      this.evvGateService.assertCanTransitionToReadyToSubmit(invoice, visits);
    }

    return this.repository.updateInvoice(
      id,
      { status: 'SENT', submittedDate: new Date(), submittedBy: userId },
      userId
    );
  }

  /**
   * Void an invoice; disallowed once PAID or already VOIDED.
   */
  async voidInvoice(id: UUID, userId: UUID): Promise<Invoice> {
    const invoice = await this.repository.findInvoiceById(id);
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    if (invoice.status === 'PAID' || invoice.status === 'VOIDED') {
      throw new Error(`Cannot void invoice in ${invoice.status} status`);
    }

    return this.repository.updateInvoice(id, { status: 'VOIDED' }, userId);
  }

  /**
   * Create payment from payer
   */
  async createPayment(
    input: CreatePaymentInput,
    userId: UUID,
    orgCode: string
  ): Promise<Payment> {
    // Validate input
    const validation = validateCreatePayment(input);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    // Generate payment number
    const paymentCount = await this.getPaymentCount(
      input.organizationId,
      new Date().getFullYear()
    );
    const paymentNumber = generatePaymentNumber(
      orgCode,
      paymentCount + 1,
      new Date().getFullYear()
    );

    // Create payment
    const payment: Omit<Payment, 'id' | 'createdAt' | 'updatedAt' | 'version'> = {
      organizationId: input.organizationId,
      branchId: input.branchId,
      paymentNumber,
      paymentType: 'FULL',
      payerId: input.payerId,
      payerType: input.payerType,
      payerName: input.payerName,
      amount: input.amount,
      currency: 'USD',
      paymentDate: input.paymentDate,
      receivedDate: input.receivedDate,
      paymentMethod: input.paymentMethod,
      ...(input.referenceNumber ? { referenceNumber: input.referenceNumber } : {}),
      allocations: [],
      unappliedAmount: input.amount,
      status: 'RECEIVED',
      statusHistory: [
        {
          id: uuid(),
          fromStatus: null,
          toStatus: 'RECEIVED',
          timestamp: new Date(),
          changedBy: userId,
          reason: 'Payment received',
        },
      ],
      isReconciled: false,
      ...(input.notes ? { notes: input.notes } : {}),
      createdBy: userId,
      updatedBy: userId,
    };

    return this.repository.createPayment(payment);
  }

  /**
   * Allocate payment to invoices
   */
  async allocatePayment(
    input: AllocatePaymentInput,
    userId: UUID
  ): Promise<void> {
    // Get payment
    const payment = await this.repository.findPaymentById(input.paymentId);
    if (!payment) {
      throw new Error('Payment not found');
    }

    // Validate allocation
    const validation = validateAllocatePayment(input, payment.unappliedAmount);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Apply each allocation
      for (const allocation of input.allocations) {
        // Get invoice
        const invoice = await this.repository.findInvoiceById(allocation.invoiceId);
        if (!invoice) {
          throw new Error(`Invoice ${allocation.invoiceId} not found`);
        }

        // Verify amount doesn't exceed balance
        if (allocation.amount > invoice.balanceDue) {
          throw new Error(
            `Allocation amount ${allocation.amount} exceeds balance due ${invoice.balanceDue}`
          );
        }

        // Add payment allocation
        const paymentAllocation = {
          id: uuid(),
          invoiceId: allocation.invoiceId,
          invoiceNumber: invoice.invoiceNumber,
          amount: allocation.amount,
          appliedAt: new Date(),
          appliedBy: userId,
          notes: allocation.notes,
        };

        await this.repository.allocatePayment(
          payment.id,
          paymentAllocation,
          userId,
          client
        );

        // Update invoice payment status
        await this.repository.updateInvoicePayment(
          invoice.id,
          allocation.amount,
          {
            paymentId: payment.id,
            amount: allocation.amount,
            date: payment.paymentDate,
          },
          userId,
          client
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Approve billable item (move from PENDING to READY)
   */
  async approveBillableItem(
    billableItemId: UUID,
    userId: UUID
  ): Promise<void> {
    const item = await this.repository.searchBillableItems({
      organizationId: undefined!,
    });

    const billableItem = item.find((i) => i.id === billableItemId);
    if (!billableItem) {
      throw new Error('Billable item not found');
    }

    if (billableItem.status !== 'PENDING') {
      throw new Error(`Cannot approve item in ${billableItem.status} status`);
    }

    await this.repository.updateBillableItemStatus(
      billableItemId,
      'READY',
      {
        id: uuid(),
        fromStatus: 'PENDING',
        toStatus: 'READY',
        timestamp: new Date(),
        changedBy: userId,
        reason: 'Approved for billing',
      },
      userId
    );
  }

  /**
   * Approve invoice for submission
   */
  async approveInvoice(invoiceId: UUID): Promise<void> {
    const invoice = await this.repository.findInvoiceById(invoiceId);
    if (!invoice) {
      throw new Error('Invoice not found');
    }

    if (invoice.status !== 'DRAFT' && invoice.status !== 'PENDING_REVIEW') {
      throw new Error(`Cannot approve invoice in ${invoice.status} status`);
    }

    // In a transaction, update status (would use repository method)
    // This is a simplified version
    throw new Error('Not implemented - would update status to APPROVED');
  }

  /**
   * Get invoice count for number generation
   */
  private async getInvoiceCount(
    organizationId: UUID,
    year: number,
    client?: PoolClient
  ): Promise<number> {
    const db = client || this.pool;
    const result = await db.query(
      `SELECT COUNT(*) as count FROM invoices 
       WHERE organization_id = $1 
       AND EXTRACT(YEAR FROM invoice_date) = $2`,
      [organizationId, year]
    );
    return parseInt(result.rows[0].count);
  }

  /**
   * Get payment count for number generation
   */
  private async getPaymentCount(
    organizationId: UUID,
    year: number
  ): Promise<number> {
    const result = await this.pool.query(
      `SELECT COUNT(*) as count FROM payments 
       WHERE organization_id = $1 
       AND EXTRACT(YEAR FROM payment_date) = $2`,
      [organizationId, year]
    );
    return parseInt(result.rows[0].count);
  }
}

const EDITABLE_TARGET_STATUSES: ReadonlySet<InvoiceStatus> = new Set<InvoiceStatus>([
  'DRAFT',
  'PENDING_REVIEW',
  'APPROVED',
  'CANCELLED',
]);

const EVV_REQUIRED_PAYER_TYPES: ReadonlySet<PayerType> = new Set<PayerType>(['MEDICAID', 'MANAGED_CARE']);

function matchesPayorFilter(payerType: PayerType, filter: PayorTypeFilter): boolean {
  switch (filter) {
    case 'MEDICAID_MCO':
      return payerType === 'MEDICAID' || payerType === 'MANAGED_CARE';
    case 'MEDICARE':
      return payerType === 'MEDICARE' || payerType === 'MEDICARE_ADVANTAGE';
    case 'PRIVATE_PAY':
      return payerType === 'PRIVATE_PAY';
    case 'VA':
      return payerType === 'VETERANS_BENEFITS';
    default:
      return true;
  }
}

function deriveClaimStatus(row: BillableItemEvidence, evvValid: boolean): ClaimStatus {
  if (row.isDenied || row.billableItemStatus === 'DENIED' || row.invoiceStatus === 'DISPUTED') {
    return 'REJECTED';
  }
  if (row.invoiceStatus === 'PAID' || row.billableItemStatus === 'PAID') {
    return 'PAID';
  }
  if (
    row.invoiceStatus === 'SENT' ||
    row.invoiceStatus === 'SUBMITTED' ||
    row.invoiceStatus === 'PARTIALLY_PAID' ||
    row.invoiceStatus === 'PAST_DUE'
  ) {
    return 'BILLED';
  }
  return evvValid ? 'VERIFIED_READY' : 'EVV_INCOMPLETE';
}
