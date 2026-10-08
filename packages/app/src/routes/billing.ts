/**
 * Billing & Invoicing Routes
 * 
 * RESTful API endpoints for billing and invoice management
 */

import { Router, Request, Response, NextFunction } from 'express';
import { Database, AuthMiddleware } from '@folkcare/core';
import {
  BillingRepository,
  BillingService,
  InvoiceSearchFilters,
  InvoiceStatus,
  RevenueForecastingService,
  InvoicePdfGeneratorService,
} from '@folkcare/billing-invoicing';
import knex from 'knex';

/**
 * Create a Knex instance for AI services that need it.
 */
function getKnexInstance(): ReturnType<typeof knex> {
  const connectionString = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/folk-care-0';
  return knex({
    client: 'pg',
    connection: connectionString,
  });
}

function isInvoiceStatus(value: string): value is InvoiceStatus {
  return ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'SENT', 'SUBMITTED', 
          'PARTIALLY_PAID', 'PAID', 'PAST_DUE', 'DISPUTED', 'CANCELLED', 'VOIDED'].includes(value);
}

export function createBillingRouter(db: Database): Router {
  const router = Router();
  const authMiddleware = new AuthMiddleware(db);
  const billingRepo = new BillingRepository(db.getPool());
  const billingService = new BillingService(db.getPool());
  const pdfGenerator = new InvoicePdfGeneratorService();

  // All billing routes require authentication
  router.use(authMiddleware.requireAuth);

  /**
   * GET /api/billing/invoices
   * Search invoices with filters
   */
  router.get('/invoices', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.user?.organizationId;

      if (typeof organizationId !== 'string') {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const filters: InvoiceSearchFilters = {
        organizationId
      };

      // Apply query filters
      if (typeof req.query.clientId === 'string') filters.clientId = req.query.clientId;
      if (typeof req.query.payerId === 'string') filters.payerId = req.query.payerId;
      if (typeof req.query.status === 'string' && isInvoiceStatus(req.query.status)) {
        filters.status = [req.query.status];
      }
      if (typeof req.query.startDate === 'string') filters.startDate = new Date(req.query.startDate);
      if (typeof req.query.endDate === 'string') filters.endDate = new Date(req.query.endDate);
      if (req.query.isPastDue === 'true') filters.isPastDue = true;
      if (req.query.hasBalance === 'true') filters.hasBalance = true;

      // Parse limit/offset with sane defaults and clamping. Default 50 per
      // page (previous behavior silently returned up to 1000 unfiltered);
      // clamp limit to [1, 1000] and offset to >= 0 so bad input can't
      // produce an empty/huge query instead of a 400-worthy no-op.
      const parsedLimit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : NaN;
      const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 1000) : 50;
      filters.limit = limit;

      const parsedOffset = typeof req.query.offset === 'string' ? parseInt(req.query.offset, 10) : NaN;
      const offset = Number.isFinite(parsedOffset) && parsedOffset > 0 ? parsedOffset : 0;
      filters.offset = offset;

      const [invoices, total] = await Promise.all([
        billingRepo.searchInvoices(filters),
        billingRepo.countInvoices(filters),
      ]);

      res.json({
        items: invoices,
        total,
        hasMore: offset + invoices.length < total
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/billing/summary
   * Get billing summary statistics
   */
  router.get('/summary', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.user?.organizationId;

      if (typeof organizationId !== 'string') {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Get all invoices for organization
      const allInvoices = await billingRepo.searchInvoices({ organizationId });

      const now = new Date();
      const totalInvoiced = allInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
      const totalPaid = allInvoices.reduce((sum, inv) => sum + inv.paidAmount, 0);
      const totalOutstanding = allInvoices.reduce((sum, inv) => sum + inv.balanceDue, 0);
      
      const overdueInvoices = allInvoices.filter(inv => 
        inv.balanceDue > 0 && new Date(inv.dueDate) < now
      );
      const overdueAmount = overdueInvoices.reduce((sum, inv) => sum + inv.balanceDue, 0);

      res.json({
        totalInvoiced,
        totalPaid,
        totalOutstanding,
        overdueAmount,
        invoiceCount: {
          total: allInvoices.length,
          draft: allInvoices.filter(i => i.status === 'DRAFT').length,
          pending: allInvoices.filter(i => i.status === 'PENDING_REVIEW').length,
          sent: allInvoices.filter(i => i.status === 'SENT').length,
          paid: allInvoices.filter(i => i.status === 'PAID').length,
          overdue: overdueInvoices.length
        }
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/billing/invoices/:id
   * Get invoice by ID
   */
  router.get('/invoices/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      
      if (typeof id !== 'string' || id.length === 0) {
        res.status(400).json({ error: 'Invoice ID is required' });
        return;
      }

      const invoice = await billingRepo.findInvoiceById(id);
      
      if (invoice === null) {
        res.status(404).json({
          error: 'Invoice not found'
        });
        return;
      }

      res.json(invoice);
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/billing/invoices/:id/payments
   * Get payments for an invoice
   */
  router.get('/invoices/:id/payments', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      
      if (typeof id !== 'string' || id.length === 0) {
        res.status(400).json({ error: 'Invoice ID is required' });
        return;
      }

      const invoice = await billingRepo.findInvoiceById(id);
      
      if (invoice === null) {
        res.status(404).json({
          error: 'Invoice not found'
        });
        return;
      }

      // Return payments array from invoice
      res.json(invoice.payments);
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/billing/forecast
   * Generate AI-powered revenue forecast
   */
  router.post('/forecast', async (req: Request, res: Response, next: NextFunction) => {
    const knexDbForForecast = getKnexInstance();
    try {
      const organizationId = req.user?.organizationId;

      if (typeof organizationId !== 'string') {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const { forecastMonths, includeScenarios } = req.body as {
        forecastMonths?: number;
        includeScenarios?: boolean;
      };

      const forecastService = new RevenueForecastingService(knexDbForForecast);
      const result = await forecastService.forecastRevenue({
        organizationId,
        forecastMonths: forecastMonths ?? 6,
        includeScenarios: includeScenarios ?? true,
      });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    } finally {
      await knexDbForForecast.destroy();
    }
  });

  /**
   * POST /api/billing/invoices
   * Create a new invoice
   */
  router.post('/invoices', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.user?.organizationId;
      const branchIds = req.user?.branchIds;

      if (typeof organizationId !== 'string') {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      if (!branchIds || branchIds.length === 0) {
        res.status(400).json({ error: 'User has no assigned branch' });
        return;
      }

      const branchId = branchIds[0];
      // TODO: derive real orgCode from organizations table once that lookup exists
      const orgCode = organizationId.slice(0, 8).toUpperCase();

      const input = {
        ...req.body,
        organizationId,
        branchId,
      };

      const result = await billingService.createInvoice(input, req.user!.userId, orgCode);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  /**
   * PATCH /api/billing/invoices/:id
   * Update an invoice
   */
  router.patch('/invoices/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      if (typeof id !== 'string' || id.length === 0) {
        res.status(400).json({ error: 'Invoice ID is required' });
        return;
      }

      const result = await billingService.updateInvoice(id, req.body, req.user!.userId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  /**
   * DELETE /api/billing/invoices/:id
   * Soft-delete an invoice
   */
  router.delete('/invoices/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      if (typeof id !== 'string' || id.length === 0) {
        res.status(400).json({ error: 'Invoice ID is required' });
        return;
      }

      await billingService.deleteInvoice(id, req.user!.userId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/billing/invoices/:id/send
   * Send an invoice to the payer
   */
  router.post('/invoices/:id/send', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      if (typeof id !== 'string' || id.length === 0) {
        res.status(400).json({ error: 'Invoice ID is required' });
        return;
      }

      const result = await billingService.sendInvoice(id, req.user!.userId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/billing/invoices/:id/void
   * Void an invoice
   */
  router.post('/invoices/:id/void', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      if (typeof id !== 'string' || id.length === 0) {
        res.status(400).json({ error: 'Invoice ID is required' });
        return;
      }

      const result = await billingService.voidInvoice(id, req.user!.userId);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/billing/invoices/:id/pdf
   * Generate and download invoice PDF
   */
  router.get('/invoices/:id/pdf', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;

      if (typeof id !== 'string' || id.length === 0) {
        res.status(400).json({ error: 'Invoice ID is required' });
        return;
      }

      const invoice = await billingRepo.findInvoiceById(id);

      if (invoice === null) {
        res.status(404).json({ error: 'Invoice not found' });
        return;
      }

      const buffer = await pdfGenerator.generateInvoicePDF(invoice);
      res.setHeader('Content-Type', 'application/pdf');
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/billing/payments
   * Record a payment against an invoice
   */
  router.post('/payments', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.user?.organizationId;
      const branchIds = req.user?.branchIds;

      if (typeof organizationId !== 'string') {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      if (!branchIds || branchIds.length === 0) {
        res.status(400).json({ error: 'User has no assigned branch' });
        return;
      }

      const branchId = branchIds[0];
      // TODO: derive real orgCode from organizations table once that lookup exists
      const orgCode = organizationId.slice(0, 8).toUpperCase();

      // Frontend's CreatePaymentInput lacks payerId/payerType/payerName that
      // the backend's type requires -- fetch the target invoice first to get them.
      const invoice = await billingRepo.findInvoiceById(req.body.invoiceId);

      if (invoice === null) {
        res.status(404).json({ error: 'Invoice not found' });
        return;
      }

      const input = {
        ...req.body,
        organizationId,
        branchId,
        payerId: invoice.payerId,
        payerType: invoice.payerType,
        payerName: invoice.payerName,
      };

      const result = await billingService.createPayment(input, req.user!.userId, orgCode);
      res.status(201).json(result);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
