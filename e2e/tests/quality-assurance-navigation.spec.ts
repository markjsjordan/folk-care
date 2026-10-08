import { test, expect } from '../fixtures/auth.fixture.js';
import { createAuthenticatedPage } from '../fixtures/auth.fixture.js';
import { TestDatabase } from '../setup/test-database.js';

/**
 * Quality Assurance Vertical — Navigation & Regression Coverage
 *
 * FC-AUDIT-QUALITY-ASSURANCE QA/GATE-2 verification pass (AC7).
 *
 * Covers:
 * 1. Each dashboard "View All" link (Scheduled / In-Progress / Completed audits,
 *    Overdue Corrective Actions) navigates to the correct URL with the expected
 *    query param, and the destination is a real page (not NotFound/404).
 * 2. "New Audit" from both QADashboard and AuditsPage navigates to
 *    /quality-assurance/audits/new and a real form renders.
 * 3. Clicking an AuditCard (from QADashboard or AuditsPage) navigates to a real
 *    AuditDetailPage showing the audit's actual title/data — not a 404, not the
 *    "Failed to load audit details" error state.
 * 4. /quality-assurance/corrective-actions loads real seeded data — this was
 *    previously 100% broken and is the most important regression check here.
 * 5. Critical Findings and Overdue Corrective Action cards on the dashboard
 *    navigate to a real page (the parent audit's detail page) — per senior
 *    review, no dedicated findings-list/action-detail page exists yet (out of
 *    scope for this ticket), so the "Critical Findings" section intentionally
 *    has NO "View All" link (removed rather than shipping a link that 500s).
 */
