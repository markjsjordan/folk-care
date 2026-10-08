import type { Knex } from 'knex';

/**
 * Migration: Allow READY_TO_SUBMIT invoice status (FC-14 EVV-before-billing gate)
 *
 * Invoices move to READY_TO_SUBMIT only after every attached visit passes the
 * 21st Century Cures Act EVV gate. The original chk_invoice_status constraint
 * predates that status, so the transition would be rejected by the database.
 */
const BASE_STATUSES = [
  'DRAFT',
  'PENDING_REVIEW',
  'APPROVED',
  'SENT',
  'SUBMITTED',
  'PARTIALLY_PAID',
  'PAID',
  'PAST_DUE',
  'DISPUTED',
  'CANCELLED',
  'VOIDED',
];

const toCheck = (statuses: string[]): string =>
  `CHECK (status IN (${statuses.map((s) => `'${s}'`).join(', ')}))`;

export async function up(knex: Knex): Promise<void> {
  await knex.raw('ALTER TABLE invoices DROP CONSTRAINT IF EXISTS chk_invoice_status');
  await knex.raw(
    `ALTER TABLE invoices ADD CONSTRAINT chk_invoice_status ${toCheck([...BASE_STATUSES, 'READY_TO_SUBMIT'])}`
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`UPDATE invoices SET status = 'APPROVED' WHERE status = 'READY_TO_SUBMIT'`);
  await knex.raw('ALTER TABLE invoices DROP CONSTRAINT IF EXISTS chk_invoice_status');
  await knex.raw(`ALTER TABLE invoices ADD CONSTRAINT chk_invoice_status ${toCheck(BASE_STATUSES)}`);
}
