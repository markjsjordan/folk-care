/**
 * Quality Assurance & Audits API Handlers
 *
 * Express route handlers for audit management
 */

import type { Request, Response, Router } from 'express';
import type { AuditService } from '../services/audit-service';
import type { UserContext, Database } from '@folkcare/core';
import { AuthMiddleware } from '@folkcare/core';

/**
 * Extract user context from authenticated request
 *
 * SECURITY: Reads from req.user, which AuthMiddleware.requireAuth sets ONLY
 * after verifying the real JWT. Never read/derive from req.userContext --
 * that property was previously populated by a now-removed global mock
 * middleware directly from spoofable X-User-Id / X-Organization-Id headers,
 * which was the root cause of a confirmed live privilege-escalation exploit
 * elsewhere in this codebase (bypassing a real low-privilege JWT via
 * spoofed headers to perform an unauthorized DELETE).
 */
function getUserContext(req: Request): UserContext | undefined {
  if (!req.user) {
    return undefined;
  }
  return {
    userId: req.user.userId,
    organizationId: req.user.organizationId,
    roles: req.user.roles,
    permissions: req.user.permissions,
    branchIds: req.user.branchIds,
  };
}

/**
 * Create audit routes
 * @param auditService - Audit service instance
 * @param router - Express router
 * @param db - Database instance for auth middleware
 */