test.describe('Quality Assurance - Navigation & Regressions', () => {
  test.beforeAll(async () => {
    await TestDatabase.setup();
  });

  test.afterAll(async () => {
    await TestDatabase.teardown();
  });

  test.beforeEach(async () => {
    await TestDatabase.cleanup();
    await TestDatabase.seed('quality-assurance');
  });

  test('dashboard renders all 5 stat cards and section headings', async ({ page, adminUser }) => {
    const adminPage = await createAuthenticatedPage(page, adminUser);
    await adminPage.goto('/quality-assurance');

    await expect(adminPage.getByRole('heading', { name: /Quality Assurance Dashboard/i })).toBeVisible();
    await expect(adminPage.getByText('Upcoming Audits')).toBeVisible();
    await expect(adminPage.getByText('In Progress', { exact: true })).toBeVisible();
    await expect(adminPage.getByRole('heading', { name: 'Recently Completed' })).toBeVisible();
    await expect(adminPage.getByText('Critical Findings')).toBeVisible();
    await expect(adminPage.getByText('Overdue Corrective Actions')).toBeVisible();
  });

  test('"View All" (Scheduled) navigates to /quality-assurance/audits?status=SCHEDULED and shows the seeded audit', async ({
    page,
    adminUser,
  }) => {
    const adminPage = await createAuthenticatedPage(page, adminUser);
    await adminPage.goto('/quality-assurance');

    const upcomingSection = adminPage.getByText('Upcoming Audits').locator('..');
    await upcomingSection.getByRole('link', { name: 'View All' }).click();
    await adminPage.waitForURL('**/quality-assurance/audits?status=SCHEDULED');
    await adminPage.waitForLoadState('networkidle');

    expect(adminPage.url()).toContain('/quality-assurance/audits?status=SCHEDULED');
    await expect(adminPage.getByText(/page not found/i)).toHaveCount(0);
    await expect(adminPage.getByRole('heading', { name: 'Audits' })).toBeVisible();
    // Real data: the seeded SCHEDULED audit is visible on this list page.
    await expect(adminPage.getByText('AUD-2026-E2E1')).toBeVisible();
  });

  test('"View All" (In Progress) navigates to /quality-assurance/audits?status=IN_PROGRESS and lists real data (empty state is legitimate — no seeded IN_PROGRESS audits)', async ({
    page,
    adminUser,
  }) => {
    const adminPage = await createAuthenticatedPage(page, adminUser);
    await adminPage.goto('/quality-assurance');

    const inProgressSection = adminPage.getByText('In Progress', { exact: true }).locator('..');
    await inProgressSection.getByRole('link', { name: 'View All' }).click();
    await adminPage.waitForURL('**/quality-assurance/audits?status=IN_PROGRESS');

    expect(adminPage.url()).toContain('/quality-assurance/audits?status=IN_PROGRESS');
    await expect(adminPage.getByText(/page not found/i)).toHaveCount(0);
    await expect(adminPage.getByRole('heading', { name: 'Audits' })).toBeVisible();
    // No seeded audit has status IN_PROGRESS — the legitimate empty state is a pass.
    await expect(adminPage.getByText('No audits found')).toBeVisible();
  });

  test('"View All" (Recently Completed) navigates to /quality-assurance/audits?status=COMPLETED and never hits NotFound', async ({
    page,
    adminUser,
  }) => {
    const adminPage = await createAuthenticatedPage(page, adminUser);
    await adminPage.goto('/quality-assurance');

    const completedSection = adminPage.getByText('Recently Completed').locator('..');
    await completedSection.getByRole('link', { name: 'View All' }).click();
    await adminPage.waitForURL('**/quality-assurance/audits?status=COMPLETED');

    expect(adminPage.url()).toContain('/quality-assurance/audits?status=COMPLETED');
    await expect(adminPage.getByText(/page not found/i)).toHaveCount(0);
    await expect(adminPage.getByRole('heading', { name: 'Audits' })).toBeVisible();
    await expect(adminPage.getByText('No audits found')).toBeVisible();
  });

  test('"View All" (Overdue Corrective Actions) navigates to /quality-assurance/corrective-actions?overdue=true and shows the seeded overdue action', async ({
    page,
    adminUser,
  }) => {
    const adminPage = await createAuthenticatedPage(page, adminUser);
    await adminPage.goto('/quality-assurance');

    const overdueSection = adminPage.getByText('Overdue Corrective Actions').locator('..');
    await overdueSection.getByRole('link', { name: 'View All' }).click();
    await adminPage.waitForURL('**/quality-assurance/corrective-actions?overdue=true');

    expect(adminPage.url()).toContain('/quality-assurance/corrective-actions?overdue=true');
    await expect(adminPage.getByText(/page not found/i)).toHaveCount(0);
    await expect(adminPage.getByText(/failed to load/i)).toHaveCount(0);
    await expect(adminPage.getByRole('heading', { name: 'Corrective Actions' })).toBeVisible();
    await expect(adminPage.getByText(/CA-001|Implement EVV geofence validation logging/i).first()).toBeVisible();
  });

  test('Critical Findings section has no "View All" link (none built — removed per GATE-2 review, not routed to a broken page)', async ({
    page,
    adminUser,
  }) => {
    const adminPage = await createAuthenticatedPage(page, adminUser);
    await adminPage.goto('/quality-assurance');

    const criticalFindingsSection = adminPage.getByText('Critical Findings').locator('..');
    await expect(criticalFindingsSection.getByRole('link', { name: 'View All' })).toHaveCount(0);
  });

  test('clicking a Critical Finding card on the dashboard navigates to the real parent AuditDetailPage (not 404, not a load error)', async ({
    page,
    adminUser,
  }) => {
    const adminPage = await createAuthenticatedPage(page, adminUser);
    await adminPage.goto('/quality-assurance');

    await adminPage.getByText('Missing EVV geofence validation records').click();
    await adminPage.waitForLoadState('networkidle');

    expect(adminPage.url()).toMatch(/\/quality-assurance\/audits\/[0-9a-f-]+$/);
    await expect(adminPage.getByText(/page not found/i)).toHaveCount(0);
    await expect(adminPage.getByText(/failed to load audit details/i)).toHaveCount(0);
    // Real audit detail data for the finding's parent audit.
    await expect(adminPage.getByText('E2E Annual Compliance Audit')).toBeVisible();
    await expect(adminPage.getByText('AUD-2026-E2E1')).toBeVisible();
  });

  test('clicking an Overdue Corrective Action card on the dashboard navigates to the real parent AuditDetailPage (not 404, not a load error)', async ({
    page,
    adminUser,
  }) => {
    const adminPage = await createAuthenticatedPage(page, adminUser);
    await adminPage.goto('/quality-assurance');

    const overdueSection = adminPage.getByText('Overdue Corrective Actions').locator('..').locator('..');
    await overdueSection.getByText('Implement EVV geofence validation logging').click();
    await adminPage.waitForLoadState('networkidle');

    expect(adminPage.url()).toMatch(/\/quality-assurance\/audits\/[0-9a-f-]+$/);
    await expect(adminPage.getByText(/page not found/i)).toHaveCount(0);
    await expect(adminPage.getByText(/failed to load audit details/i)).toHaveCount(0);
    await expect(adminPage.getByText('E2E Annual Compliance Audit')).toBeVisible();
    await expect(adminPage.getByText('AUD-2026-E2E1')).toBeVisible();
  });

  test('"New Audit" from the QADashboard navigates to the create-audit form', async ({ page, adminUser }) => {
    const adminPage = await createAuthenticatedPage(page, adminUser);
    await adminPage.goto('/quality-assurance');

    await adminPage.getByRole('link', { name: /New Audit/i }).first().click();
    await adminPage.waitForURL('**/quality-assurance/audits/new');

    expect(adminPage.url()).toContain('/quality-assurance/audits/new');
    await expect(adminPage.getByRole('heading', { name: /Schedule New Audit/i })).toBeVisible();
    await expect(adminPage.locator('form')).toBeVisible();
    // Confirm it's a real form with real fields, not a blank shell.
    await expect(adminPage.getByPlaceholder('Enter audit title')).toBeVisible();
    await expect(adminPage.getByRole('button', { name: /Create Audit/i })).toBeVisible();
  });

  test('"New Audit" from the AuditsPage navigates to the create-audit form', async ({ page, adminUser }) => {
    const adminPage = await createAuthenticatedPage(page, adminUser);
    await adminPage.goto('/quality-assurance/audits');

    await adminPage.getByRole('link', { name: /New Audit/i }).first().click();
    await adminPage.waitForURL('**/quality-assurance/audits/new');

    expect(adminPage.url()).toContain('/quality-assurance/audits/new');
    await expect(adminPage.getByRole('heading', { name: /Schedule New Audit/i })).toBeVisible();
    await expect(adminPage.locator('form')).toBeVisible();
    await expect(adminPage.getByPlaceholder('Enter audit title')).toBeVisible();
  });

  test('clicking an audit card from the AuditsPage list navigates to a real audit detail page', async ({
    page,
    adminUser,
  }) => {
    const adminPage = await createAuthenticatedPage(page, adminUser);
    await adminPage.goto('/quality-assurance/audits');
    await adminPage.waitForLoadState('networkidle');

    await expect(adminPage.getByText('AUD-2026-E2E1')).toBeVisible();

    await adminPage.getByText('E2E Annual Compliance Audit').click();
    await adminPage.waitForLoadState('networkidle');

    expect(adminPage.url()).toMatch(/\/quality-assurance\/audits\/[0-9a-f-]+$/);

    // Real audit detail, not a 404 and not the "Failed to load" error state.
    await expect(adminPage.getByText(/page not found/i)).toHaveCount(0);
    await expect(adminPage.getByText(/failed to load audit details/i)).toHaveCount(0);
    await expect(adminPage.getByText('E2E Annual Compliance Audit')).toBeVisible();
    await expect(adminPage.getByText('AUD-2026-E2E1')).toBeVisible();
    // Real nested data: the seeded critical finding and corrective action render too.
    await expect(adminPage.getByText('Missing EVV geofence validation records')).toBeVisible();
    await expect(adminPage.getByText('Implement EVV geofence validation logging')).toBeVisible();
  });

  test('clicking an audit card from the QADashboard "Upcoming Audits" list navigates to a real audit detail page', async ({
    page,
    adminUser,
  }) => {
    const adminPage = await createAuthenticatedPage(page, adminUser);
    await adminPage.goto('/quality-assurance');

    const upcomingSection = adminPage.getByText('Upcoming Audits').locator('..').locator('..');
    await upcomingSection.getByText('E2E Annual Compliance Audit').click();
    await adminPage.waitForLoadState('networkidle');

    expect(adminPage.url()).toMatch(/\/quality-assurance\/audits\/[0-9a-f-]+$/);
    await expect(adminPage.getByText(/page not found/i)).toHaveCount(0);
    await expect(adminPage.getByText(/failed to load audit details/i)).toHaveCount(0);
    await expect(adminPage.getByText('E2E Annual Compliance Audit')).toBeVisible();
    await expect(adminPage.getByText('AUD-2026-E2E1')).toBeVisible();
  });

  test('REGRESSION: /quality-assurance/corrective-actions loads real seeded data directly (previously 100% broken)', async ({
    page,
    adminUser,
  }) => {
    const adminPage = await createAuthenticatedPage(page, adminUser);
    await adminPage.goto('/quality-assurance/corrective-actions');
    await adminPage.waitForLoadState('networkidle');

    // Must not be the 404/NotFound page.
    await expect(adminPage.getByText(/page not found/i)).toHaveCount(0);

    // Must not show a load failure.
    await expect(adminPage.getByText(/failed to load/i)).toHaveCount(0);

    await expect(adminPage.getByRole('heading', { name: 'Corrective Actions' })).toBeVisible();

    // Must show the seeded overdue corrective action, proving the page fetches
    // and renders real backend data rather than an empty/broken shell.
    await expect(adminPage.getByText(/CA-001|Implement EVV geofence validation logging/i).first()).toBeVisible();
  });
});
