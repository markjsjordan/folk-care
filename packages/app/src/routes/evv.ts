/**
 * EVV (Electronic Visit Verification) Routes
 *
 * RESTful API endpoints for EVV clock-in/out and record management.
 *
 * Real clock-in/clock-out persistence is backed by EVVService/EVVHandlers,
 * including geofence validation against the visit's service address and
 * state-specific compliance checks (StateComplianceService). Record search
 * and retrieval use the same real SQL-backed EVVRepository.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { Database, AuthMiddleware } from '@folkcare/core';
import {
  EVVRepository,
  EVVService,
  EVVHandlers,
  IntegrationService,
  createClientProvider,
  createCaregiverProvider,
  EVVAggregatorService,
  AggregatorHandlers,
  AggregatorSubmissionRepository,
  AggregatorConfigRepository,
} from '@folkcare/time-tracking-evv';
import { createVisitProvider } from '@folkcare/scheduling-visits';

export function createEVVRouter(db: Database): Router {
  const router = Router();
  const authMiddleware = new AuthMiddleware(db);
  const evvRepository = new EVVRepository(db);
  const pool = db.getPool();
  const integrationService = new IntegrationService(db);
  const visitProvider = createVisitProvider(pool, db);
  const clientProvider = createClientProvider(db);
  const caregiverProvider = createCaregiverProvider(db);
  const evvService = new EVVService(
    evvRepository,
    integrationService,
    visitProvider,
    clientProvider,
    caregiverProvider,
    db
  );
  const evvHandlers = new EVVHandlers(evvService);

  // Aggregator submission tracking (FC-AUDIT-EVV WU-4)
  const aggregatorSubmissionRepository = new AggregatorSubmissionRepository(db);
  const aggregatorConfigRepository = new AggregatorConfigRepository();
  const evvAggregatorService = new EVVAggregatorService(
    aggregatorConfigRepository,
    aggregatorSubmissionRepository
  );
  const aggregatorHandlers = new AggregatorHandlers(evvAggregatorService, aggregatorSubmissionRepository);

  // All EVV routes require authentication
  router.use(authMiddleware.requireAuth);
  router.use(authMiddleware.auditImpersonatedActions);

  /**
   * GET /api/evv
   * Search EVV records with filters
   */
  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const orgId = req.user?.organizationId;
      if (orgId === undefined) {
        res.status(400).json({ error: 'Organization ID required' });
        return;
      }

      const filters: Record<string, unknown> = {
        organizationId: orgId,
      };
      
      if (typeof req.query.branchId === 'string' && req.query.branchId !== '') {
        filters.branchId = req.query.branchId;
      }
      if (typeof req.query.caregiverId === 'string' && req.query.caregiverId !== '') {
        filters.caregiverId = req.query.caregiverId;
      }
      if (typeof req.query.clientId === 'string' && req.query.clientId !== '') {
        filters.clientId = req.query.clientId;
      }
      if (typeof req.query.status === 'string' && req.query.status !== '') {
        filters.status = [req.query.status];
      }

      const pagination = {
        page: parseInt((typeof req.query.page === 'string' && req.query.page !== '') ? req.query.page : '1', 10),
        limit: parseInt((typeof req.query.limit === 'string' && req.query.limit !== '') ? req.query.limit : '25', 10),
      };

      const records = await evvRepository.searchEVVRecords(filters, pagination);
      
      res.json({
        items: records.items,
        total: records.total,
        page: pagination.page,
        limit: pagination.limit,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/evv/:id
   * Get EVV record by ID
   */
  router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params.id;
      if (id === undefined || id === '') {
        res.status(400).json({ error: 'ID required' });
        return;
      }

      const record = await evvRepository.getEVVRecordById(id);
      
      if (record === null) {
        res.status(404).json({ error: 'EVV record not found' });
        return;
      }
      
      res.json(record);
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/evv/clock-in
   * Clock in to start a visit with EVV geofence/compliance verification
   */
  router.post('/clock-in', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const apiReq = { body: req.body, params: req.params, query: req.query as Record<string, string>, user: req.user! };
      const result = await evvHandlers.clockIn(apiReq);
      res.status(result.status).json(result.error !== undefined ? { error: result.error } : result.data);
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/evv/:id/clock-out
   * Clock out to end a visit with EVV geofence/compliance verification
   */
  router.post('/:id/clock-out', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const apiReq = { body: { ...req.body, evvRecordId: req.params.id }, params: req.params, query: req.query as Record<string, string>, user: req.user! };
      const result = await evvHandlers.clockOut(apiReq);
      res.status(result.status).json(result.error !== undefined ? { error: result.error } : result.data);
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/evv/aggregator/submissions/stats
   * Aggregator submission statistics (FC-AUDIT-EVV WU-4)
   */
  router.get('/aggregator/submissions/stats', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const apiReq = { body: req.body, params: req.params, query: req.query as Record<string, string>, user: req.user! };
      const result = await aggregatorHandlers.getSubmissionStats(apiReq);
      res.status(result.status).json(result.error !== undefined ? { error: result.error } : { data: result.data });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/evv/aggregator/submissions/pending
   * All pending aggregator submissions needing retry
   */
  router.get('/aggregator/submissions/pending', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const apiReq = { body: req.body, params: req.params, query: req.query as Record<string, string>, user: req.user! };
      const result = await aggregatorHandlers.getPendingSubmissions(apiReq);
      res.status(result.status).json(result.error !== undefined ? { error: result.error } : { data: result.data });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/evv/aggregator/submissions/retry-all
   * Trigger retry for all pending aggregator submissions
   */
  router.post('/aggregator/submissions/retry-all', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const apiReq = { body: req.body, params: req.params, query: req.query as Record<string, string>, user: req.user! };
      const result = await aggregatorHandlers.retryAllPending(apiReq);
      res.status(result.status).json(result.error !== undefined ? { error: result.error } : { data: result.data });
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/evv/aggregator/submissions/:id/retry
   * Manually retry one failed aggregator submission
   */
  router.post('/aggregator/submissions/:id/retry', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const apiReq = { body: req.body, params: { submissionId: req.params.id!, ...req.params }, query: req.query as Record<string, string>, user: req.user! };
      const result = await aggregatorHandlers.retrySubmission(apiReq);
      res.status(result.status).json(result.error !== undefined ? { error: result.error } : { data: result.data });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/evv/aggregator/submissions/:evvRecordId
   * Submission history for a specific EVV record
   */
  router.get('/aggregator/submissions/:evvRecordId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const apiReq = { body: req.body, params: req.params, query: req.query as Record<string, string>, user: req.user! };
      const result = await aggregatorHandlers.getSubmissionsByRecord(apiReq);
      res.status(result.status).json(result.error !== undefined ? { error: result.error } : { data: result.data });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
