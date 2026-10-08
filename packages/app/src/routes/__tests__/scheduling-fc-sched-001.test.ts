/**
 * FC-SCHED-001 Integration Test Suite
 *
 * Ported from tests/templates/FC-SCHED-001-TA-AUTOMATION-TEMPLATES.ts
 * Tests scheduling CRUD, conflict detection, caregiver availability checks,
 * auth headers verification, and visit status transitions.
 *
 * Deterministic execution with fixed timestamps (2025-01-15).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { Express } from 'express';
import request from 'supertest';
import type { Database } from '@folkcare/core';
import { createVisitRouter } from '../visits.js';
import { createCaregiverRouter } from '../caregivers.js';
import { ScheduleService } from '@folkcare/scheduling-visits';

// Fixed timestamps for deterministic testing
const FIXED_NOW = new Date('2025-01-15T09:00:00.000Z');
const FIXED_DATE_STR = '2025-01-15';
const ORG_ID = '550e8400-e29b-41d4-a716-446655440000';
const BRANCH_ID = '660e8400-e29b-41d4-a716-446655440000';
const CAREGIVER_ID = '770e8400-e29b-41d4-a716-446655440000';
const CONFLICT_CAREGIVER_ID = '880e8400-e29b-41d4-a716-446655440000';
const VISIT_ID = '990e8400-e29b-41d4-a716-446655440000';
const CLIENT_ID = 'aa0e8400-e29b-41d4-a716-446655440000';

// Mock ScheduleRepository from @folkcare/scheduling-visits
const mockScheduleRepository = {
  getVisitsByCaregiver: vi.fn(),
  getVisitsByDateRange: vi.fn(),
  getVisitById: vi.fn(),
  createVisit: vi.fn(),
  updateVisitStatus: vi.fn(),
  assignCaregiver: vi.fn(),
  findConflictingVisits: vi.fn(),
  createServicePattern: vi.fn(),
  getServicePatternById: vi.fn(),
  updateServicePattern: vi.fn(),
  getPatternsByClient: vi.fn(),
};

vi.mock('@folkcare/scheduling-visits', async () => {
  const actual = await vi.importActual('@folkcare/scheduling-visits');
  return {
    ...actual,
    ScheduleRepository: vi.fn().mockImplementation(function () {
      return mockScheduleRepository;
    }),
  };
});

// Mock ComplianceAutopilotService
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
        requireAuth: (req: any, res: any, next: any) => {
          const authHeader = req.headers['authorization'];
          if (!authHeader?.startsWith('Bearer ')) {
            res.status(401).json({ success: false, error: 'Unauthorized: Bearer token required' });
            return;
          }

          req.user = {
            userId: req.headers['x-user-id'] ?? 'user-admin-001',
            email: 'admin@folkcare.example',
            organizationId: req.headers['x-organization-id'] ?? ORG_ID,
            branchIds: [BRANCH_ID],
            roles: req.headers['x-user-roles']
              ? req.headers['x-user-roles'].split(',')
              : ['SUPER_ADMIN', 'COORDINATOR'],
            permissions: req.headers['x-user-permissions']
              ? req.headers['x-user-permissions'].split(',')
              : ['visits:read', 'visits:write', 'visits:assign', 'caregivers:read'],
          };
          next();
        },
      };
    }),
  };
});

// Mock CaregiverService for caregiver routes
vi.mock('@folkcare/caregiver-staff', () => ({
  CaregiverService: vi.fn().mockImplementation(function () {
    return {
      searchCaregivers: vi.fn().mockResolvedValue({
        items: [
          { id: CAREGIVER_ID, firstName: 'Elena', lastName: 'Cruz', role: 'RN', status: 'ACTIVE' },
          { id: 'cg-002', firstName: 'Marcus', lastName: 'Vance', role: 'LPN', status: 'ACTIVE' },
          { id: 'cg-003', firstName: 'Jordan', lastName: 'Reed', role: 'CNA', status: 'ACTIVE' },
        ],
        total: 3,
        page: 1,
        limit: 20,
        totalPages: 1,
      }),
      listCaregivers: vi.fn().mockResolvedValue({
        items: [
          { id: CAREGIVER_ID, firstName: 'Elena', lastName: 'Cruz', role: 'RN', status: 'ACTIVE' },
          { id: 'cg-002', firstName: 'Marcus', lastName: 'Vance', role: 'LPN', status: 'ACTIVE' },
          { id: 'cg-003', firstName: 'Jordan', lastName: 'Reed', role: 'CNA', status: 'ACTIVE' },
        ],
        total: 3,
      }),
      getCaregiverById: vi.fn().mockResolvedValue({
        id: CAREGIVER_ID,
        firstName: 'Elena',
        lastName: 'Cruz',
        role: 'RN',
        status: 'ACTIVE',
      }),
      getComplianceStatus: vi.fn().mockResolvedValue({ status: 'COMPLIANT' }),
    };
  }),
  CredentialExpirationService: vi.fn().mockImplementation(function () {
    return {
      canBeScheduled: vi.fn().mockResolvedValue(true),
    };
  }),
  ExclusionListService: vi.fn().mockImplementation(function () {
    return {
      checkSingleCaregiver: vi.fn().mockResolvedValue({ cleared: true }),
    };
  }),
}));

describe('FC-SCHED-001 Integration Test Suite', () => {
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
    const caregiverRouter = createCaregiverRouter(mockDb);

    app.use('/api/visits', visitRouter);
    app.use('/api/caregivers', caregiverRouter);

    app.use((err: any, _req: any, res: any, _next: any) => {
      res.status(err.status || 500).json({ success: false, error: err.message || 'Internal error' });
    });
  });

  // ==========================================================================
  // 1. Authentication & Security Headers (TC-002, TC-003, TC-004, UT-001..UT-007)
  // ==========================================================================
  describe('Authentication & Security Headers Validation', () => {
    it('TC-002: should reject requests missing Authorization Bearer header', async () => {
      const response = await request(app).get('/api/visits/calendar');
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Bearer token required');
    });

    it('TC-003 & TC-004: should accept requests with valid Bearer token and propagated headers', async () => {
      mockScheduleRepository.getVisitsByDateRange.mockResolvedValueOnce([]);

      const response = await request(app)
        .get('/api/visits/calendar')
        .query({ start_date: '2025-01-01', end_date: '2025-01-31' })
        .set('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock')
        .set('X-User-Id', 'user-admin-001')
        .set('X-Organization-Id', ORG_ID)
        .set('X-User-Roles', 'COORDINATOR,ADMIN');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('UT-006: should reject request when token is malformed', async () => {
      const response = await request(app)
        .get('/api/visits/calendar')
        .set('Authorization', 'InvalidTokenWithoutBearer');

      expect(response.status).toBe(401);
    });
  });

  // ==========================================================================
  // 2. Caregiver Selection & Active Status (TC-001, TC-007..TC-009)
  // ==========================================================================
  describe('Caregiver Dropdown & Selection Population (TC-001, TC-007..TC-009)', () => {
    it('TC-001 & TC-007: should populate active caregivers with at least 3 active profiles', async () => {
      const response = await request(app)
        .get('/api/caregivers')
        .query({ status: 'ACTIVE' })
        .set('Authorization', 'Bearer valid-token')
        .set('X-Organization-Id', ORG_ID);

      expect(response.status).toBe(200);
      const caregivers = response.body.items ?? response.body.data;
      expect(caregivers).toBeDefined();
      expect(caregivers.length).toBeGreaterThanOrEqual(3);
    });

    it('TC-008: should format caregiver names as FirstName LastName', async () => {
      const response = await request(app)
        .get('/api/caregivers')
        .query({ status: 'ACTIVE' })
        .set('Authorization', 'Bearer valid-token')
        .set('X-Organization-Id', ORG_ID);

      expect(response.status).toBe(200);
      const caregivers = response.body.items ?? response.body.data;
      for (const cg of caregivers) {
        expect(cg.firstName).toBeDefined();
        expect(cg.lastName).toBeDefined();
        const fullName = `${cg.firstName} ${cg.lastName}`;
        expect(fullName).toContain(' ');
        expect(fullName.split(' ').length).toBeGreaterThanOrEqual(2);
      }
    });

    it('TC-009: should only return caregivers with ACTIVE status', async () => {
      const response = await request(app)
        .get('/api/caregivers')
        .query({ status: 'ACTIVE' })
        .set('Authorization', 'Bearer valid-token')
        .set('X-Organization-Id', ORG_ID);

      expect(response.status).toBe(200);
      const caregivers = response.body.items ?? response.body.data;
      for (const cg of caregivers) {
        expect(cg.status).toBe('ACTIVE');
      }
    });
  });

  // ==========================================================================
  // 3. Scheduling CRUD & Calendar Views
  // ==========================================================================
  describe('Scheduling CRUD & Calendar Queries', () => {
    it('should query calendar visits within valid date range', async () => {
      const mockVisits = [
        {
          id: VISIT_ID,
          organizationId: ORG_ID,
          branchId: BRANCH_ID,
          scheduledDate: FIXED_NOW,
          scheduledStartTime: '09:00:00',
          scheduledEndTime: '11:00:00',
          status: 'SCHEDULED',
          clientId: CLIENT_ID,
          clientName: 'Margaret Thompson',
        },
      ];

      mockScheduleRepository.getVisitsByDateRange.mockResolvedValueOnce(mockVisits);

      const response = await request(app)
        .get('/api/visits/calendar')
        .query({
          start_date: '2025-01-01',
          end_date: '2025-01-31',
        })
        .set('Authorization', 'Bearer valid-token')
        .set('X-Organization-Id', ORG_ID);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].id).toBe(VISIT_ID);
    });

    it('should validate date range parameters (exceeding 60 days returns 400)', async () => {
      const response = await request(app)
        .get('/api/visits/calendar')
        .query({
          start_date: '2025-01-01',
          end_date: '2025-04-01',
        })
        .set('Authorization', 'Bearer valid-token')
        .set('X-Organization-Id', ORG_ID);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('cannot exceed 60 days');
    });

    it('should fetch caregiver personal visits via GET /my-visits', async () => {
      // 1. User email lookup
      vi.mocked(mockDb.query)
        .mockResolvedValueOnce({
          rows: [{ email: 'elena.cruz@folkcare.example' }],
        } as any)
        // 2. Caregiver record lookup
        .mockResolvedValueOnce({
          rows: [{ id: CAREGIVER_ID }],
        } as any);

      const caregiverVisits = [
        {
          id: VISIT_ID,
          scheduledDate: FIXED_NOW,
          scheduledStartTime: '09:00:00',
          scheduledEndTime: '11:00:00',
          status: 'SCHEDULED',
        },
      ];
      mockScheduleRepository.getVisitsByCaregiver.mockResolvedValueOnce(caregiverVisits);

      const response = await request(app)
        .get('/api/visits/my-visits')
        .query({
          start_date: '2025-01-10',
          end_date: '2025-01-20',
        })
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
    });
  });

  // ==========================================================================
  // 4. Conflict Detection & Reassignment (TC-014, TC-015)
  // ==========================================================================
  describe('Conflict Detection & Assignment (TC-014, TC-015)', () => {
    it('TC-014 & TC-015: should successfully assign caregiver to visit when no conflicts exist', async () => {
      // Visit exists
      vi.mocked(mockDb.query)
        .mockResolvedValueOnce({
          rows: [
            {
              id: VISIT_ID,
              organization_id: ORG_ID,
              branch_id: BRANCH_ID,
              scheduled_date: FIXED_DATE_STR,
              scheduled_start_time: '13:00:00',
              scheduled_end_time: '15:00:00',
              status: 'UNASSIGNED',
            },
          ],
        } as any)
        // Caregiver is active
        .mockResolvedValueOnce({
          rows: [
            {
              id: CAREGIVER_ID,
              organization_id: ORG_ID,
              first_name: 'Elena',
              last_name: 'Cruz',
              status: 'ACTIVE',
            },
          ],
        } as any)
        // Conflict check: no existing visits
        .mockResolvedValueOnce({
          rows: [],
        } as any)
        // Update visit assignment
        .mockResolvedValueOnce({
          rows: [
            {
              id: VISIT_ID,
              assigned_caregiver_id: CAREGIVER_ID,
              status: 'ASSIGNED',
              scheduled_date: FIXED_DATE_STR,
            },
          ],
        } as any);

      const response = await request(app)
        .put(`/api/visits/${VISIT_ID}/assign`)
        .set('Authorization', 'Bearer valid-token')
        .set('X-Organization-Id', ORG_ID)
        .send({
          caregiverId: CAREGIVER_ID,
          checkConflicts: true,
          checkCompliance: false,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.assigned_caregiver_id).toBe(CAREGIVER_ID);
      expect(response.body.data.status).toBe('ASSIGNED');
    });

    it('should detect schedule overlap conflict and return 409 Conflict', async () => {
      // Visit to assign
      vi.mocked(mockDb.query)
        .mockResolvedValueOnce({
          rows: [
            {
              id: VISIT_ID,
              organization_id: ORG_ID,
              branch_id: BRANCH_ID,
              scheduled_date: FIXED_DATE_STR,
              scheduled_start_time: '09:00:00',
              scheduled_end_time: '11:00:00',
              status: 'UNASSIGNED',
            },
          ],
        } as any)
        // Caregiver exists
        .mockResolvedValueOnce({
          rows: [
            {
              id: CONFLICT_CAREGIVER_ID,
              organization_id: ORG_ID,
              first_name: 'Marcus',
              last_name: 'Vance',
              status: 'ACTIVE',
            },
          ],
        } as any)
        // Conflict detected: overlapping visit
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'visit-existing-conflict',
              scheduled_start_time: '10:00:00',
              scheduled_end_time: '12:00:00',
              client_id: CLIENT_ID,
            },
          ],
        } as any);

      const response = await request(app)
        .put(`/api/visits/${VISIT_ID}/assign`)
        .set('Authorization', 'Bearer valid-token')
        .set('X-Organization-Id', ORG_ID)
        .send({
          caregiverId: CONFLICT_CAREGIVER_ID,
          checkConflicts: true,
          checkCompliance: false,
        });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('conflict');
      expect(response.body.conflicts).toHaveLength(1);
    });

    it('should check conflicts via POST /:id/check-conflicts endpoint', async () => {
      // Visit check
      vi.mocked(mockDb.query)
        .mockResolvedValueOnce({
          rows: [
            {
              id: VISIT_ID,
              organization_id: ORG_ID,
              scheduled_date: FIXED_DATE_STR,
              scheduled_start_time: '09:00:00',
              scheduled_end_time: '11:00:00',
            },
          ],
        } as any)
        // Conflicting visits query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'visit-conflict-1',
              scheduled_start_time: '09:30:00',
              scheduled_end_time: '10:30:00',
              status: 'SCHEDULED',
              client_first_name: 'Robert',
              client_last_name: 'Johnson',
            },
          ],
        } as any);

      const response = await request(app)
        .post(`/api/visits/${VISIT_ID}/check-conflicts`)
        .set('Authorization', 'Bearer valid-token')
        .set('X-Organization-Id', ORG_ID)
        .send({
          caregiverId: CONFLICT_CAREGIVER_ID,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.hasConflicts).toBe(true);
      expect(response.body.conflicts).toHaveLength(1);
    });
  });

  // ==========================================================================
  // 5. Caregiver Availability Checks
  // ==========================================================================
  describe('Caregiver Availability Checks', () => {
    it('should return availability schedule for a date via GET /caregivers/availability', async () => {
      const mockAvailabilityRows = [
        {
          caregiver_id: CAREGIVER_ID,
          first_name: 'Elena',
          last_name: 'Cruz',
          caregiver_status: 'ACTIVE',
          visits: [
            {
              id: VISIT_ID,
              scheduled_start_time: '09:00:00',
              scheduled_end_time: '11:00:00',
              status: 'SCHEDULED',
              client_name: 'Margaret Thompson',
            },
          ],
        },
      ];

      vi.mocked(mockDb.query).mockResolvedValueOnce({
        rows: mockAvailabilityRows,
      } as any);

      const response = await request(app)
        .get('/api/visits/caregivers/availability')
        .query({ date: FIXED_DATE_STR })
        .set('Authorization', 'Bearer valid-token')
        .set('X-Organization-Id', ORG_ID);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].caregiver_id).toBe(CAREGIVER_ID);
    });

    it('should validate assignment eligibility via POST /:id/check-assignment', async () => {
      // Visit check
      vi.mocked(mockDb.query)
        .mockResolvedValueOnce({
          rows: [
            {
              id: VISIT_ID,
              organization_id: ORG_ID,
              scheduled_date: FIXED_DATE_STR,
              scheduled_start_time: '14:00:00',
              scheduled_end_time: '16:00:00',
            },
          ],
        } as any)
        // Caregiver check
        .mockResolvedValueOnce({
          rows: [
            {
              id: CAREGIVER_ID,
              first_name: 'Elena',
              last_name: 'Cruz',
              status: 'ACTIVE',
            },
          ],
        } as any)
        // No conflicts
        .mockResolvedValueOnce({
          rows: [],
        } as any);

      const response = await request(app)
        .post(`/api/visits/${VISIT_ID}/check-assignment`)
        .set('Authorization', 'Bearer valid-token')
        .set('X-Organization-Id', ORG_ID)
        .send({
          caregiverId: CAREGIVER_ID,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.canAssign).toBe(true);
      expect(response.body.data.complianceStatus.isCompliant).toBe(true);
      expect(response.body.data.schedulingStatus.hasConflicts).toBe(false);
    });
  });

  // ==========================================================================
  // 6. Visit Status Transitions & Lifecycle
  // ==========================================================================
  describe('Visit Status Transitions & Lifecycle Management', () => {
    it('should transition visit status from UNASSIGNED to ASSIGNED upon assignment', async () => {
      vi.mocked(mockDb.query)
        .mockResolvedValueOnce({
          rows: [
            {
              id: VISIT_ID,
              organization_id: ORG_ID,
              branch_id: BRANCH_ID,
              scheduled_date: FIXED_DATE_STR,
              scheduled_start_time: '10:00:00',
              scheduled_end_time: '12:00:00',
              status: 'UNASSIGNED',
            },
          ],
        } as any)
        .mockResolvedValueOnce({
          rows: [{ id: CAREGIVER_ID, organization_id: ORG_ID, first_name: 'Elena', last_name: 'Cruz', status: 'ACTIVE' }],
        } as any)
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({
          rows: [
            {
              id: VISIT_ID,
              assigned_caregiver_id: CAREGIVER_ID,
              status: 'ASSIGNED',
            },
          ],
        } as any);

      const response = await request(app)
        .put(`/api/visits/${VISIT_ID}/assign`)
        .set('Authorization', 'Bearer valid-token')
        .set('X-Organization-Id', ORG_ID)
        .send({
          caregiverId: CAREGIVER_ID,
          checkConflicts: true,
          checkCompliance: false,
        });

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('ASSIGNED');
    });

    it('should validate status transitions using ScheduleService domain rules', async () => {
      const scheduleRepoMock = {
        getVisitById: vi.fn().mockResolvedValue({
          id: VISIT_ID,
          organizationId: ORG_ID,
          branchId: BRANCH_ID,
          clientId: CLIENT_ID,
          status: 'UNASSIGNED',
          scheduledDate: FIXED_NOW,
          scheduledStartTime: '09:00:00',
          scheduledEndTime: '10:00:00',
          timezone: 'America/Chicago',
          createdAt: FIXED_NOW,
          updatedAt: FIXED_NOW,
        }),
        updateVisitStatus: vi.fn().mockResolvedValue({
          id: VISIT_ID,
          status: 'CANCELLED',
          scheduledDate: FIXED_NOW,
          scheduledStartTime: '09:00:00',
        }),
      };

      const service = new ScheduleService(scheduleRepoMock as any);
      const userContext = {
        userId: 'admin-001',
        organizationId: ORG_ID,
        branchIds: [BRANCH_ID],
        roles: ['ADMIN'],
        permissions: ['visits:update'],
      };

      // Valid: UNASSIGNED -> CANCELLED with reason
      const cancelledVisit = await service.updateVisitStatus(
        {
          visitId: VISIT_ID,
          newStatus: 'CANCELLED',
          reason: 'Client requested reschedule',
        },
        userContext
      );
      expect(cancelledVisit.status).toBe('CANCELLED');

      // Invalid: cannot complete an unassigned visit (must be in progress)
      await expect(
        service.completeVisit(
          {
            visitId: VISIT_ID,
            completionNotes: 'Done',
          } as any,
          userContext
        )
      ).rejects.toThrow();
    });
  });
});
