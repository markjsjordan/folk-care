/**
 * Admin routes for system management and monitoring
 */

import { Router, type Router as RouterType, type Request, type Response, type NextFunction } from 'express';
import { getCacheService } from '@folkcare/core/service/cache.service';
import { AuthMiddleware, getDatabase } from '@folkcare/core';

const router: RouterType = Router();

// Lazily construct AuthMiddleware on first request so this module can be
// imported (and the router mounted) before initializeDatabase() runs in
// server.ts's startup sequence.
let authMiddleware: AuthMiddleware | undefined;
function getAuthMiddleware(): AuthMiddleware {
  if (authMiddleware === undefined) {
    authMiddleware = new AuthMiddleware(getDatabase());
  }
  return authMiddleware;
}

// Apply authentication to all admin routes
// SECURITY: Must be the real JWT-verifying AuthMiddleware.requireAuth, not
// the mock requireAuth (which trusted spoofable X-User-* headers with zero
// JWT cross-check and was the root cause of a confirmed live exploit).
router.use((req: Request, res: Response, next: NextFunction) => {
  getAuthMiddleware().requireAuth(req, res, next).catch(next);
});

/**
 * Get cache statistics
 *
 * @route GET /admin/cache/stats
 * @security Requires admin role (not yet implemented)
 */
router.get('/cache/stats', async (_req, res) => {
  try {
    const cache = getCacheService();
    const stats = await cache.getStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting cache stats:', error);
    res.status(500).json({ error: 'Failed to get cache stats' });
  }
});

/**
 * Clear cache
 *
 * @route POST /admin/cache/clear
 * @security Requires admin role (not yet implemented)
 */
router.post('/cache/clear', async (req, res) => {
  try {
    const cache = getCacheService();
    const { pattern } = req.body as { pattern?: string };

    if (pattern !== undefined) {
      await cache.delPattern(pattern);
      res.json({ message: `Cleared cache for pattern: ${pattern}` });
    } else {
      await cache.clearAll();
      res.json({ message: 'Cleared all cache' });
    }
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

export default router;