export function createAuditRoutes(auditService: AuditService, router: Router, db?: Database): Router {
  // Initialize authentication middleware if database provided
  if (db) {
    const authMiddleware = new AuthMiddleware(db);
    // All audit routes require authentication
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    router.use(authMiddleware.requireAuth as any);
  }

  // ============================================================================
  // Audit Routes
  // ============================================================================

  /**
   * GET /api/audits - List audits with filters
   */
  router.get('/audits', async (req: Request, res: Response) => {
    try {
      const context = getUserContext(req);
      if (!context) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { status, auditType, branchId, page, pageSize } = req.query;
      const result = await auditService.getAuditSummariesPaginated(
        {
          status: status as string,
          auditType: auditType as string,
          branchId: branchId as string,
          page: page ? parseInt(page as string, 10) : undefined,
          pageSize: pageSize ? parseInt(pageSize as string, 10) : undefined
        },
        context
      );

      return res.json(result);
    } catch (error) {
      console.error('Error fetching audits:', error);
      return res.status(500).json({ error: 'Failed to fetch audits' });
    }
  });

  /**
   * Shared handler for GET /api/audits/:id and /api/audits/:id/detail
   * Both routes return the full audit detail (including findings and corrective actions).
   * Extracted to a single function to avoid future drift between the two routes.
   */
  const getAuditDetailHandler = async (req: Request, res: Response) => {
    try {
      const context = getUserContext(req);
      if (!context) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ error: 'Audit ID is required' });
      }

      const audit = await auditService.getAuditDetail(id, context);
      if (!audit) {
        return res.status(404).json({ error: 'Audit not found' });
      }

      return res.json(audit);
    } catch (error) {
      console.error('Error fetching audit:', error);
      return res.status(500).json({ error: 'Failed to fetch audit' });
    }
  };

  /**
   * GET /api/audits/dashboard - Get audit dashboard
   *
   * Registered BEFORE /audits/:id (below) so Express does not greedily match the
   * literal 'dashboard' segment as the :id param.
   */
  router.get('/audits/dashboard', async (req: Request, res: Response) => {
    try {
      const context = getUserContext(req);
      if (!context) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const dashboard = await auditService.getAuditDashboard(context);
      return res.json(dashboard);
    } catch (error) {
      console.error('Error fetching audit dashboard:', error);
      return res.status(500).json({ error: 'Failed to fetch dashboard' });
    }
  });

  /**
   * GET /api/audits/findings - List findings with filters
   *
   * Registered before /audits/:id so the literal 'findings' segment isn't swallowed
   * as the :id param.
   */
  router.get('/audits/findings', async (req: Request, res: Response) => {
    try {
      const context = getUserContext(req);
      if (!context) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { severity, status, category, auditId, page, pageSize } = req.query;
      const result = await auditService.getFindings(
        {
          severity: severity as string,
          status: status as string,
          category: category as string,
          auditId: auditId as string,
          page: page ? parseInt(page as string, 10) : undefined,
          pageSize: pageSize ? parseInt(pageSize as string, 10) : undefined
        },
        context
      );

      return res.json(result);
    } catch (error) {
      console.error('Error fetching findings:', error);
      return res.status(500).json({ error: 'Failed to fetch findings' });
    }
  });

  /**
   * GET /api/audits/findings/critical - Get critical findings
   *
   * Registered before /audits/:id for the same literal-segment reason as above.
   */
  router.get('/audits/findings/critical', async (req: Request, res: Response) => {
    try {
      const context = getUserContext(req);
      if (!context) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const findings = await auditService.getCriticalFindings(context);
      return res.json(findings);
    } catch (error) {
      console.error('Error fetching critical findings:', error);
      return res.status(500).json({ error: 'Failed to fetch critical findings' });
    }
  });

  /**
   * GET /api/audits/corrective-actions - List corrective actions with filters
   *
   * This is the DIRECT data source for CorrectiveActionsPage.tsx. Registered before
   * /audits/:id so the literal 'corrective-actions' segment isn't swallowed as :id.
   */
  router.get('/audits/corrective-actions', async (req: Request, res: Response) => {
    try {
      const context = getUserContext(req);
      if (!context) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { status, auditId, findingId, responsiblePersonId, page, pageSize } = req.query;
      const result = await auditService.getCorrectiveActions(
        {
          status: status as string,
          auditId: auditId as string,
          findingId: findingId as string,
          responsiblePersonId: responsiblePersonId as string,
          page: page ? parseInt(page as string, 10) : undefined,
          pageSize: pageSize ? parseInt(pageSize as string, 10) : undefined
        },
        context
      );

      return res.json(result);
    } catch (error) {
      console.error('Error fetching corrective actions:', error);
      return res.status(500).json({ error: 'Failed to fetch corrective actions' });
    }
  });

  /**
   * GET /api/audits/corrective-actions/overdue - Get overdue corrective actions
   *
   * Registered before /audits/:id for the same literal-segment reason as above.
   */
  router.get('/audits/corrective-actions/overdue', async (req: Request, res: Response) => {
    try {
      const context = getUserContext(req);
      if (!context) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const actions = await auditService.getOverdueCorrectiveActions(context);
      return res.json(actions);
    } catch (error) {
      console.error('Error fetching overdue actions:', error);
      return res.status(500).json({ error: 'Failed to fetch overdue actions' });
    }
  });

  /**
   * GET /api/audits/:id/detail - Get audit details (explicit alias route)
   *
   * Uses the same shared handler as GET /api/audits/:id below. Kept as a literal
   * duplicate-by-reference (not duplicate-by-code) per the extract-shared-handler approach.
   */
  router.get('/audits/:id/detail', getAuditDetailHandler);

  /**
   * GET /api/audits/:id - Get audit details
   */
  router.get('/audits/:id', getAuditDetailHandler);

  /**
   * POST /api/audits - Create new audit
   */
  router.post('/audits', async (req: Request, res: Response) => {
    try {
      const context = getUserContext(req);
      if (!context) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const audit = await auditService.createAudit(req.body, context);
      return res.status(201).json(audit);
    } catch (error) {
      console.error('Error creating audit:', error);
      return res.status(500).json({ error: 'Failed to create audit' });
    }
  });

  /**
   * PATCH /api/audits/:id - Update audit
   */
  router.patch('/audits/:id', async (req: Request, res: Response) => {
    try {
      const context = getUserContext(req);
      if (!context) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ error: 'Audit ID is required' });
      }

      const audit = await auditService.updateAudit(id, req.body, context);
      return res.json(audit);
    } catch (error) {
      console.error('Error updating audit:', error);
      return res.status(500).json({ error: 'Failed to update audit' });
    }
  });

  /**
   * POST /api/audits/:id/start - Start audit
   */
  router.post('/audits/:id/start', async (req: Request, res: Response) => {
    try {
      const context = getUserContext(req);
      if (!context) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ error: 'Audit ID is required' });
      }

      const audit = await auditService.startAudit(id, context);
      return res.json(audit);
    } catch (error) {
      console.error('Error starting audit:', error);
      return res.status(500).json({ error: 'Failed to start audit' });
    }
  });

  /**
   * POST /api/audits/:id/complete - Complete audit
   */
  router.post('/audits/:id/complete', async (req: Request, res: Response) => {
    try {
      const context = getUserContext(req);
      if (!context) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ error: 'Audit ID is required' });
      }

      const { executiveSummary, recommendations } = req.body;
      const audit = await auditService.completeAudit(
        id,
        executiveSummary,
        recommendations,
        context
      );
      return res.json(audit);
    } catch (error) {
      console.error('Error completing audit:', error);
      return res.status(500).json({ error: 'Failed to complete audit' });
    }
  });

  // ============================================================================
  // Finding Routes
  // ============================================================================

  /**
   * GET /api/audits/:auditId/findings - Get findings for audit
   */
  router.get('/audits/:auditId/findings', async (req: Request, res: Response) => {
    try {
      const context = getUserContext(req);
      if (!context) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { auditId } = req.params;
      if (!auditId) {
        return res.status(400).json({ error: 'Audit ID is required' });
      }

      const findings = await auditService.getFindingsForAudit(auditId, context);
      return res.json(findings);
    } catch (error) {
      console.error('Error fetching findings:', error);
      return res.status(500).json({ error: 'Failed to fetch findings' });
    }
  });

  /**
   * POST /api/audits/:auditId/findings - Create finding
   */
  router.post('/audits/:auditId/findings', async (req: Request, res: Response) => {
    try {
      const context = getUserContext(req);
      if (!context) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { auditId } = req.params;
      if (!auditId) {
        return res.status(400).json({ error: 'Audit ID is required' });
      }

      const finding = await auditService.createFinding(
        { ...req.body, auditId },
        context
      );
      return res.status(201).json(finding);
    } catch (error) {
      console.error('Error creating finding:', error);
      return res.status(500).json({ error: 'Failed to create finding' });
    }
  });

  /**
   * PATCH /api/audits/findings/:id/status - Update finding status
   */
  router.patch('/audits/findings/:id/status', async (req: Request, res: Response) => {
    try {
      const context = getUserContext(req);
      if (!context) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ error: 'Finding ID is required' });
      }

      const { status, resolutionDescription } = req.body;
      const finding = await auditService.updateFindingStatus(
        id,
        status,
        resolutionDescription,
        context
      );
      return res.json(finding);
    } catch (error) {
      console.error('Error updating finding status:', error);
      return res.status(500).json({ error: 'Failed to update finding status' });
    }
  });

  /**
   * POST /api/audits/findings/:id/verify - Verify finding resolution
   */
  router.post('/audits/findings/:id/verify', async (req: Request, res: Response) => {
    try {
      const context = getUserContext(req);
      if (!context) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ error: 'Finding ID is required' });
      }

      const { verificationNotes } = req.body;
      const finding = await auditService.verifyFinding(
        id,
        verificationNotes,
        context
      );
      return res.json(finding);
    } catch (error) {
      console.error('Error verifying finding:', error);
      return res.status(500).json({ error: 'Failed to verify finding' });
    }
  });

  // ============================================================================
  // Corrective Action Routes
  // ============================================================================

  /**
   * GET /api/audits/:auditId/corrective-actions - Get corrective actions
   */
  router.get('/audits/:auditId/corrective-actions', async (req: Request, res: Response) => {
    try {
      const context = getUserContext(req);
      if (!context) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { auditId } = req.params;
      if (!auditId) {
        return res.status(400).json({ error: 'Audit ID is required' });
      }

      const actions = await auditService.getCorrectiveActionsForAudit(auditId, context);
      return res.json(actions);
    } catch (error) {
      console.error('Error fetching corrective actions:', error);
      return res.status(500).json({ error: 'Failed to fetch corrective actions' });
    }
  });

  /**
   * POST /api/audits/corrective-actions - Create corrective action
   */
  router.post('/audits/corrective-actions', async (req: Request, res: Response) => {
    try {
      const context = getUserContext(req);
      if (!context) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const action = await auditService.createCorrectiveAction(req.body, context);
      return res.status(201).json(action);
    } catch (error) {
      console.error('Error creating corrective action:', error);
      return res.status(500).json({ error: 'Failed to create corrective action' });
    }
  });

  /**
   * PATCH /api/audits/corrective-actions/:id/progress - Update progress
   */
  router.patch('/audits/corrective-actions/:id/progress', async (req: Request, res: Response) => {
    try {
      const context = getUserContext(req);
      if (!context) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ error: 'Action ID is required' });
      }

      const action = await auditService.updateCorrectiveActionProgress(
        id,
        req.body,
        context
      );
      return res.json(action);
    } catch (error) {
      console.error('Error updating corrective action progress:', error);
      return res.status(500).json({ error: 'Failed to update progress' });
    }
  });

  /**
   * POST /api/audits/corrective-actions/:id/complete - Complete action
   */
  router.post('/audits/corrective-actions/:id/complete', async (req: Request, res: Response) => {
    try {
      const context = getUserContext(req);
      if (!context) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ error: 'Action ID is required' });
      }

      const action = await auditService.completeCorrectiveAction(id, context);
      return res.json(action);
    } catch (error) {
      console.error('Error completing corrective action:', error);
      return res.status(500).json({ error: 'Failed to complete corrective action' });
    }
  });

  /**
   * POST /api/audits/corrective-actions/:id/verify - Verify effectiveness
   */
  router.post('/audits/corrective-actions/:id/verify', async (req: Request, res: Response) => {
    try {
      const context = getUserContext(req);
      if (!context) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ error: 'Action ID is required' });
      }

      const { effectivenessRating, verificationNotes } = req.body;
      const action = await auditService.verifyCorrectiveAction(
        id,
        effectivenessRating,
        verificationNotes,
        context
      );
      return res.json(action);
    } catch (error) {
      console.error('Error verifying corrective action:', error);
      return res.status(500).json({ error: 'Failed to verify corrective action' });
    }
  });

  // ============================================================================
  // Dashboard Routes (see top of file for /audits/dashboard, /audits/findings,
  // /audits/findings/critical, /audits/corrective-actions, and
  // /audits/corrective-actions/overdue — registered early to avoid /audits/:id
  // route-ordering conflicts)
  // ============================================================================

  return router;
}
