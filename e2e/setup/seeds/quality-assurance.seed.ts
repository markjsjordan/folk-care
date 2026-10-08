import { Database } from '../../../packages/core/src/db/connection.js';
import { E2E_UUIDS } from '../../fixtures/test-data.js';

/**
 * Seed Data: Quality Assurance / Audits
 *
 * Creates minimal data for FC-AUDIT-QUALITY-ASSURANCE QA/GATE-2 verification:
 * - Organization and branch (reused from shared E2E fixtures)
 * - One SCHEDULED audit (so "View All (Scheduled)" and the audit card click-through
 *   have something real to render)
 * - One CRITICAL finding on that audit (so AuditDetailPage findings section is populated)
 * - One overdue corrective action tied to the audit/finding (so
 *   /quality-assurance/corrective-actions has real data — this was previously
 *   100% broken and is the most important regression check for this ticket)
 */
export async function seedDatabase(db: Database): Promise<void> {
  console.log('Seeding quality-assurance test data...');

  const orgId = E2E_UUIDS.ORG_E2E;
  const branchId = E2E_UUIDS.BRANCH_E2E;
  const auditId = '00000000-e2e0-4000-8000-000000004001';
  const findingId = '00000000-e2e0-4000-8000-000000004002';
  const correctiveActionId = '00000000-e2e0-4000-8000-000000004003';
  // created_by/updated_by columns are UUID-typed; use the seeded admin user's id
  // rather than the literal string 'system' (which fails UUID validation).
  const systemUserId = E2E_UUIDS.ADMIN_USER;

  // Create organization (idempotent — shared with other seeds)
  await db.query(
    `INSERT INTO organizations (id, name, primary_address, status, created_at, created_by, updated_at, updated_by, version)
     VALUES ($1, $2, $3, $4, NOW(), $5, NOW(), $5, 1)
     ON CONFLICT (id) DO NOTHING`,
    [
      orgId,
      'E2E Test Organization',
      JSON.stringify({
        line1: '456 Healthcare Blvd',
        city: 'Austin',
        state: 'TX',
        postalCode: '78701',
        country: 'USA',
      }),
      'ACTIVE',
      systemUserId,
    ]
  );

  // Create branch (idempotent — shared with other seeds)
  await db.query(
    `INSERT INTO branches (id, organization_id, name, address, status, created_at, created_by, updated_at, updated_by, version)
     VALUES ($1, $2, $3, $4, $5, NOW(), $6, NOW(), $6, 1)
     ON CONFLICT (id) DO NOTHING`,
    [
      branchId,
      orgId,
      'Main Branch',
      JSON.stringify({
        line1: '123 Main St',
        city: 'Austin',
        state: 'TX',
        postalCode: '78701',
        country: 'USA',
        latitude: 30.2672,
        longitude: -97.7431,
      }),
      'ACTIVE',
      systemUserId,
    ]
  );

  // Create the admin user referenced by audits.lead_auditor_id / findings.observed_by /
  // corrective_actions.responsible_person_id (all FK-constrained to users.id).
  // Self-references created_by/updated_by to its own id, matching the pattern used by
  // the base seed script for the system admin user.
  await db.query(
    `INSERT INTO users (
      id, organization_id, username, email, first_name, last_name,
      roles, permissions, branch_ids, status,
      created_at, created_by, updated_at, updated_by, version
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10,
      NOW(), $1, NOW(), $1, 1
    )
    ON CONFLICT (id) DO NOTHING`,
    [
      systemUserId,
      orgId,
      'e2e-admin',
      'admin@e2e-test.com',
      'Admin',
      'User',
      ['SUPER_ADMIN'],
      ['*:*'],
      [branchId],
      'ACTIVE',
    ]
  );

  // Create one SCHEDULED audit
  await db.query(
    `INSERT INTO audits (
      id, audit_number, title, description, audit_type, status, priority,
      scope, scheduled_start_date, scheduled_end_date,
      lead_auditor_id, lead_auditor_name, auditor_ids,
      total_findings, critical_findings, major_findings, minor_findings,
      organization_id, branch_id, created_at, created_by, updated_at, updated_by, version
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9, $10,
      $11, $12, $13,
      $14, $15, $16, $17,
      $18, $19, NOW(), $20, NOW(), $20, 1
    )
    ON CONFLICT (id) DO NOTHING`,
    [
      auditId,
      'AUD-2026-E2E1',
      'E2E Annual Compliance Audit',
      'Seeded audit for QA vertical navigation/regression E2E coverage',
      'COMPLIANCE',
      'SCHEDULED',
      'HIGH',
      'ORGANIZATION',
      '2026-02-01',
      '2026-02-05',
      E2E_UUIDS.ADMIN_USER,
      'Admin User',
      JSON.stringify([]),
      1,
      1,
      0,
      0,
      orgId,
      branchId,
      systemUserId,
    ]
  );

  // Create one CRITICAL finding on the audit
  await db.query(
    `INSERT INTO audit_findings (
      id, audit_id, finding_number, title, description, category, severity, status,
      observed_by, observed_by_name, observed_at,
      required_corrective_action,
      organization_id, branch_id, created_at, created_by, updated_at, updated_by, version
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9, $10, NOW(),
      $11,
      $12, $13, NOW(), $14, NOW(), $14, 1
    )
    ON CONFLICT (id) DO NOTHING`,
    [
      findingId,
      auditId,
      'F-001',
      'Missing EVV geofence validation records',
      'Seeded critical finding for QA vertical E2E coverage',
      'DOCUMENTATION',
      'CRITICAL',
      'OPEN',
      E2E_UUIDS.ADMIN_USER,
      'Admin User',
      'Implement geofence validation logging for all EVV check-ins',
      orgId,
      branchId,
      systemUserId,
    ]
  );

  // Create one OVERDUE corrective action (target date in the past) tied to the finding/audit.
  // This is the single most important regression check for this ticket: the
  // /quality-assurance/corrective-actions page and GET /api/audits/corrective-actions*
  // endpoints were previously 100% broken.
  await db.query(
    `INSERT INTO corrective_actions (
      id, finding_id, audit_id, action_number, title, description, action_type, status,
      specific_actions, responsible_person_id, responsible_person_name, target_completion_date,
      completion_percentage, organization_id, branch_id, created_at, created_by, updated_at, updated_by, version
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8,
      $9, $10, $11, $12,
      0, $13, $14, NOW(), $15, NOW(), $15, 1
    )
    ON CONFLICT (id) DO NOTHING`,
    [
      correctiveActionId,
      findingId,
      auditId,
      'CA-001',
      'Implement EVV geofence validation logging',
      'Seeded overdue corrective action for QA vertical E2E coverage',
      'SHORT_TERM',
      'IN_PROGRESS',
      JSON.stringify(['Add logging middleware', 'Backfill historical records']),
      E2E_UUIDS.ADMIN_USER,
      'Admin User',
      '2025-01-01', // in the past relative to any realistic test run -> overdue
      orgId,
      branchId,
      systemUserId,
    ]
  );

  console.log('✅ Quality assurance seed data created');
}
