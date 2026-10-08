/**
 * Visit Notes API Routes
 *
 * Express routes for visit notes, AI autofill suggestions, and note documentation.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthMiddleware, type Database } from '@folkcare/core';
import { NoteSummarizationService } from '@folkcare/ai-services';
import type { NoteContextRecord } from '@folkcare/ai-services';

// Validation schema for autofill request
const autofillRequestSchema = z.object({
  visitId: z.string().min(1, 'visitId is required'),
  clientId: z.string().uuid().optional(),
  caregiverId: z.string().uuid().optional(),
});

interface VisitRow {
  id: string;
  client_id: string;
  assigned_caregiver_id: string | null;
  scheduled_date: Date | string;
  scheduled_start_time: string;
  scheduled_end_time: string;
  service_type_name: string | null;
  client_first_name: string | null;
  client_last_name: string | null;
  caregiver_first_name: string | null;
  caregiver_last_name: string | null;
}

interface VisitNoteRow {
  id: string;
  note_text: string | null;
  note_type: string | null;
  activities_performed: string[] | null;
  client_mood: string | null;
  client_condition_notes: string | null;
  created_at: Date | string;
  service_type_name: string | null;
}

/**
 * Create visit notes router
 */
export function createVisitNotesRouter(db: Database): Router {
  const router = Router();
  const authMiddleware = new AuthMiddleware(db);
  router.use(authMiddleware.requireAuth);

  const aiService = new NoteSummarizationService({
    anthropicApiKey: process.env['ANTHROPIC_API_KEY'] ?? '',
    defaultModel: 'claude-sonnet-4',
    maxTokens: 2048,
    temperature: 0.3,
    enableCaching: true,
    cacheTTLSeconds: 3600,
  });

  /**
   * POST /api/visit-notes/autofill-suggestions
   * Generates AI suggestions for visit notes based on historical notes and visit context
   */
  router.post('/autofill-suggestions', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsedBody = autofillRequestSchema.parse(req.body);
      const { visitId, clientId: explicitClientId, caregiverId: explicitCaregiverId } = parsedBody;

      let effectiveClientId = explicitClientId;
      let effectiveCaregiverId = explicitCaregiverId;

      // 1. Fetch visit details if possible
      const visitDetails = await fetchVisitAutofillContext(db, visitId);
      effectiveClientId ??= visitDetails.clientId;
      effectiveCaregiverId ??= visitDetails.caregiverId;
      const { serviceTypeName, clientName, caregiverName, scheduledDate } = visitDetails;

      // 2. Query previous notes for this client / caregiver
      const previousNotes = await fetchPreviousNotes(db, effectiveClientId, effectiveCaregiverId);

      // 3. Generate suggestions using NoteSummarizationService from @folkcare/ai-services
      const suggestions = await aiService.generateAutofillSuggestions({
        visitId,
        clientId: effectiveClientId,
        caregiverId: effectiveCaregiverId,
        serviceTypeName,
        clientName,
        caregiverName,
        scheduledDate,
        previousNotes,
      });

      res.json({
        success: true,
        data: suggestions,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation error',
          details: error.issues,
        });
        return;
      }
      next(error);
    }
  });

  return router;
}

interface VisitAutofillContext {
  clientId?: string;
  caregiverId?: string;
  serviceTypeName?: string;
  clientName?: string;
  caregiverName?: string;
  scheduledDate?: string;
}

async function fetchVisitAutofillContext(db: Database, visitId: string): Promise<VisitAutofillContext> {
  const result: VisitAutofillContext = {};
  try {
    const visitResult = await db.query(
      `SELECT
         v.id,
         v.client_id,
         v.assigned_caregiver_id,
         v.scheduled_date,
         v.scheduled_start_time,
         v.scheduled_end_time,
         v.service_type_name,
         c.first_name as client_first_name,
         c.last_name as client_last_name,
         cg.first_name as caregiver_first_name,
         cg.last_name as caregiver_last_name
       FROM visits v
       LEFT JOIN clients c ON v.client_id = c.id
       LEFT JOIN caregivers cg ON v.assigned_caregiver_id = cg.id
       WHERE v.id = $1 AND v.deleted_at IS NULL`,
      [visitId]
    );

    if (visitResult.rows.length > 0) {
      const visit = visitResult.rows[0] as unknown as VisitRow;
      result.clientId = visit.client_id;
      if (visit.assigned_caregiver_id !== null) {
        result.caregiverId = visit.assigned_caregiver_id;
      }
      if (visit.service_type_name !== null && visit.service_type_name !== '') {
        result.serviceTypeName = visit.service_type_name;
      }
      const cFirst = visit.client_first_name ?? '';
      const cLast = visit.client_last_name ?? '';
      const combinedClient = `${cFirst} ${cLast}`.trim();
      if (combinedClient !== '') {
        result.clientName = combinedClient;
      }
      const cgFirst = visit.caregiver_first_name ?? '';
      const cgLast = visit.caregiver_last_name ?? '';
      const combinedCg = `${cgFirst} ${cgLast}`.trim();
      if (combinedCg !== '') {
        result.caregiverName = combinedCg;
      }
      if (visit.scheduled_date instanceof Date) {
        result.scheduledDate = visit.scheduled_date.toISOString().split('T')[0];
      } else if (typeof visit.scheduled_date === 'string') {
        result.scheduledDate = visit.scheduled_date.split('T')[0];
      }
    }
  } catch (dbErr) {
    console.warn('Could not query visit record for autofill context:', dbErr);
  }
  return result;
}

async function fetchPreviousNotes(
  db: Database,
  clientId?: string,
  caregiverId?: string
): Promise<NoteContextRecord[]> {
  const previousNotes: NoteContextRecord[] = [];
  if (clientId === undefined) return previousNotes;

  try {
    const notesResult = await db.query(
      `SELECT
         vn.id,
         vn.note_text,
         vn.note_type,
         vn.activities_performed,
         vn.client_mood,
         vn.client_condition_notes,
         vn.created_at,
         v.service_type_name
       FROM visit_notes vn
       LEFT JOIN visits v ON vn.visit_id = v.id
       WHERE v.client_id = $1
         AND ($2::uuid IS NULL OR vn.caregiver_id = $2)
         AND vn.deleted_at IS NULL
       ORDER BY vn.created_at DESC
       LIMIT 15`,
      [clientId, caregiverId ?? null]
    );

    for (const row of notesResult.rows as unknown as VisitNoteRow[]) {
      const createdAtStr = row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at);

      previousNotes.push({
        id: row.id,
        noteText: row.note_text ?? undefined,
        noteType: row.note_type ?? undefined,
        activitiesPerformed: row.activities_performed ?? undefined,
        clientMood: row.client_mood ?? undefined,
        clientConditionNotes: row.client_condition_notes ?? undefined,
        createdAt: createdAtStr,
        serviceTypeName: row.service_type_name ?? undefined,
      });
    }
  } catch (notesErr) {
    console.warn('Could not query historical visit notes for autofill:', notesErr);
  }

  return previousNotes;
}

export default createVisitNotesRouter;
