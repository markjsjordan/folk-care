/* eslint-disable @typescript-eslint/no-misused-promises */
/**
 * Unit Tests for RecurringVisitPatternEngine
 *
 * Deterministic tests with fixed timestamps verifying:
 * - Rolling horizon concrete visit generation
 * - US Federal Holiday handling
 * - Caregiver time-off exceptions (visit preserved for client, marked UNASSIGNED)
 * - Client hospital holds (suppressed visits per 42 CFR § 484)
 * - Multi-tenant isolation enforcement
 * - Update instances (THIS_VISIT vs ALL_FUTURE)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Pool } from 'pg';
import type { UserContext, UUID } from '@folkcare/core';
import { RecurringVisitPatternEngine } from '../pattern-generator-service.js';
import type { VisitPattern } from '../../types/visit-pattern.js';

const FIXED_DATE_STR = '2026-10-01'; // Thursday
const FIXED_BASE_DATE = new Date('2026-10-01T00:00:00.000Z');

const TEST_IDS = {
  org: '10000000-0000-4000-8000-000000000001' as UUID,
  otherOrg: '20000000-0000-4000-8000-000000000002' as UUID,
  branch: '10000000-0000-4000-8000-000000000003' as UUID,
  user: '10000000-0000-4000-8000-000000000004' as UUID,
  client: '10000000-0000-4000-8000-000000000005' as UUID,
  caregiver: '10000000-0000-4000-8000-000000000006' as UUID,
  serviceType: '10000000-0000-4000-8000-000000000007' as UUID,
  pattern: '10000000-0000-4000-8000-000000000010' as UUID,
  visit1: '10000000-0000-4000-8000-000000000021' as UUID,
  visit2: '10000000-0000-4000-8000-000000000022' as UUID,
};

const testContext: UserContext = {
  userId: TEST_IDS.user,
  organizationId: TEST_IDS.org,
  branchIds: [TEST_IDS.branch],
  roles: ['COORDINATOR'],
  permissions: ['visits:create', 'visits:read', 'visits:update'],
};

describe('RecurringVisitPatternEngine', () => {
  let mockPool: Pool;
  let mockQuery: ReturnType<typeof vi.fn>;
  let engine: RecurringVisitPatternEngine;

  beforeEach(() => {
    mockQuery = vi.fn();
    mockPool = {
      query: mockQuery,
    } as unknown as Pool;
    engine = new RecurringVisitPatternEngine(mockPool);
  });

  describe('Rolling Horizon Visit Generation', () => {
    it('generates concrete visits for Mon/Wed/Fri over a 14-day horizon', async () => {
      // Mock pattern insert
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: TEST_IDS.pattern,
            organization_id: TEST_IDS.org,
            branch_id: TEST_IDS.branch,
            client_id: TEST_IDS.client,
            caregiver_id: TEST_IDS.caregiver,
            service_type_id: TEST_IDS.serviceType,
            service_type_name: 'Personal Care',
            frequency: 'WEEKLY',
            rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR',
            start_date: FIXED_DATE_STR,
            end_date: null,
            day_of_week: JSON.stringify(['MONDAY', 'WEDNESDAY', 'FRIDAY']),
            start_time: '09:00',
            duration: 240,
            status: 'ACTIVE',
            skip_holidays: true,
            created_at: FIXED_BASE_DATE,
            created_by: TEST_IDS.user,
            updated_at: FIXED_BASE_DATE,
            updated_by: TEST_IDS.user,
          },
        ],
      });

      // Mock visit inserts
      mockQuery.mockImplementation((query: string, values: any[]) => {
        if (query.includes('INSERT INTO visits')) {
          return Promise.resolve({
            rows: [
              {
                id: `visit-${values[7]}`,
                organization_id: values[0],
                branch_id: values[1],
                client_id: values[2],
                pattern_id: values[3],
                visit_number: values[4],
                service_type_id: values[5],
                service_type_name: values[6],
                scheduled_date: values[7],
                scheduled_start_time: values[8],
                scheduled_end_time: values[9],
                scheduled_duration: values[10],
                assigned_caregiver_id: values[11],
                status: values[12],
                address: values[13],
                created_at: FIXED_BASE_DATE,
                created_by: TEST_IDS.user,
                updated_at: FIXED_BASE_DATE,
                updated_by: TEST_IDS.user,
                version: 1,
              },
            ],
          });
        }
        return Promise.resolve({ rows: [] });
      });

      const result = await engine.createPatternAndGenerateVisits(
        {
          organizationId: TEST_IDS.org,
          clientId: TEST_IDS.client,
          caregiverId: TEST_IDS.caregiver,
          serviceTypeId: TEST_IDS.serviceType,
          serviceTypeName: 'Personal Care',
          frequency: 'WEEKLY',
          dayOfWeek: ['MONDAY', 'WEDNESDAY', 'FRIDAY'],
          startDate: FIXED_DATE_STR,
          startTime: '09:00',
          duration: 240,
          horizonDays: 14,
          skipHolidays: false, // test pure recurrence first
        },
        testContext,
        { referenceDate: FIXED_BASE_DATE }
      );

      // October 2026:
      // Oct 1 (Thu), Oct 2 (Fri) -> 1
      // Week 2: Oct 5 (Mon), Oct 7 (Wed), Oct 9 (Fri) -> 3
      // Week 3: Oct 12 (Mon), Oct 14 (Wed) -> 2
      // Total 6 visits in 14 days
      expect(result.generatedVisitsCount).toBe(6);
      expect(result.visits.length).toBe(6);
      expect(result.visits[0]!.scheduledStartTime).toBe('09:00');
      expect(result.visits[0]!.scheduledEndTime).toBe('13:00'); // 9am + 240 min = 1pm
      expect(result.visits[0]!.assignedCaregiverId).toBe(TEST_IDS.caregiver);
      expect(result.visits[0]!.status).toBe('ASSIGNED');
    });

    it('respects pattern end_date when earlier than horizon', async () => {
      const pattern: VisitPattern = {
        id: TEST_IDS.pattern,
        organizationId: TEST_IDS.org,
        clientId: TEST_IDS.client,
        serviceTypeId: TEST_IDS.serviceType,
        frequency: 'DAILY',
        dayOfWeek: [],
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        endDate: new Date('2026-10-05T00:00:00.000Z'),
        startTime: '10:00',
        duration: 60,
        status: 'ACTIVE',
        skipHolidays: false,
        createdAt: FIXED_BASE_DATE,
        createdBy: TEST_IDS.user,
        updatedAt: FIXED_BASE_DATE,
        updatedBy: TEST_IDS.user,
        version: 1,
        deletedAt: null,
        deletedBy: null,
      };

      mockQuery.mockImplementation((_query: string, values: any[]) => {
        return Promise.resolve({
          rows: [
            {
              id: `v-${values[7]}`,
              organization_id: TEST_IDS.org,
              client_id: TEST_IDS.client,
              pattern_id: TEST_IDS.pattern,
              visit_number: values[4],
              scheduled_date: values[7],
              scheduled_start_time: '10:00',
              scheduled_end_time: '11:00',
              scheduled_duration: 60,
              status: 'UNASSIGNED',
              created_at: FIXED_BASE_DATE,
              created_by: TEST_IDS.user,
              updated_at: FIXED_BASE_DATE,
              updated_by: TEST_IDS.user,
              version: 1,
            },
          ],
        });
      });

      const { visits } = await engine.generateConcreteVisits(
        pattern,
        { horizonDays: 60, referenceDate: FIXED_BASE_DATE, skipHolidays: false },
        testContext
      );

      // Oct 1, Oct 2, Oct 3, Oct 4, Oct 5 = 5 days total
      expect(visits.length).toBe(5);
    });
  });

  describe('US Federal Holiday Exception Handling', () => {
    it('skips visits that fall on US Federal Holidays when skipHolidays is true', async () => {
      // Veterans Day 2026 is Wednesday, November 11, 2026
      const startDate = new Date('2026-11-09T00:00:00.000Z'); // Monday
      const endDate = new Date('2026-11-13T00:00:00.000Z'); // Friday

      const pattern: VisitPattern = {
        id: TEST_IDS.pattern,
        organizationId: TEST_IDS.org,
        clientId: TEST_IDS.client,
        serviceTypeId: TEST_IDS.serviceType,
        frequency: 'WEEKLY',
        dayOfWeek: ['MONDAY', 'WEDNESDAY', 'FRIDAY'],
        startDate,
        endDate,
        startTime: '09:00',
        duration: 120,
        status: 'ACTIVE',
        skipHolidays: true,
        createdAt: FIXED_BASE_DATE,
        createdBy: TEST_IDS.user,
        updatedAt: FIXED_BASE_DATE,
        updatedBy: TEST_IDS.user,
        version: 1,
        deletedAt: null,
        deletedBy: null,
      };

      mockQuery.mockImplementation((_q: string, values: any[]) => {
        return Promise.resolve({
          rows: [
            {
              id: `v-${values[7]}`,
              organization_id: TEST_IDS.org,
              client_id: TEST_IDS.client,
              pattern_id: TEST_IDS.pattern,
              visit_number: values[4],
              scheduled_date: values[7],
              scheduled_start_time: '09:00',
              scheduled_end_time: '11:00',
              scheduled_duration: 120,
              status: 'UNASSIGNED',
              created_at: FIXED_BASE_DATE,
              created_by: TEST_IDS.user,
              updated_at: FIXED_BASE_DATE,
              updated_by: TEST_IDS.user,
              version: 1,
            },
          ],
        });
      });

      const result = await engine.generateConcreteVisits(
        pattern,
        { horizonDays: 10, referenceDate: startDate, skipHolidays: true },
        testContext
      );

      // Normally Mon, Wed, Fri would be 3 visits.
      // Wed Nov 11 is Veterans Day -> skipped!
      expect(result.visits.length).toBe(2);
      expect(result.exceptions.length).toBe(1);
      expect(result.exceptions[0]!.type).toBe('HOLIDAY');
      expect(result.exceptions[0]!.date).toBe('2026-11-11');
    });
  });

  describe('Caregiver Time-Off Exception Handling', () => {
    it('preserves client care but marks visit as UNASSIGNED with notice when caregiver is on PTO', async () => {
      const pattern: VisitPattern = {
        id: TEST_IDS.pattern,
        organizationId: TEST_IDS.org,
        clientId: TEST_IDS.client,
        caregiverId: TEST_IDS.caregiver,
        serviceTypeId: TEST_IDS.serviceType,
        frequency: 'DAILY',
        dayOfWeek: [],
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        endDate: new Date('2026-10-03T00:00:00.000Z'),
        startTime: '09:00',
        duration: 120,
        status: 'ACTIVE',
        skipHolidays: false,
        createdAt: FIXED_BASE_DATE,
        createdBy: TEST_IDS.user,
        updatedAt: FIXED_BASE_DATE,
        updatedBy: TEST_IDS.user,
        version: 1,
        deletedAt: null,
        deletedBy: null,
      };

      const capturedRows: any[] = [];
      mockQuery.mockImplementation((_q: string, values: any[]) => {
        const row = {
          id: `v-${values[7]}`,
          organization_id: TEST_IDS.org,
          client_id: TEST_IDS.client,
          scheduled_date: values[7],
          assigned_caregiver_id: values[11],
          status: values[12],
          internal_notes: values[16],
          created_at: FIXED_BASE_DATE,
          created_by: TEST_IDS.user,
          updated_at: FIXED_BASE_DATE,
          updated_by: TEST_IDS.user,
          version: 1,
        };
        capturedRows.push(row);
        return Promise.resolve({ rows: [row] });
      });

      // Caregiver takes PTO on Oct 2
      const result = await engine.generateConcreteVisits(
        pattern,
        {
          horizonDays: 5,
          referenceDate: FIXED_BASE_DATE,
          skipHolidays: false,
          caregiverTimeOffExceptions: [
            {
              caregiverId: TEST_IDS.caregiver,
              startDate: '2026-10-02',
              endDate: '2026-10-02',
              reason: 'Medical Leave',
            },
          ],
        },
        testContext
      );

      // All 3 visits are created so patient care is never dropped
      expect(result.visits.length).toBe(3);

      // Oct 1: Assigned to caregiver
      expect(capturedRows[0].assigned_caregiver_id).toBe(TEST_IDS.caregiver);
      expect(capturedRows[0].status).toBe('ASSIGNED');

      // Oct 2: Unassigned due to PTO
      expect(capturedRows[1].assigned_caregiver_id).toBeNull();
      expect(capturedRows[1].status).toBe('UNASSIGNED');
      expect(capturedRows[1].internal_notes).toContain('Caregiver on approved time-off');

      // Oct 3: Assigned to caregiver
      expect(capturedRows[2].assigned_caregiver_id).toBe(TEST_IDS.caregiver);
      expect(capturedRows[2].status).toBe('ASSIGNED');

      expect(result.exceptions).toHaveLength(1);
      expect(result.exceptions[0]!.type).toBe('CAREGIVER_TIME_OFF');
      expect(result.exceptions[0]!.date).toBe('2026-10-02');
    });
  });

  describe('Client Hospital Hold Exception Handling', () => {
    it('suppresses home visit generation during inpatient hospital stay per 42 CFR § 484', async () => {
      const pattern: VisitPattern = {
        id: TEST_IDS.pattern,
        organizationId: TEST_IDS.org,
        clientId: TEST_IDS.client,
        serviceTypeId: TEST_IDS.serviceType,
        frequency: 'DAILY',
        dayOfWeek: [],
        startDate: new Date('2026-10-01T00:00:00.000Z'),
        endDate: new Date('2026-10-04T00:00:00.000Z'),
        startTime: '09:00',
        duration: 120,
        status: 'ACTIVE',
        skipHolidays: false,
        createdAt: FIXED_BASE_DATE,
        createdBy: TEST_IDS.user,
        updatedAt: FIXED_BASE_DATE,
        updatedBy: TEST_IDS.user,
        version: 1,
        deletedAt: null,
        deletedBy: null,
      };

      mockQuery.mockImplementation((_q: string, values: any[]) => {
        return Promise.resolve({
          rows: [
            {
              id: `v-${values[7]}`,
              organization_id: TEST_IDS.org,
              client_id: TEST_IDS.client,
              scheduled_date: values[7],
              status: 'UNASSIGNED',
              created_at: FIXED_BASE_DATE,
              created_by: TEST_IDS.user,
              updated_at: FIXED_BASE_DATE,
              updated_by: TEST_IDS.user,
              version: 1,
            },
          ],
        });
      });

      // Hospital hold on Oct 2 and Oct 3
      const result = await engine.generateConcreteVisits(
        pattern,
        {
          horizonDays: 5,
          referenceDate: FIXED_BASE_DATE,
          skipHolidays: false,
          clientHospitalHolds: [
            {
              clientId: TEST_IDS.client,
              startDate: '2026-10-02',
              endDate: '2026-10-03',
              reason: 'Inpatient admission at Austin Regional',
            },
          ],
        },
        testContext
      );

      // Only Oct 1 and Oct 4 should be generated (2 visits out of 4 days)
      expect(result.visits.length).toBe(2);
      expect(result.exceptions.length).toBe(2);
      expect(result.exceptions[0]!.type).toBe('HOSPITAL_HOLD');
      expect(result.exceptions[0]!.date).toBe('2026-10-02');
      expect(result.exceptions[1]!.type).toBe('HOSPITAL_HOLD');
      expect(result.exceptions[1]!.date).toBe('2026-10-03');
    });
  });

  describe('Multi-Tenant Isolation', () => {
    it('prevents cross-tenant access when fetching pattern by id', async () => {
      // Mock returns null because organization_id in WHERE clause does not match
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await expect(
        engine.getPatternWithVisits(TEST_IDS.pattern, TEST_IDS.otherOrg)
      ).rejects.toThrow('Visit pattern not found or access denied');

      // Verify that query includes organization_id
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('organization_id = $2'),
        [TEST_IDS.pattern, TEST_IDS.otherOrg]
      );
    });

    it('scopes update operations strictly to the authenticated organization', async () => {
      // Pattern exists for org
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: TEST_IDS.pattern,
            organization_id: TEST_IDS.org,
            client_id: TEST_IDS.client,
            frequency: 'WEEKLY',
            start_date: FIXED_DATE_STR,
            day_of_week: '[]',
            start_time: '09:00',
            duration: 120,
            status: 'ACTIVE',
            created_at: FIXED_BASE_DATE,
            created_by: TEST_IDS.user,
            updated_at: FIXED_BASE_DATE,
            updated_by: TEST_IDS.user,
          },
        ],
      });

      // Update pattern record
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: TEST_IDS.pattern,
            organization_id: TEST_IDS.org,
            client_id: TEST_IDS.client,
            frequency: 'WEEKLY',
            start_date: FIXED_DATE_STR,
            day_of_week: '[]',
            start_time: '10:00',
            duration: 120,
            status: 'ACTIVE',
            created_at: FIXED_BASE_DATE,
            created_by: TEST_IDS.user,
            updated_at: FIXED_BASE_DATE,
            updated_by: TEST_IDS.user,
          },
        ],
      });

      // Update future visits query
      mockQuery.mockResolvedValueOnce({ rowCount: 8 });

      const result = await engine.updatePatternInstances(
        TEST_IDS.pattern,
        {
          updateMode: 'ALL_FUTURE',
          updates: { startTime: '10:00' },
        },
        testContext
      );

      expect(result.mode).toBe('ALL_FUTURE');
      expect(result.updatedVisitsCount).toBe(8);

      // Verify organization_id is in both pattern and visits update queries
      const updateVisitsCall = mockQuery.mock.calls.find(call =>
        typeof call[0] === 'string' && call[0].includes('UPDATE visits')
      );
      expect(updateVisitsCall).toBeDefined();
      expect(updateVisitsCall![0]).toContain('organization_id = $2');
      expect(updateVisitsCall![1][1]).toBe(TEST_IDS.org);
    });
  });

  describe('Update Modes (THIS_VISIT vs ALL_FUTURE)', () => {
    it('updates only the single visit when updateMode is THIS_VISIT', async () => {
      // Pattern exists
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: TEST_IDS.pattern,
            organization_id: TEST_IDS.org,
            client_id: TEST_IDS.client,
            frequency: 'WEEKLY',
            start_date: FIXED_DATE_STR,
            day_of_week: '[]',
            start_time: '09:00',
            duration: 120,
            status: 'ACTIVE',
            created_at: FIXED_BASE_DATE,
            created_by: TEST_IDS.user,
            updated_at: FIXED_BASE_DATE,
            updated_by: TEST_IDS.user,
          },
        ],
      });

      // Single visit update
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: TEST_IDS.visit1,
            organization_id: TEST_IDS.org,
            pattern_id: TEST_IDS.pattern,
            client_id: TEST_IDS.client,
            scheduled_date: '2026-10-05',
            scheduled_start_time: '14:00',
            scheduled_end_time: '16:00',
            scheduled_duration: 120,
            status: 'UNASSIGNED',
            created_at: FIXED_BASE_DATE,
            created_by: TEST_IDS.user,
            updated_at: FIXED_BASE_DATE,
            updated_by: TEST_IDS.user,
            version: 2,
          },
        ],
      });

      const result = await engine.updatePatternInstances(
        TEST_IDS.pattern,
        {
          updateMode: 'THIS_VISIT',
          targetVisitId: TEST_IDS.visit1,
          updates: { startTime: '14:00', duration: 120 },
        },
        testContext
      );

      expect(result.mode).toBe('THIS_VISIT');
      expect(result.updatedVisitsCount).toBe(1);
      expect(result.singleVisit?.id).toBe(TEST_IDS.visit1);
      expect(result.singleVisit?.scheduledStartTime).toBe('14:00');

      // Verify NO UPDATE on visit_patterns table was executed
      const patternUpdateCalls = mockQuery.mock.calls.filter(call =>
        typeof call[0] === 'string' && call[0].includes('UPDATE visit_patterns')
      );
      expect(patternUpdateCalls.length).toBe(0);
    });
  });
});
