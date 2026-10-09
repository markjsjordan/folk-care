/**
 * Visit Patterns Route Integration Tests
 *
 * Spec: FC-SCHED-002-RECURRING-VISITS-TA-SPEC
 * Tests for endpoints:
 * - POST /api/visits/patterns
 * - GET /api/visits/patterns
 * - GET /api/visits/patterns/:id
 * - PUT /api/visits/patterns/:id (THIS_VISIT vs ALL_FUTURE)
 *
 * Verifies multi-tenant scoping and deterministic handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import type { Database } from '@folkcare/core';
import { createVisitRouter } from '../visits.js';
import { errorHandler } from '../../middleware/error-handler.js';

const FIXED_DATE = '2026-10-15';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440000';
const OTHER_ORG_ID = '990e8400-e29b-41d4-a716-446655440099';
const BRANCH_ID = '660e8400-e29b-41d4-a716-446655440000';
const CLIENT_ID = 'aa0e8400-e29b-41d4-a716-446655440000';
const CAREGIVER_ID = '770e8400-e29b-41d4-a716-446655440000';
const PATTERN_ID = 'bb0e8400-e29b-41d4-a716-446655440000';
const VISIT_ID = 'cc0e8400-e29b-41d4-a716-446655440000';

// Mock RecurringVisitPatternEngine & VisitPatternRepository
const mockCreatePatternAndGenerateVisits = vi.fn();
const mockGetPatternWithVisits = vi.fn();
const mockUpdatePatternInstances = vi.fn();
const mockListPatterns = vi.fn();

vi.mock('@folkcare/scheduling-visits', async () => {
  const actual = await vi.importActual('@folkcare/scheduling-visits');
  return {
    ...actual,
    RecurringVisitPatternEngine: vi.fn().mockImplementation(function () {
      return {
        createPatternAndGenerateVisits: mockCreatePatternAndGenerateVisits,
        getPatternWithVisits: mockGetPatternWithVisits,
        updatePatternInstances: mockUpdatePatternInstances,
      };
    }),
    VisitPatternRepository: vi.fn().mockImplementation(function () {
      return {
        listPatterns: mockListPatterns,
      };
    }),
  };
});

// Mock AuthMiddleware & ComplianceAutopilotService in @folkcare/core
vi.mock('@folkcare/core', async () => {
  const actual = await vi.importActual('@folkcare/core');
  return {
    ...actual,
    ComplianceAutopilotService: vi.fn().mockImplementation(function () {
      return {
        canCaregiverBeScheduled: vi.fn().mockResolvedValue({
          canSchedule: true,
          blockingIssues: [],
        }),
      };
    }),
    AuthMiddleware: vi.fn().mockImplementation(function () {
      return {
        requireAuth: (req: any, _res: any, next: any) => {
          req.user = {
            userId: req.headers['x-user-id'] || 'user-admin-001',
            email: 'admin@folkcare.example',
            organizationId: req.headers['x-organization-id'] || ORG_ID,
            branchIds: [BRANCH_ID],
            roles: ['SUPER_ADMIN', 'COORDINATOR'],
            permissions: ['visits:read', 'visits:write'],
          };
          next();
        },
      };
    }),
  };
});

describe('Visit Patterns Endpoints (FC-SCHED-002)', () => {
  let app: Express;
  let mockDb: Database;

  beforeEach(() => {
    vi.clearAllMocks();

    mockDb = {
      query: vi.fn().mockResolvedValue({ rows: [] }),
      getPool: vi.fn().mockReturnValue({}),
    } as unknown as Database;

    app = express();
    app.use(express.json());

    const visitRouter = createVisitRouter(mockDb);
    app.use('/api/visits', visitRouter);
    app.use(errorHandler);
  });

  describe('POST /api/visits/patterns', () => {
    it('creates pattern and generates concrete visits with 201 status', async () => {
      const mockResult = {
        pattern: {
          id: PATTERN_ID,
          organizationId: ORG_ID,
          clientId: CLIENT_ID,
          serviceTypeId: 'svc-personal-care',
          serviceTypeName: 'Personal Care Assistance',
          frequency: 'WEEKLY',
          dayOfWeek: ['MONDAY', 'WEDNESDAY', 'FRIDAY'],
          startDate: FIXED_DATE,
          startTime: '09:00',
          duration: 120,
          status: 'ACTIVE',
        },
        generatedVisitsCount: 6,
        visits: [
          {
            id: VISIT_ID,
            scheduledDate: '2026-10-16',
            scheduledStartTime: '09:00',
            scheduledEndTime: '11:00',
            status: 'ASSIGNED',
          },
        ],
        exceptions: [],
      };

      mockCreatePatternAndGenerateVisits.mockResolvedValueOnce(mockResult);

      const payload = {
        clientId: CLIENT_ID,
        caregiverId: CAREGIVER_ID,
        serviceTypeId: 'svc-personal-care',
        serviceTypeName: 'Personal Care Assistance',
        frequency: 'WEEKLY',
        dayOfWeek: ['MONDAY', 'WEDNESDAY', 'FRIDAY'],
        startDate: FIXED_DATE,
        startTime: '09:00',
        duration: 120,
        horizonDays: 30,
        skipHolidays: true,
      };

      const res = await request(app)
        .post('/api/visits/patterns')
        .set('x-organization-id', ORG_ID)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.pattern.id).toBe(PATTERN_ID);
      expect(res.body.data.generatedVisitsCount).toBe(6);

      // Verify organizationId passed from auth context
      expect(mockCreatePatternAndGenerateVisits).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG_ID,
          clientId: CLIENT_ID,
          duration: 120,
        }),
        expect.objectContaining({
          organizationId: ORG_ID,
        })
      );
    });

    it('rejects request with 400 when required fields are missing', async () => {
      const res = await request(app)
        .post('/api/visits/patterns')
        .set('x-organization-id', ORG_ID)
        .send({
          // Missing clientId, serviceTypeId, startDate, startTime, duration
          frequency: 'WEEKLY',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Missing required fields');
    });
  });

  describe('GET /api/visits/patterns', () => {
    it('lists patterns filtered by organization', async () => {
      const mockList = [
        {
          id: PATTERN_ID,
          organizationId: ORG_ID,
          clientId: CLIENT_ID,
          frequency: 'WEEKLY',
          status: 'ACTIVE',
        },
      ];
      mockListPatterns.mockResolvedValueOnce(mockList);

      const res = await request(app)
        .get('/api/visits/patterns')
        .query({ client_id: CLIENT_ID })
        .set('x-organization-id', ORG_ID);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.count).toBe(1);

      expect(mockListPatterns).toHaveBeenCalledWith({
        organizationId: ORG_ID,
        clientId: CLIENT_ID,
        caregiverId: undefined,
        status: undefined,
      });
    });
  });

  describe('GET /api/visits/patterns/:id', () => {
    it('returns pattern details and generated visits', async () => {
      mockGetPatternWithVisits.mockResolvedValueOnce({
        pattern: {
          id: PATTERN_ID,
          organizationId: ORG_ID,
          clientId: CLIENT_ID,
        },
        visits: [
          { id: VISIT_ID, scheduledDate: '2026-10-16' },
        ],
      });

      const res = await request(app)
        .get(`/api/visits/patterns/${PATTERN_ID}`)
        .set('x-organization-id', ORG_ID);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.pattern.id).toBe(PATTERN_ID);
      expect(res.body.data.visits).toHaveLength(1);
      expect(mockGetPatternWithVisits).toHaveBeenCalledWith(PATTERN_ID, ORG_ID);
    });

    it('returns 404 when pattern not found or access denied for tenant', async () => {
      const error: any = new Error('Visit pattern not found or access denied');
      error.name = 'NotFoundError';
      error.statusCode = 404;
      mockGetPatternWithVisits.mockRejectedValueOnce(error);

      const res = await request(app)
        .get(`/api/visits/patterns/${PATTERN_ID}`)
        .set('x-organization-id', OTHER_ORG_ID);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('Visit pattern not found');
    });
  });

  describe('PUT /api/visits/patterns/:id', () => {
    it('updates all future instances with updateMode ALL_FUTURE', async () => {
      mockUpdatePatternInstances.mockResolvedValueOnce({
        updatedPattern: { id: PATTERN_ID, duration: 180 },
        updatedVisitsCount: 12,
        mode: 'ALL_FUTURE',
      });

      const res = await request(app)
        .put(`/api/visits/patterns/${PATTERN_ID}`)
        .set('x-organization-id', ORG_ID)
        .send({
          updateMode: 'ALL_FUTURE',
          fromDate: '2026-11-01',
          updates: {
            duration: 180,
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.updatedVisitsCount).toBe(12);
      expect(mockUpdatePatternInstances).toHaveBeenCalledWith(
        PATTERN_ID,
        expect.objectContaining({
          updateMode: 'ALL_FUTURE',
          fromDate: '2026-11-01',
          updates: { duration: 180 },
        }),
        expect.objectContaining({ organizationId: ORG_ID })
      );
    });

    it('updates single instance when updateMode is THIS_VISIT', async () => {
      mockUpdatePatternInstances.mockResolvedValueOnce({
        updatedPattern: { id: PATTERN_ID },
        updatedVisitsCount: 1,
        mode: 'THIS_VISIT',
      });

      const res = await request(app)
        .put(`/api/visits/patterns/${PATTERN_ID}`)
        .set('x-organization-id', ORG_ID)
        .send({
          updateMode: 'THIS_VISIT',
          targetVisitId: VISIT_ID,
          updates: {
            startTime: '10:00',
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.updatedVisitsCount).toBe(1);
    });

    it('rejects THIS_VISIT update when targetVisitId is omitted', async () => {
      const res = await request(app)
        .put(`/api/visits/patterns/${PATTERN_ID}`)
        .set('x-organization-id', ORG_ID)
        .send({
          updateMode: 'THIS_VISIT',
          // targetVisitId missing!
          updates: {
            startTime: '10:00',
          },
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toContain('targetVisitId is required when updateMode is THIS_VISIT');
    });
  });
});
