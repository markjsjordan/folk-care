import { Database } from '../../../packages/core/src/db/connection.js';

/**
 * Seed Data: EVV Clock-In/Out Persistence Fixture (FC-AUDIT-EVV WU-1)
 *
 * Unlike the other files in this directory (which target the ephemeral
 * TestDatabase/folkcare_e2e_test stack spun up by e2e/setup/global-setup.ts),
 * this seed targets the REAL shared dev database (the same Neon Postgres
 * instance packages/app's dev server at :3000 is already connected to —
 * see root .env DATABASE_URL). That matches how the sibling specs for this
 * same ticket operate (evv-clock-persistence.spec.ts itself, plus
 * billing-invoice-lifecycle.spec.ts / payroll-period-and-run.spec.ts): they
 * log in as the real admin@folkcare.example account via the UI against the
 * already-running dev servers (per playwright.dev-shared.config.ts), not
 * against an isolated ephemeral test DB. Seeding into the ephemeral stack
 * would be invisible to that spec.
 *
 * Creates one clockable visit:
 * - Reuses the existing seeded org/branch (Folk Home Health / Main Office)
 *   that admin@folkcare.example already belongs to.
 * - One caregiver with a CLEARED background check and no restricted-client
 *   entries (so EVVService.canProvideService + the background-screening
 *   check both pass for PERSONAL_CARE, which requires no credentials).
 * - One client with a geocoded primary_address (valid lat/long) so
 *   EVVService's geofencing check has real coordinates to validate against.
 * - One visit in status ASSIGNED (NOT 'SCHEDULED' — VisitProvider.canClockIn
 *   only accepts ASSIGNED | CONFIRMED | EN_ROUTE, confirmed by reading
 *   verticals/scheduling-visits/src/api/visit-provider.ts) assigned to that
 *   caregiver/client pair, scheduled for today (so the "not a future date"
 *   check in canClockIn passes), with service_type_id = PERSONAL_CARE (no
 *   FK constraint on visits.service_type_id, confirmed via information_schema).
 * - No existing EVV record for this visit (fresh fixture every run via a
 *   deterministic UUID + ON CONFLICT DO NOTHING, and a defensive DELETE of
 *   any EVV record/time entries from a prior run so the spec always gets a
 *   clean clockable visit).
 */

const ORG_ID = '00000000-0000-0000-0000-000000000001'; // Folk Home Health (existing)
const BRANCH_ID = '00000000-0000-0000-0000-000000000002'; // Main Office (existing)
const ADMIN_USER_ID = '00000000-0000-0000-0000-000000000003'; // admin@folkcare.example (existing)

export const EVV_FIXTURE_CAREGIVER_ID = '00000000-ee20-4000-8000-0000000ca001';
export const EVV_FIXTURE_CLIENT_ID = '00000000-ee20-4000-8000-0000000c1001';
export const EVV_FIXTURE_VISIT_ID = '00000000-ee20-4000-8000-0000000fa001';

