/**
 * Caregiver Availability Routes Normalization Tests
 *
 * Validates:
 * 1. Canonical availability path: GET /api/visits/caregivers/availability
 *    - Query parameter validation (date format, organizationId)
 *    - Caregiver availability retrieval with associated visits
 * 2. Normalization redirect: GET /api/caregivers/availability
 *    - 307 temporary redirect to canonical /api/visits/caregivers/availability
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Database } from '@folkcare/core';
import { createVisitRouter } from '../visits.js';
import { createCaregiverRouter } from '../caregivers.js';

vi.mock('@folkcare/core', async () => {
  const actual = await vi.importActual<typeof import('@folkcare/core')>('@folkcare/core');
  return {
    ...actual,
    AuthMiddleware: vi.fn().mockImplementation(function () {
      return {
        requireAuth: (req: any, _res: any, next: any) => {
          req.user = {
            userId: 'user-1',
            email: 'coord@example.com',
            organizationId: '33333333-3333-3333-3333-333333333333',
            branchIds: [],
            tokenVersion: 1,
            roles: ['COORDINATOR'],
            permissions: ['visits:read', 'caregivers:read'],
          };
          next();
        },
      };
    }),
  };
});

describe('Caregiver Availability Route Normalization', () => {
  let app: express.Express;
  let mockDb: Partial<Database>;

  beforeEach(() => {
    mockDb = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM caregivers cg')) {
          return Promise.resolve({
            rows: [
              {
                caregiver_id: '11111111-1111-1111-1111-111111111111',
                first_name: 'Maria',
                last_name: 'Santos',
                caregiver_status: 'ACTIVE',
                visits: [
                  {
                    id: 'visit-1',
                    scheduled_start_time: '09:00',
                    scheduled_end_time: '12:00',
                    status: 'SCHEDULED',
                    client_name: 'John Doe',
                  },
                ],
              },
              {
                caregiver_id: '22222222-2222-2222-2222-222222222222',
                first_name: 'David',
                last_name: 'Kim',
                caregiver_status: 'ACTIVE',
                visits: [],
              },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      }),
      getPool: vi.fn().mockReturnValue({ query: vi.fn() }),
    };

    app = express();
    app.use(express.json());

    app.use((req, _res, next) => {
      req.user = {
        userId: 'user-1',
        email: 'coord@example.com',
        organizationId: '33333333-3333-3333-3333-333333333333',
        branchIds: [],
        tokenVersion: 1,
        roles: ['COORDINATOR'],
        permissions: ['visits:read', 'caregivers:read'],
      };
      next();
    });

    app.use('/api/visits', createVisitRouter(mockDb as Database));
    app.use('/api/caregivers', createCaregiverRouter(mockDb as Database));
  });

  describe('Canonical Route: GET /api/visits/caregivers/availability', () => {
    it('returns 400 when date parameter is missing', async () => {
      const res = await request(app).get('/api/visits/caregivers/availability');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Missing required parameter: date');
    });

    it('returns 400 when date parameter has invalid format', async () => {
      const res = await request(app).get('/api/visits/caregivers/availability?date=not-a-date');

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Invalid date format');
    });

    it('returns caregiver availability with scheduled visits for a valid date', async () => {
      const res = await request(app).get('/api/visits/caregivers/availability?date=2026-10-15');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta.date).toBe('2026-10-15');
      expect(res.body.meta.count).toBe(2);

      const maria = res.body.data.find((c: { first_name: string }) => c.first_name === 'Maria');
      expect(maria).toBeDefined();
      expect(maria.visits).toHaveLength(1);
      expect(maria.visits[0].client_name).toBe('John Doe');

      const david = res.body.data.find((c: { first_name: string }) => c.first_name === 'David');
      expect(david).toBeDefined();
      expect(david.visits).toEqual([]);
    });
  });

  describe('Normalization Redirect: GET /api/caregivers/availability', () => {
    it('redirects to canonical /api/visits/caregivers/availability with 307', async () => {
      const res = await request(app)
        .get('/api/caregivers/availability?date=2026-10-15&branch_ids=branch-1')
        .redirects(0);

      expect(res.status).toBe(307);
      expect(res.header.location).toBe('/api/visits/caregivers/availability?date=2026-10-15&branch_ids=branch-1');
    });
  });
});
