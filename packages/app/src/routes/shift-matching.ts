/**
 * Shift Matching & Assignment API routes
 *
 * Thin Express router wrapper around the existing ShiftMatchingHandlers
 * (verticals/shift-matching/src/api/shift-matching-handlers.ts). The
 * matching service/repository/handlers already exist; this file only
 * wires HTTP routes to those handler methods.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { Database, AuthMiddleware, UserContext } from '@folkcare/core';
import { ShiftMatchingHandlers } from '@folkcare/shift-matching';
import type {
  OpenShiftFilters,
  ProposalFilters,
  MatchShiftInput,
  CreateProposalInput,
  RespondToProposalInput,
  ShiftPriority,
  MatchingStatus,
  ProposalStatus,
} from '@folkcare/shift-matching';

/**
 * Helper to create UserContext from JWT payload
 */
function getUserContext(req: Request): UserContext {
  const user = req.user!;
  return {
    userId: user.userId,
    organizationId: user.organizationId,
    branchIds: user.branchIds,
    roles: user.roles,
    permissions: user.permissions,
  };
}

export function createShiftMatchingRouter(db: Database): Router {
  const router = Router();
  const authMiddleware = new AuthMiddleware(db);
  const handlers = new ShiftMatchingHandlers(db.getPool());

  // All shift-matching routes require authentication
  router.use(authMiddleware.requireAuth);
  router.use(authMiddleware.auditImpersonatedActions);

  /**
   * GET /api/shift-matching/open-shifts
   * Search for open shifts needing assignment
   */
  router.get('/open-shifts', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const context = getUserContext(req);

      const filters: OpenShiftFilters = {
        organizationId: context.organizationId,
        clientId: req.query['clientId'] as string | undefined,
        dateFrom: req.query['dateFrom'] !== undefined ? new Date(req.query['dateFrom'] as string) : undefined,
        dateTo: req.query['dateTo'] !== undefined ? new Date(req.query['dateTo'] as string) : undefined,
        priority: req.query['priority'] !== undefined ? [req.query['priority'] as ShiftPriority] : undefined,
        matchingStatus: req.query['matchingStatus'] !== undefined ? [req.query['matchingStatus'] as MatchingStatus] : undefined,
        isUrgent: req.query['isUrgent'] !== undefined ? req.query['isUrgent'] === 'true' : undefined,
        serviceTypeId: req.query['serviceTypeId'] as string | undefined,
      };

      const pagination = {
        page: parseInt((req.query['page'] as string | undefined) ?? '1', 10),
        limit: parseInt((req.query['limit'] as string | undefined) ?? '20', 10),
      };

      const result = await handlers.searchOpenShifts(filters, pagination, context);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/shift-matching/open-shifts/:id
   * Get details of a specific open shift
   */
  router.get('/open-shifts/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const context = getUserContext(req);

      const openShift = await handlers.getOpenShift(req.params['id']!, context);
      if (openShift === null) {
        res.status(404).json({ error: 'Open shift not found' });
        return;
      }

      res.json(openShift);
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/shift-matching/open-shifts/:id/match
   * Run matching algorithm for an open shift
   */
  router.post('/open-shifts/:id/match', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const context = getUserContext(req);
      const body = req.body as Partial<MatchShiftInput>;

      const result = await handlers.matchOpenShift(req.params['id']!, body, context);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/shift-matching/open-shifts/:id/candidates
   *
   * No direct handler method exists for "candidates only". We reuse
   * matchOpenShift with autoPropose explicitly disabled (dry-run) and
   * shape the result's `candidates` array into the MatchCandidateListResponse
   * envelope the frontend expects ({ items, total }).
   */
  router.get('/open-shifts/:id/candidates', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const context = getUserContext(req);

      const result = await handlers.matchOpenShift(
        req.params['id']!,
        { autoPropose: false },
        context
      );

      res.json({
        items: result.candidates,
        total: result.candidates.length,
      });
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/shift-matching/proposals
   * Search all proposals with filters
   */
  router.get('/proposals', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const context = getUserContext(req);

      const filters: ProposalFilters = {
        organizationId: context.organizationId,
        caregiverId: req.query['caregiverId'] as string | undefined,
        openShiftId: req.query['openShiftId'] as string | undefined,
        proposalStatus: req.query['proposalStatus'] !== undefined ? [req.query['proposalStatus'] as ProposalStatus] : undefined,
        proposedDateFrom: req.query['dateFrom'] !== undefined ? new Date(req.query['dateFrom'] as string) : undefined,
        proposedDateTo: req.query['dateTo'] !== undefined ? new Date(req.query['dateTo'] as string) : undefined,
      };
      // matchQuality is accepted by the frontend filter type but has no
      // corresponding field in ProposalFilters; intentionally not forwarded.

      const pagination = {
        page: parseInt((req.query['page'] as string | undefined) ?? '1', 10),
        limit: parseInt((req.query['limit'] as string | undefined) ?? '20', 10),
      };

      const result = await handlers.searchProposals(filters, pagination, context);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/shift-matching/proposals/:id
   *
   * No direct getById on the handlers. Implemented via searchProposals
   * filtered to a single id (ProposalFilters has no `id` field, so we
   * filter the page of results client-side by id).
   */
  router.get('/proposals/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const context = getUserContext(req);
      const id = req.params['id']!;

      const result = await handlers.searchProposals(
        { organizationId: context.organizationId },
        { page: 1, limit: 1000 },
        context
      );

      const proposal = result.items.find((p) => p.id === id);
      if (proposal === undefined) {
        res.status(404).json({ error: 'Proposal not found' });
        return;
      }

      res.json(proposal);
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/shift-matching/proposals
   * Manually create a proposal for a specific caregiver
   */
  router.post('/proposals', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const context = getUserContext(req);
      const input = req.body as CreateProposalInput;

      const proposal = await handlers.createManualProposal(input, context);
      res.status(201).json(proposal);
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/shift-matching/proposals/:id/respond
   * Scheduler or admin responds to a proposal on behalf of caregiver
   */
  router.post('/proposals/:id/respond', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const context = getUserContext(req);
      const input = req.body as RespondToProposalInput;

      const proposal = await handlers.respondToProposal(req.params['id']!, input, context);
      res.json(proposal);
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/shift-matching/proposals/:id/withdraw
   *
   * No direct withdraw method exists. The ProposalStatus enum has a
   * WITHDRAWN value, but respondToProposal's RespondToProposalInput only
   * supports `accept: boolean` (mapping to ACCEPTED/REJECTED), with no way
   * to set WITHDRAWN directly. We approximate withdrawal as a scheduler-side
   * rejection (closest supported semantics) rather than silently failing.
   * NOTE: this does NOT set status to WITHDRAWN (service does not support
   * it) - it sets REJECTED with an OTHER rejection category. Flagged as
   * incomplete/approximate in the task report.
   */
  router.post('/proposals/:id/withdraw', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const context = getUserContext(req);

      const input: RespondToProposalInput = {
        proposalId: req.params['id']!,
        accept: false,
        rejectionReason: 'Withdrawn by scheduler',
        rejectionCategory: 'OTHER',
        responseMethod: 'WEB',
      };

      const proposal = await handlers.respondToProposal(req.params['id']!, input, context);
      res.json(proposal);
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/shift-matching/metrics
   * Get matching performance metrics for a time period
   */
  router.get('/metrics', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const context = getUserContext(req);

      const now = new Date();
      const defaultStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const periodStart = req.query['dateFrom'] !== undefined
        ? new Date(req.query['dateFrom'] as string)
        : defaultStart;
      const periodEnd = req.query['dateTo'] !== undefined
        ? new Date(req.query['dateTo'] as string)
        : now;

      const metrics = await handlers.getMatchingMetrics(periodStart, periodEnd, context);
      res.json(metrics);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