export async function seedDatabase(db: Database): Promise<void> {
  console.log('Seeding EVV clock-persistence fixture...');

  // Caregiver with CLEARED background check, no restricted clients, no
  // credential requirements needed (service type PERSONAL_CARE requires none).
  // Includes every NOT-NULL column on this table (confirmed via
  // information_schema.columns) so the insert succeeds against the real
  // dev schema, not just an idealized subset.
  await db.query(
    `INSERT INTO caregivers (
      id, organization_id, branch_ids, primary_branch_id, employee_number,
      first_name, last_name, date_of_birth, primary_phone, email,
      preferred_contact_method, primary_address, emergency_contacts,
      employment_type, employment_status, hire_date, role, credentials,
      training, skills, availability, pay_rate, compliance_status,
      status, timezone, created_at, created_by, updated_at, updated_by, version
    ) VALUES (
      $1, $2, $3::uuid[], $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
      $14, $15, $16, $17, $18, $19, $20, $21, $22, $23,
      $24, $25, NOW(), $26, NOW(), $26, 1
    )
    ON CONFLICT (id) DO UPDATE SET
      background_check = EXCLUDED.background_check,
      status = EXCLUDED.status`,
    [
      EVV_FIXTURE_CAREGIVER_ID,
      ORG_ID,
      [BRANCH_ID],
      BRANCH_ID,
      'CG-EVV-FIXTURE-001',
      'Evv',
      'Fixture-Caregiver',
      '1985-01-01',
      JSON.stringify({ number: '512-555-0199', type: 'MOBILE' }),
      'evv.fixture.caregiver@e2e-test.com',
      'PHONE',
      JSON.stringify({
        line1: '200 Fixture Way',
        city: 'Austin',
        state: 'TX',
        postalCode: '78701',
        country: 'USA',
      }),
      JSON.stringify([]),
      'FULL_TIME',
      'ACTIVE',
      '2024-01-01',
      'CAREGIVER',
      JSON.stringify([]),
      JSON.stringify([]),
      JSON.stringify([]),
      JSON.stringify({ monday: true, tuesday: true, wednesday: true, thursday: true, friday: true }),
      JSON.stringify({ hourlyRate: 25.0, currency: 'USD' }),
      'COMPLIANT',
      'ACTIVE',
      'America/Chicago',
      ADMIN_USER_ID,
    ]
  );

  // background_check is a separate nullable jsonb column — set via UPDATE
  // after insert so the INSERT column list above (built from the NOT NULL
  // set) stays accurate and auditable against information_schema.
  await db.query(
    `UPDATE caregivers SET background_check = $2 WHERE id = $1`,
    [
      EVV_FIXTURE_CAREGIVER_ID,
      JSON.stringify({
        status: 'CLEARED',
        clearanceDate: '2024-01-01',
        expirationDate: '2030-01-01',
        checkType: 'FBI_FINGERPRINT',
      }),
    ]
  );

  // Client with geocoded primary_address (valid lat/long) for geofencing.
  await db.query(
    `INSERT INTO clients (
      id, organization_id, branch_id, client_number, first_name, last_name,
      date_of_birth, primary_address, emergency_contacts, authorized_contacts,
      programs, service_eligibility, risk_flags, status, timezone,
      created_at, created_by, updated_at, updated_by, version
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
      NOW(), $16, NOW(), $16, 1
    )
    ON CONFLICT (id) DO UPDATE SET
      primary_address = EXCLUDED.primary_address,
      status = EXCLUDED.status`,
    [
      EVV_FIXTURE_CLIENT_ID,
      ORG_ID,
      BRANCH_ID,
      'CL-EVV-FIXTURE-001',
      'Evv',
      'Fixture-Client',
      '1950-01-01',
      JSON.stringify({
        line1: '100 Congress Ave',
        city: 'Austin',
        state: 'TX',
        postalCode: '78701',
        country: 'USA',
        latitude: 30.2672,
        longitude: -97.7431,
      }),
      JSON.stringify([]),
      JSON.stringify([]),
      JSON.stringify([]),
      JSON.stringify({}),
      JSON.stringify([]),
      'ACTIVE',
      'America/Chicago',
      ADMIN_USER_ID,
    ]
  );

  // Visit in ASSIGNED status (clockable per VisitProvider.canClockIn),
  // scheduled for today, assigned to the fixture caregiver/client pair,
  // with no EVV record yet.
  const today = new Date().toISOString().slice(0, 10);

  await db.query(
    `INSERT INTO visits (
      id, organization_id, branch_id, client_id, visit_number, visit_type,
      service_type_id, service_type_name, scheduled_date,
      scheduled_start_time, scheduled_end_time, scheduled_duration, timezone,
      assigned_caregiver_id, assigned_at, assigned_by, assignment_method,
      address, status, status_history,
      created_at, created_by, updated_at, updated_by, version
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), $15,
      $16, $17, $18, $19::jsonb, NOW(), $15, NOW(), $15, 1
    )
    ON CONFLICT (id) DO UPDATE SET
      assigned_caregiver_id = EXCLUDED.assigned_caregiver_id,
      status = EXCLUDED.status,
      scheduled_date = EXCLUDED.scheduled_date`,
    [
      EVV_FIXTURE_VISIT_ID,
      ORG_ID,
      BRANCH_ID,
      EVV_FIXTURE_CLIENT_ID,
      'VIS-EVV-FIXTURE-001',
      'REGULAR',
      '00000000-0000-4000-8000-00000005ec01', // PERSONAL_CARE placeholder; no FK on visits.service_type_id
      'PERSONAL_CARE',
      today,
      '09:00:00',
      '11:00:00',
      120,
      'America/Chicago',
      EVV_FIXTURE_CAREGIVER_ID,
      ADMIN_USER_ID,
      'MANUAL',
      JSON.stringify({
        line1: '100 Congress Ave',
        city: 'Austin',
        state: 'TX',
        postalCode: '78701',
        country: 'USA',
        latitude: 30.2672,
        longitude: -97.7431,
      }),
      'ASSIGNED',
      JSON.stringify([]),
    ]
  );

  // Defensive cleanup: remove any EVV record/time entries left over from a
  // prior run of this spec against this fixture visit, so the spec always
  // exercises a real clock-in (never skips because a COMPLETE record from a
  // previous run already exists).
  await db.query(`DELETE FROM time_entries WHERE visit_id = $1`, [EVV_FIXTURE_VISIT_ID]);
  await db.query(`DELETE FROM evv_records WHERE visit_id = $1`, [EVV_FIXTURE_VISIT_ID]);
  await db.query(`UPDATE visits SET status = 'ASSIGNED' WHERE id = $1`, [EVV_FIXTURE_VISIT_ID]);

  console.log('✅ EVV clock-persistence fixture seeded (visit:', EVV_FIXTURE_VISIT_ID, ')');
}
