/**
 * Visit Patterns Table Migration
 *
 * Implements the visit_patterns data model for recurring care schedules.
 * Supports rrule/frequency, start_date, end_date, day_of_week, start_time, duration,
 * with multi-tenant organization_id scoping.
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const exists = await knex.schema.hasTable('visit_patterns');
  if (!exists) {
    await knex.schema.createTable('visit_patterns', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('organization_id').notNullable();
      table.uuid('branch_id');
      table.uuid('client_id').notNullable();
      table.uuid('caregiver_id'); // Optional assigned caregiver
      table.uuid('service_type_id').notNullable();
      table.string('service_type_name', 200);

      // Recurrence definition
      table.string('frequency', 50).notNullable().defaultTo('WEEKLY');
      table.text('rrule'); // Recurrence rule string (e.g. FREQ=WEEKLY;BYDAY=MO,WE,FR)
      table.date('start_date').notNullable();
      table.date('end_date');
      table.jsonb('day_of_week').notNullable().defaultTo('[]'); // Array of DayOfWeek strings
      table.string('start_time', 10).notNullable(); // HH:MM (e.g. "09:00")
      table.integer('duration').notNullable(); // Duration in minutes

      // Status and instructions
      table.string('status', 50).notNullable().defaultTo('ACTIVE');
      table.text('notes');
      table.text('client_instructions');
      table.text('caregiver_instructions');
      table.boolean('skip_holidays').defaultTo(true);

      // Exceptions & metadata
      table.jsonb('exceptions').defaultTo('[]');

      // Audit fields
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.uuid('created_by').notNullable();
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
      table.uuid('updated_by').notNullable();
      table.timestamp('deleted_at');
      table.uuid('deleted_by');

      // Foreign keys
      table.foreign('organization_id').references('id').inTable('organizations').onDelete('CASCADE');
      table.foreign('client_id').references('id').inTable('clients').onDelete('CASCADE');
    });

    await knex.raw('CREATE INDEX IF NOT EXISTS idx_visit_patterns_org ON visit_patterns(organization_id) WHERE deleted_at IS NULL');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_visit_patterns_client ON visit_patterns(organization_id, client_id) WHERE deleted_at IS NULL');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_visit_patterns_caregiver ON visit_patterns(organization_id, caregiver_id) WHERE deleted_at IS NULL');
    await knex.raw('CREATE INDEX IF NOT EXISTS idx_visit_patterns_dates ON visit_patterns(start_date, end_date) WHERE deleted_at IS NULL');
  }

  // Ensure visits table allows pattern_id to reference visit_patterns
  const hasVisits = await knex.schema.hasTable('visits');
  if (hasVisits) {
    await knex.raw(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints 
          WHERE constraint_name = 'visits_pattern_id_foreign' 
          AND table_name = 'visits'
        ) THEN
          ALTER TABLE visits DROP CONSTRAINT visits_pattern_id_foreign;
        END IF;
      END $$;
    `);
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('visit_patterns');
}
