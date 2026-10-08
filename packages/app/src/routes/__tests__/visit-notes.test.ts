/**
 * Visit Notes Routes Tests
 *
 * Validates POST /api/visit-notes/autofill-suggestions
 * - Validates required fields (visitId)
 * - Fetches context from database and connects to @folkcare/ai-services
 * - Returns structured autofill suggestions (suggestedActivities, commonPhrases, noteStarter, etc.)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type { Database } from '@folkcare/core';
import { createVisitNotesRouter } from '../visit-notes.js';

vi.mock('@folkcare/core', async () => {
  const actual = await vi.importActual<typeof import('@folkcare/core')>('@folkcare/core');
  return {
    ...actual,
    AuthMiddleware: vi.fn().mockImplementation(function () {
      return {
        requireAuth: (req: any, _res: any, next: any) => {
          req.user = {
            userId: 'user-1',
            email: 'caregiver@example.com',
            organizationId: '33333333-3333-3333-3333-333333333333',
            branchIds: [],
            tokenVersion: 1,
            roles: ['CAREGIVER'],
            permissions: ['visits:read', 'visits:write'],
          };
          next();
        },
      };
    }),
  };
});

describe('Visit Notes Routes - POST /api/visit-notes/autofill-suggestions', () => {
  let app: express.Express;
  let mockDb: Partial<Database>;

  beforeEach(() => {
    mockDb = {
      query: vi.fn().mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('FROM visits v')) {
          return Promise.resolve({
            rows: [
              {
                id: '11111111-1111-1111-1111-111111111111',
                client_id: '22222222-2222-2222-2222-222222222222',
                assigned_caregiver_id: '33333333-3333-3333-3333-333333333333',
                scheduled_date: '2026-10-15',
                scheduled_start_time: '09:00',
                scheduled_end_time: '11:00',
                service_type_name: 'Skilled Nursing',
                client_first_name: 'Eleanor',
                client_last_name: 'Vance',
                caregiver_first_name: 'Sarah',
                caregiver_last_name: 'Jenkins',
              },
            ],
          });
        }

        if (typeof sql === 'string' && sql.includes('FROM visit_notes vn')) {
          return Promise.resolve({
            rows: [
              {
                id: '44444444-4444-4444-4444-444444444444',
                note_text: 'Administered morning insulin. Checked blood glucose levels.',
                note_type: 'VISIT_NOTE',
                activities_performed: ['Vital signs monitored', 'Insulin injection administered', 'Blood glucose check'],
                client_mood: 'Pleasant & alert',
                client_condition_notes: 'Alert and oriented x4',
                created_at: '2026-10-10T10:00:00.000Z',
                service_type_name: 'Skilled Nursing',
              },
              {
                id: '55555555-5555-5555-5555-555555555555',
                note_text: 'Dressing change on lower left leg wound. Healing well.',
                note_type: 'VISIT_NOTE',
                activities_performed: ['Wound dressing changed', 'Vital signs monitored'],
                client_mood: 'Pleasant & alert',
                client_condition_notes: 'Wound clean and dry',
                created_at: '2026-10-08T10:00:00.000Z',
                service_type_name: 'Skilled Nursing',
              },
            ],
          });
        }

        return Promise.resolve({ rows: [] });
      }),
    };

    app = express();
    app.use(express.json());
    app.use('/api/visit-notes', createVisitNotesRouter(mockDb as Database));
  });

  it('rejects requests missing visitId with 400', async () => {
    const res = await request(app)
      .post('/api/visit-notes/autofill-suggestions')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Validation error');
  });

  it('generates suggestions for a valid visitId with historical notes', async () => {
    const res = await request(app)
      .post('/api/visit-notes/autofill-suggestions')
      .send({
        visitId: '11111111-1111-1111-1111-111111111111',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();

    const data = res.body.data;
    expect(Array.isArray(data.suggestedActivities)).toBe(true);
    expect(data.suggestedActivities.length).toBeGreaterThan(0);
    // Should include top aggregated activities from past notes
    expect(data.suggestedActivities).toContain('Vital signs monitored');

    expect(data.suggestedMood).toBe('Pleasant & alert');
    expect(Array.isArray(data.commonPhrases)).toBe(true);
    expect(data.commonPhrases.length).toBeGreaterThan(0);

    expect(typeof data.noteStarter).toBe('string');
    expect(data.noteStarter).toContain('Eleanor Vance');

    expect(data.analyzedNotesCount).toBe(2);
    expect(data.dateRange).toBeDefined();
    expect(data.dateRange.from).toBe('2026-10-08T10:00:00.000Z');
    expect(data.dateRange.to).toBe('2026-10-10T10:00:00.000Z');
    expect(data.generatedAt).toBeDefined();
  });

  it('handles visits with no previous notes gracefully', async () => {
    mockDb.query = vi.fn().mockImplementation((sql: string) => {
      if (typeof sql === 'string' && sql.includes('FROM visits v')) {
        return Promise.resolve({
          rows: [
            {
              id: '99999999-9999-9999-9999-999999999999',
              client_id: '88888888-8888-8888-8888-888888888888',
              assigned_caregiver_id: null,
              scheduled_date: '2026-10-20',
              scheduled_start_time: '14:00',
              scheduled_end_time: '16:00',
              service_type_name: 'Personal Care',
              client_first_name: 'Arthur',
              client_last_name: 'Dent',
              caregiver_first_name: null,
              caregiver_last_name: null,
            },
          ],
        });
      }
      return Promise.resolve({ rows: [] });
    });

    const res = await request(app)
      .post('/api/visit-notes/autofill-suggestions')
      .send({
        visitId: '99999999-9999-9999-9999-999999999999',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();

    const data = res.body.data;
    expect(data.analyzedNotesCount).toBe(0);
    expect(Array.isArray(data.suggestedActivities)).toBe(true);
    expect(data.suggestedActivities.length).toBeGreaterThan(0);
    expect(typeof data.noteStarter).toBe('string');
    expect(data.noteStarter).toContain('Arthur Dent');
  });
});
