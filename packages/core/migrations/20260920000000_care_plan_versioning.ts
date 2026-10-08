/**
 * Care Plan Versioning, Templates & Signatures Migration (FC-020)
 *
 * Implements immutable care plan versions for Medicaid audit trails (Texas HHSC & Florida AHCA),
 * template families with semantic versioning, and non-repudiation digital signatures.
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Signatures Table
  await knex.schema.createTable('signatures', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('signer_id').notNullable();
    table.string('signer_role', 50).notNullable();
    table.text('signature_svg').notNullable();
    table.timestamp('signed_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.string('ip_address', 45);
    table.string('audit_hash', 128).notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.index(['signer_id'], 'idx_signatures_signer_id');
    table.index(['signed_at'], 'idx_signatures_signed_at');
  });

  // 2. Template Families Table
  await knex.schema.createTable('template_families', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('organization_id').notNullable();
    table.string('code', 50).notNullable();
    table.string('name', 255).notNullable();
    table.string('category', 50).notNullable();
    table.boolean('is_active').notNullable().defaultTo(true);
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['organization_id', 'code'], { indexName: 'uq_template_families_org_code' });
    table.index(['organization_id'], 'idx_template_families_org_id');
    table.index(['category'], 'idx_template_families_category');
  });

  // 3. Template Versions Table
  await knex.schema.createTable('template_versions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('family_id').notNullable().references('id').inTable('template_families').onDelete('CASCADE');
    table.string('version_number', 50).notNullable();
    table.string('status', 30).notNullable().defaultTo('DRAFT');
    table.jsonb('schema_definition').notNullable().defaultTo('{}');
    table.date('effective_date').notNullable().defaultTo(knex.raw('CURRENT_DATE'));
    table.uuid('created_by');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.unique(['family_id', 'version_number'], { indexName: 'uq_template_versions_family_version' });
    table.index(['family_id'], 'idx_template_versions_family_id');
    table.index(['status'], 'idx_template_versions_status');
  });

  // 4. Care Plan Versions Table
  await knex.schema.createTable('care_plan_versions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('care_plan_id').notNullable().references('id').inTable('care_plans').onDelete('CASCADE');
    table.integer('version_number').notNullable();
    table.string('status', 50).notNullable().defaultTo('ACTIVE');
    table.jsonb('content').notNullable().defaultTo('{}');
    table.timestamp('effective_start', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('effective_end', { useTz: true });
    table.uuid('superseded_by_version_id').references('id').inTable('care_plan_versions').onDelete('SET NULL');
    table.text('change_reason');
    table.uuid('signature_id').references('id').inTable('signatures').onDelete('SET NULL');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.uuid('created_by');

    table.unique(['care_plan_id', 'version_number'], { indexName: 'uq_care_plan_versions_plan_version' });
    table.index(['care_plan_id'], 'idx_care_plan_versions_care_plan_id');
    table.index(['care_plan_id', 'status'], 'idx_care_plan_versions_plan_status');
    table.index(['signature_id'], 'idx_care_plan_versions_signature_id');
  });

  // 5. Extend care_plans table if needed
  const hasCurrentVersion = await knex.schema.hasColumn('care_plans', 'current_version');
  if (!hasCurrentVersion) {
    await knex.schema.alterTable('care_plans', (table) => {
      table.integer('current_version').notNullable().defaultTo(1);
    });
  }

  const hasTemplateFamily = await knex.schema.hasColumn('care_plans', 'template_family_id');
  if (!hasTemplateFamily) {
    await knex.schema.alterTable('care_plans', (table) => {
      table.uuid('template_family_id').references('id').inTable('template_families').onDelete('SET NULL');
      table.uuid('template_version_id').references('id').inTable('template_versions').onDelete('SET NULL');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTemplateFamily = await knex.schema.hasColumn('care_plans', 'template_family_id');
  if (hasTemplateFamily) {
    await knex.schema.alterTable('care_plans', (table) => {
      table.dropColumn('template_family_id');
      table.dropColumn('template_version_id');
    });
  }

  const hasCurrentVersion = await knex.schema.hasColumn('care_plans', 'current_version');
  if (hasCurrentVersion) {
    await knex.schema.alterTable('care_plans', (table) => {
      table.dropColumn('current_version');
    });
  }

  await knex.schema.dropTableIfExists('care_plan_versions');
  await knex.schema.dropTableIfExists('template_versions');
  await knex.schema.dropTableIfExists('template_families');
  await knex.schema.dropTableIfExists('signatures');
}
