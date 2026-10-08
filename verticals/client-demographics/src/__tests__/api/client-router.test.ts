/**
 * Regression tests for createClientRouter's route registration order.
 *
 * FC-AUDIT-CLIENTS CRITICAL #1: GET /clients/:id was registered BEFORE
 * GET /clients/dashboard and GET /clients/dashboard/stats, so Express's
 * in-order route matching sent dashboard requests to the single-client
 * handler with id='dashboard' instead of the real dashboard handler.
 *
 * These tests build a real Express app around the real createClientRouter
 * export, stubbing only AuthMiddleware (to avoid needing a live JWT/DB) and
 * the ClientService (to avoid needing a live DB). They assert dashboard
 * requests resolve to the dashboard handlers even when a fixture client
 * literally has id === 'dashboard', which would otherwise mask a regression.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';

// Stub AuthMiddleware so requireAuth is a transparent passthrough that
// attaches a fake authenticated userContext, without needing a real JWT/DB.
vi.mock('@folkcare/core', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('@folkcare/core');
  return {
    ...actual,
    AuthMiddleware: class {
      requireAuth = (req: any, _res: any, next: any) => {
        const user = {
          userId: 'user-1',
          organizationId: 'org-1',
          roles: ['ADMIN'],
          permissions: ['clients:read', 'clients:create', 'clients:update', 'clients:delete', 'clients:audit'],
        };
        req.user = user;
        req.userContext = user;
        next();
      };
    },
  };
});

import { createClientRouter } from '../../api/client-handlers';

// Fixture client that deliberately has id === 'dashboard' to prove the
// dashboard route does NOT fall through to the :id handler. Shaped to
// satisfy getClientsDashboard/getDashboardStats' enrichment logic (needs a
// real Date for dateOfBirth and an array for riskFlags).
const DASHBOARD_ID_FIXTURE = {
  id: 'dashboard',
  clientNumber: 'CL-DASHBOARD',
  firstName: 'Decoy',
  lastName: 'Client',
  status: 'ACTIVE',
  dateOfBirth: new Date('1980-01-01'),
  riskFlags: [],
  primaryAddress: null,
  primaryPhone: null,
  programs: [],
};

function buildMockClientService() {
  return {
    getClientById: vi.fn().mockResolvedValue(DASHBOARD_ID_FIXTURE),
    searchClients: vi.fn().mockResolvedValue({
      items: [DASHBOARD_ID_FIXTURE],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    }),
    // Methods invoked by getClientsDashboard's enrichment step, if any extra
    // calls are made; default to safe no-op resolutions.
    getClientSummary: vi.fn().mockResolvedValue({}),
  } as any;
}

describe('createClientRouter - route registration order', () => {
  let app: Express;
  let mockClientService: ReturnType<typeof buildMockClientService>;

  beforeEach(() => {
    mockClientService = buildMockClientService();
    app = express();
    app.use(express.json());
    const router = createClientRouter(mockClientService, {} as any);
    app.use('/api', router);
  });

  it('GET /clients/dashboard resolves to the dashboard handler, not getClient by :id', async () => {
    const res = await request(app).get('/api/clients/dashboard');

    expect(res.status).toBe(200);
    // Proves the dashboard handler (searchClients-based) ran, not getClientById.
    expect(mockClientService.searchClients).toHaveBeenCalled();
    expect(mockClientService.getClientById).not.toHaveBeenCalledWith('dashboard', expect.anything());
    // The response must be dashboard-shaped (a collection), not a single client 404/shape.
    expect(res.body.success).toBe(true);
  });

  it('GET /clients/dashboard/stats resolves to the dashboard-stats handler, not getClient by :id', async () => {
    const res = await request(app).get('/api/clients/dashboard/stats');

    expect(res.status).toBe(200);
    expect(mockClientService.getClientById).not.toHaveBeenCalledWith('dashboard', expect.anything());
  });

  it('GET /clients/:id still resolves correctly for a real (non-reserved) id', async () => {
    mockClientService.getClientById.mockResolvedValueOnce({
      id: 'real-client-id',
      clientNumber: 'CL-REAL',
      firstName: 'Real',
      lastName: 'Client',
      status: 'ACTIVE',
    });

    const res = await request(app).get('/api/clients/real-client-id');

    expect(res.status).toBe(200);
    expect(mockClientService.getClientById).toHaveBeenCalledWith('real-client-id', expect.anything());
  });

  it('GET /clients/number/:clientNumber does not fall through to :id handler', async () => {
    mockClientService.getClientByNumber = vi.fn().mockResolvedValue({
      id: 'some-id',
      clientNumber: 'CL-123',
      firstName: 'Num',
      lastName: 'Lookup',
      status: 'ACTIVE',
    });

    const res = await request(app).get('/api/clients/number/CL-123');

    expect(res.status).toBe(200);
    expect(mockClientService.getClientByNumber).toHaveBeenCalledWith('CL-123', expect.anything(), expect.anything());
    expect(mockClientService.getClientById).not.toHaveBeenCalled();
  });
});
