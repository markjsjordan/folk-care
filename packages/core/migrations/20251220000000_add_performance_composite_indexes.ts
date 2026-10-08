import type { Knex } from 'knex';

/**
 * Performance Optimization Migration (FC-16)
 *
 * Adds strategic composite indexes for high-traffic multi-tenant tables:
 * - visits(organization_id, scheduled_date, status)
 * - clients(organization_id, status)
 * - caregiver_profiles(organization_id, employment_status)
 * - evv_logs(visit_id, created_at)
 *
 * Also ensures existing caregiver and evv records tables have matching composite indexes.
 */

export async function up(knex: Knex): Promise<void> {
  // 1. visits(organization_id, scheduled_date, status)
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_visits_org_date_status
    ON visits(organization_id, scheduled_date, status)
    WHERE deleted_at IS NULL;
  `);

  // 2. clients(organization_id, status)
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_clients_org_status
    ON clients(organization_id, status)
    WHERE deleted_at IS NULL;
  `);

  // 3. caregivers(organization_id, employment_status)
  const hasCaregivers = await knex.schema.hasTable('caregivers');
  if (hasCaregivers) {
    await knex.raw(`
      CREATE INDEX IF NOT EXISTS idx_caregivers_org_employment_status
      ON caregivers(organization_id, employment_status)
      WHERE deleted_at IS NULL;
    `);
  }

  // 3b. caregiver_profiles(organization_id, employment_status)
  const hasCaregiverProfiles = await knex.schema.hasTable('caregiver_profiles');
  if (!hasCaregiverProfiles) {
    await knex.schema.createTable('caregiver_profiles', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('organization_id').notNullable();
      table.uuid('caregiver_id');
      table.string('employment_status', 50).notNullable().defaultTo('ACTIVE');
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    });
  }
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_caregiver_profiles_org_emp_status
    ON caregiver_profiles(organization_id, employment_status);
  `);

  // 4. evv_records(visit_id, created_at)
  const hasEvvRecords = await knex.schema.hasTable('evv_records');
  if (hasEvvRecords) {
    await knex.raw(`
      CREATE INDEX IF NOT EXISTS idx_evv_records_visit_created
      ON evv_records(visit_id, created_at);
    `);
  }

  // 4b. evv_logs(visit_id, created_at)
  const hasEvvLogs = await knex.schema.hasTable('evv_logs');
  if (!hasEvvLogs) {
    await knex.schema.createTable('evv_logs', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('visit_id').notNullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.string('level', 20).defaultTo('INFO');
      table.text('message');
      table.jsonb('metadata');
    });
  }
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS idx_evv_logs_visit_created
    ON evv_logs(visit_id, created_at);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS idx_visits_org_date_status');
  await knex.raw('DROP INDEX IF EXISTS idx_clients_org_status');
  await knex.raw('DROP INDEX IF EXISTS idx_caregivers_org_employment_status');
  await knex.raw('DROP INDEX IF EXISTS idx_caregiver_profiles_org_emp_status');
  await knex.raw('DROP INDEX IF EXISTS idx_evv_records_visit_created');
  await knex.raw('DROP INDEX IF EXISTS idx_evv_logs_visit_created');
}
