import type { Knex } from 'knex';

/**
 * Migration: Add auth_events table (re)creation for production DB
 *
 * Production Neon DB was found empty (no users table, no auth_events).
 * This migration creates the auth_events table so checkRateLimit /
 * audit logging works. Uses knex schema builder with IF NOT EXISTS
 * guards so it can be replayed safely.
 */
export async function up(knex: Knex): Promise<void> {
  const authEventsExists = await knex.schema.hasTable('auth_events');
  if (!authEventsExists) {
    await knex.schema.createTable('auth_events', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      table.timestamp('timestamp').notNullable().defaultTo(knex.fn.now());
      table.uuid('user_id').references('id').inTable('users').onDelete('CASCADE');
      table.string('event_type', 50).notNullable();
      table.string('auth_method', 50).notNullable();
      table.string('email', 255);
      table.string('ip_address', 45);
      table.text('user_agent');
      table.jsonb('metadata').defaultTo('{}');
      table.string('result', 20).notNullable();
      table.text('failure_reason');
    });

    await knex.raw('CREATE INDEX IF NOT EXISTS idx_auth_events_user ON auth_events(user_id, timestamp DESC)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_auth_events_timestamp ON auth_events(timestamp DESC)');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_auth_events_type ON auth_events(event_type, timestamp DESC)');
    await knex.raw("CREATE INDEX IF NOT EXISTS idx_auth_events_email ON auth_events(email, timestamp DESC) WHERE result = 'FAILED'");
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('auth_events');
}
