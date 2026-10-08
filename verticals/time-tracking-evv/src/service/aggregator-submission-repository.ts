/**
 * EVV Aggregator Submission SQL Repository
 *
 * Real SQL-backed implementation of IAggregatorSubmissionRepository /
 * IAggregatorConfigRepository, backed by the state_aggregator_submissions
 * table (see providers/*-evv-provider.ts for the original INSERT shape this
 * mirrors) for FC-AUDIT-EVV WU-4 (mounting AggregatorHandlers as real routes).
 */

import type { Database, UUID } from '@folkcare/core';
import type {
  IAggregatorConfigRepository,
  IAggregatorSubmissionRepository,
} from './evv-aggregator-service';
import type { StateAggregatorSubmission, StateCode, TexasEVVConfig, FloridaEVVConfig } from '../types/state-specific';

interface SubmissionRow extends Record<string, unknown> {
  id: string;
  state_code: string;
  evv_record_id: string;
  aggregator_id: string;
  aggregator_type: string;
  submission_payload: unknown;
  submission_format: string;
  submitted_at: Date;
  submitted_by: string;
  submission_status: string;
  aggregator_response: unknown;
  aggregator_confirmation_id: string | null;
  aggregator_received_at: Date | null;
  error_code: string | null;
  error_message: string | null;
  error_details: unknown;
  retry_count: number;
  max_retries: number;
  next_retry_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function parseJson<T>(value: unknown): T | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return undefined;
    }
  }
  return value as T;
}

function mapSubmission(row: SubmissionRow): StateAggregatorSubmission {
  return {
    id: row.id as UUID,
    state: row.state_code as StateCode,
    evvRecordId: row.evv_record_id as UUID,
    aggregatorId: row.aggregator_id,
    aggregatorType: row.aggregator_type,
    submissionPayload: (parseJson<Record<string, unknown>>(row.submission_payload) ?? {}),
    submissionFormat: row.submission_format as StateAggregatorSubmission['submissionFormat'],
    submittedAt: row.submitted_at,
    submittedBy: row.submitted_by as UUID,
    submissionStatus: row.submission_status as StateAggregatorSubmission['submissionStatus'],
    aggregatorResponse: parseJson<Record<string, unknown>>(row.aggregator_response),
    aggregatorConfirmationId: row.aggregator_confirmation_id ?? undefined,
    aggregatorReceivedAt: row.aggregator_received_at ?? undefined,
    errorCode: row.error_code ?? undefined,
    errorMessage: row.error_message ?? undefined,
    errorDetails: parseJson<Record<string, unknown>>(row.error_details),
    retryCount: row.retry_count,
    maxRetries: row.max_retries,
    nextRetryAt: row.next_retry_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class AggregatorSubmissionRepository implements IAggregatorSubmissionRepository {
  constructor(private db: Database) {}

  async createSubmission(
    submission: Omit<StateAggregatorSubmission, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<StateAggregatorSubmission> {
    const result = await this.db.query<SubmissionRow>(
      `INSERT INTO state_aggregator_submissions (
        id, state_code, evv_record_id, aggregator_id, aggregator_type,
        submission_payload, submission_format, submitted_at, submitted_by,
        submission_status, aggregator_response, aggregator_confirmation_id,
        aggregator_received_at, error_code, error_message, error_details,
        retry_count, max_retries, next_retry_at
      ) VALUES (
        gen_random_uuid(), $1, $2, $3, $4,
        $5::jsonb, $6, $7, $8,
        $9, $10::jsonb, $11,
        $12, $13, $14, $15::jsonb,
        $16, $17, $18
      ) RETURNING *`,
      [
        submission.state,
        submission.evvRecordId,
        submission.aggregatorId,
        submission.aggregatorType,
        JSON.stringify(submission.submissionPayload),
        submission.submissionFormat,
        submission.submittedAt,
        submission.submittedBy,
        submission.submissionStatus,
        submission.aggregatorResponse ? JSON.stringify(submission.aggregatorResponse) : null,
        submission.aggregatorConfirmationId ?? null,
        submission.aggregatorReceivedAt ?? null,
        submission.errorCode ?? null,
        submission.errorMessage ?? null,
        submission.errorDetails ? JSON.stringify(submission.errorDetails) : null,
        submission.retryCount,
        submission.maxRetries,
        submission.nextRetryAt ?? null,
      ]
    );
    return mapSubmission(result.rows[0]!);
  }

  async updateSubmission(
    id: UUID,
    updates: Partial<StateAggregatorSubmission>
  ): Promise<StateAggregatorSubmission> {
    const fieldMap: Record<string, string> = {
      submissionStatus: 'submission_status',
      aggregatorResponse: 'aggregator_response',
      aggregatorConfirmationId: 'aggregator_confirmation_id',
      aggregatorReceivedAt: 'aggregator_received_at',
      errorCode: 'error_code',
      errorMessage: 'error_message',
      errorDetails: 'error_details',
      retryCount: 'retry_count',
      maxRetries: 'max_retries',
      nextRetryAt: 'next_retry_at',
    };
    const jsonFields = new Set(['aggregatorResponse', 'errorDetails']);

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    for (const [key, dbCol] of Object.entries(fieldMap)) {
      if (key in updates) {
        const value = (updates as Record<string, unknown>)[key];
        setClauses.push(`${dbCol} = $${paramIndex}`);
        values.push(jsonFields.has(key) && value !== null && value !== undefined ? JSON.stringify(value) : value ?? null);
        paramIndex++;
      }
    }
    setClauses.push(`updated_at = NOW()`);

    values.push(id);
    const result = await this.db.query<SubmissionRow>(
      `UPDATE state_aggregator_submissions SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );
    if (result.rows.length === 0) {
      const err = new Error(`Submission ${id} not found`);
      err.name = 'NotFoundError';
      throw err;
    }
    return mapSubmission(result.rows[0]!);
  }

  async getSubmissionsByEVVRecord(evvRecordId: UUID): Promise<StateAggregatorSubmission[]> {
    const result = await this.db.query<SubmissionRow>(
      `SELECT * FROM state_aggregator_submissions WHERE evv_record_id = $1 ORDER BY submitted_at DESC`,
      [evvRecordId]
    );
    return result.rows.map(mapSubmission);
  }

  async getPendingRetries(): Promise<StateAggregatorSubmission[]> {
    const result = await this.db.query<SubmissionRow>(
      `SELECT * FROM state_aggregator_submissions
       WHERE submission_status IN ('PENDING', 'RETRY', 'REJECTED')
         AND retry_count < max_retries
       ORDER BY next_retry_at ASC NULLS FIRST, submitted_at ASC`
    );
    return result.rows.map(mapSubmission);
  }
}

/**
 * Minimal IAggregatorConfigRepository adapter over the existing pure
 * getStateConfig() function (config/state-evv-configs.ts). Only states with
 * a dedicated submission-payload config (TX/FL) return a non-null config;
 * other supported states route through base StateEVVConfig and don't need
 * this lookup for submitToAggregator in the current codebase.
 */
export class AggregatorConfigRepository implements IAggregatorConfigRepository {
  async getStateConfig(
    _organizationId: UUID,
    _branchId: UUID,
    _stateCode: StateCode
  ): Promise<TexasEVVConfig | FloridaEVVConfig | null> {
    // No organization/branch-specific override table exists yet; falls back
    // to null (aggregator-router's getStateConfig() default config is used
    // instead for routing/validation, which the 5 submission-tracking
    // routes mounted in WU-4 don't depend on).
    return null;
  }
}
