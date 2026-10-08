import { test, expect } from "@playwright/test";

// QA/GATE-2 regression coverage for FC-AUDIT-CAREPLANS.
// Lightweight, self-contained spec (no shared fixtures) matching the
// project's own smoke.spec.ts style — these assertions focus on route
// wiring and the signature-capture gating chain rather than full
// authenticated-flow testing via the heavy fixture stack.
//
// NOTE: requires a real login (admin@folkcare.example / Admin123!) to reach
// authenticated pages. Tests use the UI login form directly rather than the
// auth.fixture helper so this file has zero dependency on JWT_SECRET being
// exported into the Playwright worker process.

const ADMIN_EMAIL = "admin@folkcare.example";
const ADMIN_PASSWORD = "Admin123!";
// Demo/seed accounts in this dev DB (see packages/core/scripts/seed-demo.ts) all
// share this password regardless of role.
const DEMO_PASSWORD = "Demo123!";

async function login(
  page: import("@playwright/test").Page,
  email: string,
  password: string
) {
  // If a prior session is already authenticated, navigating straight to
  // /login redirects away before the form ever renders. Log out first (via
  // the app's own Logout button) so the login form actually appears.
  const logoutButton = page.getByRole("button", { name: /logout/i });
  if (await logoutButton.count()) {
    await logoutButton.click();
    await page.waitForURL((url) => url.pathname.startsWith("/login"), { timeout: 15000 }).catch(() => {});
  }
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 });
}

async function loginAsAdmin(page: import("@playwright/test").Page) {
  await login(page, ADMIN_EMAIL, ADMIN_PASSWORD);
}

// The app stores its JWT in a zustand-persisted localStorage entry
// ("auth-storage") rather than a cookie, and the api-client attaches it as
// an `Authorization: Bearer <token>` header on every fetch. page.request
// calls bypass the app's fetch wrapper entirely, so direct API calls made
// from a test need to read that token out of localStorage and forward it
// themselves to hit authenticated endpoints.
async function getAuthHeaders(
  page: import("@playwright/test").Page
): Promise<Record<string, string>> {
  const token = await page.evaluate(() => {
    try {
      const raw = window.localStorage.getItem("auth-storage");
      if (!raw) return null;
      return JSON.parse(raw)?.state?.token ?? null;
    } catch {
      return null;
    }
  });
  return token ? { Authorization: `Bearer ${token}` } : {};
}

test.describe("FC-AUDIT-CAREPLANS GATE-2 regression", () => {
  test("care plan detail Edit link navigates to EditCarePlanPage (not 404)", async ({ page }) => {
    await loginAsAdmin(page);

    // Fetch a real care plan id via the authenticated API context so the
    // test doesn't depend on hardcoded seed data ids.
    const res = await page.request.get("/api/care-plans?limit=1", {
      headers: await getAuthHeaders(page),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const carePlanId = body.items?.[0]?.id;
    test.skip(!carePlanId, "No care plans available to test against");

    await page.goto(`/care-plans/${carePlanId}`);
    await expect(page.getByText(/not found/i)).toHaveCount(0);

    const editLink = page.getByRole("link", { name: /edit/i }).first();
    await editLink.click();

    await page.waitForURL(new RegExp(`/care-plans/${carePlanId}/edit$`), { timeout: 10000 });
    await expect(page.getByText(/not found/i)).toHaveCount(0);
  });

  test("caregiver tasks page renders", async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/caregiver/tasks");
    await expect(page.getByText(/not found/i)).toHaveCount(0);
    // Page shell should render some task-list heading/content, not a blank/error screen.
    await expect(page.locator("body")).toBeVisible();
  });

  test("signature capture unblocks Complete Task submission", async ({ page }) => {
    // IMPORTANT: CaregiverTasksPage.tsx (the /caregiver/tasks UI this test
    // drives) always queries useTasks({ assignedCaregiverId: <logged-in user
    // id>, scheduledDateFrom: today, scheduledDateTo: today }) — i.e. it only
    // ever shows tasks assigned to whoever is currently logged in, scheduled
    // for TODAY. A task discovered via an unfiltered
    // `/api/tasks?requiresSignature=true` query (as this test previously did)
    // can easily be assigned to a different caregiver and/or scheduled on a
    // different date than "today" — in which case it will NEVER appear on
    // this page no matter how pagination/filters are tweaked, because the
    // page's own query to the backend excludes it before any rendering
    // happens. That is dev-DB data drift (the seed task's static
    // scheduledDate ages past "today", and it's assigned to a demo caregiver
    // account with no login), not a CaregiverTasksPage bug.
    //
    // A second, more fundamental gotcha found while fixing this test: you
    // CANNOT simply assign the freshly-created task to "whoever is currently
    // logged in" if that's the admin account. `task_instances.assigned_caregiver_id`
    // has a real FK constraint against the `caregivers` table (NOT `users`),
    // and the seeded admin/SUPER_ADMIN login has no corresponding `caregivers`
    // row — POST /api/tasks 500s (ZodError/FK violation surfacing as a generic
    // 500 via the shared handleError swallow, not even a clean 400). Seeded
    // CAREGIVER-role accounts (e.g. caregiver@tx.folkcare.example) DO have a
    // matching `caregivers.id` (same UUID as their `users.id` in this seed),
    // but that role's permission set lacks `tasks:create` — only an
    // admin/coordinator can create tasks. So the correct flow is:
    //   1. Discover a real caregiver dynamically via GET /api/caregivers
    //      while authenticated as admin (has tasks:create).
    //   2. Create the task as admin, assigned to that caregiver's id.
    //   3. Switch the browser session to log in AS that caregiver before
    //      driving /caregiver/tasks, since the page filters strictly by the
    //      logged-in user's own id.
    await loginAsAdmin(page);
    const adminAuthHeaders = await getAuthHeaders(page);

    const caregiversRes = await page.request.get("/api/caregivers?limit=1", {
      headers: adminAuthHeaders,
    });
    expect(caregiversRes.status()).toBe(200);
    const caregiversBody = await caregiversRes.json();
    const caregiver = caregiversBody.items?.[0];
    test.skip(!caregiver?.id || !caregiver?.email, "No caregiver available to assign a test task to");

    const carePlansRes = await page.request.get("/api/care-plans?limit=1", {
      headers: adminAuthHeaders,
    });
    expect(carePlansRes.status()).toBe(200);
    const carePlansBody = await carePlansRes.json();
    const carePlan = carePlansBody.items?.[0];
    test.skip(!carePlan, "No care plan available to attach a test task to");

    const todayIso = new Date().toISOString().slice(0, 10);
    const taskName = `E2E Signature Task ${Date.now()}`;
    const createRes = await page.request.post("/api/tasks", {
      headers: adminAuthHeaders,
      data: {
        carePlanId: carePlan.id,
        clientId: carePlan.clientId,
        assignedCaregiverId: caregiver.id,
        name: taskName,
        description: "E2E-created task requiring a signature to complete",
        category: "OTHER",
        instructions: "Complete this task to verify signature-gated submission",
        scheduledDate: todayIso,
        requiredSignature: true,
        requiredNote: false,
      },
    });
    expect(createRes.status()).toBe(201);
    const task = await createRes.json();

    // Switch sessions: log in as the caregiver the task is actually assigned
    // to, since /caregiver/tasks only ever shows the logged-in user's own tasks.
    await login(page, caregiver.email, DEMO_PASSWORD);

    // REAL PRODUCT BUG FOUND (flagged separately, not masked here): the
    // /caregiver/tasks list page (CaregiverTasksPage.tsx) renders each task
    // via <TaskCard showCompleteButton={true} .../>, and TaskCard's own
    // "Complete Task" button (TaskCard.tsx) calls completeTask.mutateAsync()
    // DIRECTLY with only a completionNote — it never opens
    // TaskCompletionModal (the component that actually captures a signature)
    // and never checks task.requiredSignature before firing the request.
    // CaregiverTasksPage.tsx even imports TaskCompletionModal and declares
    // `selectedTask` state for it, but NOTHING ever calls setSelectedTask —
    // that modal is permanently dead code on this page. The backend DOES
    // correctly reject the resulting request (CarePlanValidator.validateTaskCompletion
    // throws when requiredSignature is true and no signature was submitted —
    // care-plan-service.ts:445), but TaskCard's handleComplete swallows that
    // error silently (`catch { /* handled by the mutation */ }`), so a
    // caregiver clicking "Complete Task" on this list view for a
    // signature-required task gets no feedback and can never actually
    // complete the task from here. The properly-wired flow lives on
    // TaskDetailPage ("/tasks/:id"), which this test now drives directly via
    // deep link — this is the one UI path where the signature-gating
    // actually works end-to-end today.
    await page.goto(`/tasks/${task.id}`);
    await expect(page.getByText(/not found/i)).toHaveCount(0);

    const openModalButton = page.getByRole("button", { name: /complete task/i });
    await expect(openModalButton).toBeVisible();
    await openModalButton.click();

    // The modal is a plain fixed-position overlay (no role="dialog"), so
    // scope the completion button to within it to avoid matching the
    // page's own "Complete Task" button underneath.
    const modal = page.locator(".fixed.inset-0");
    await expect(modal).toBeVisible();
    const completeButton = modal.getByRole("button", { name: /complete task/i });
    await expect(completeButton).toBeDisabled();

    // Draw a stroke on the signature canvas using pointer events.
    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Signature canvas has no bounding box");

    await page.mouse.move(box.x + 10, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + 100, box.y + 80, { steps: 10 });
    await page.mouse.move(box.x + 200, box.y + 40, { steps: 10 });
    await page.mouse.up();

    const saveSignatureButton = page.getByRole("button", { name: /^save$/i });
    await expect(saveSignatureButton).toBeEnabled();
    await saveSignatureButton.click();

    await expect(completeButton).toBeEnabled();
    await completeButton.click();

    // Submission should succeed: modal closes, no error toast shown, and the
    // page's own completion button disappears once the task is COMPLETED.
    await expect(modal).toHaveCount(0, { timeout: 10000 });
    await expect(page.getByText(/failed to complete task/i)).toHaveCount(0);
  });

  test("list view (CaregiverTasksPage) gates signature-required Complete Task button", async ({ page }) => {
    // Direct regression check for the bug fixed in TaskCard.tsx /
    // CaregiverTasksPage.tsx: the list view's own "Complete Task" button
    // (rendered by TaskCard, NOT the TaskDetailPage deep-link used by the
    // previous test) must now open TaskCompletionModal for
    // requiredSignature tasks instead of firing a direct completeTask call
    // that the backend silently rejects. This test drives /caregiver/tasks
    // itself to prove the fix on the actual page where the bug lived.
    await loginAsAdmin(page);
    const adminAuthHeaders = await getAuthHeaders(page);

    const caregiversRes = await page.request.get("/api/caregivers?limit=1", {
      headers: adminAuthHeaders,
    });
    expect(caregiversRes.status()).toBe(200);
    const caregiversBody = await caregiversRes.json();
    const caregiver = caregiversBody.items?.[0];
    test.skip(!caregiver?.id || !caregiver?.email, "No caregiver available to assign a test task to");

    const carePlansRes = await page.request.get("/api/care-plans?limit=1", {
      headers: adminAuthHeaders,
    });
    expect(carePlansRes.status()).toBe(200);
    const carePlansBody = await carePlansRes.json();
    const carePlan = carePlansBody.items?.[0];
    test.skip(!carePlan, "No care plan available to attach a test task to");

    const todayIso = new Date().toISOString().slice(0, 10);
    const taskName = `E2E List-View Signature Task ${Date.now()}`;
    const createRes = await page.request.post("/api/tasks", {
      headers: adminAuthHeaders,
      data: {
        carePlanId: carePlan.id,
        clientId: carePlan.clientId,
        assignedCaregiverId: caregiver.id,
        name: taskName,
        description: "E2E-created task requiring a signature, completed via the list view",
        category: "OTHER",
        instructions: "Complete this task from /caregiver/tasks to verify list-view signature gating",
        scheduledDate: todayIso,
        requiredSignature: true,
        requiredNote: false,
      },
    });
    expect(createRes.status()).toBe(201);
    const task = await createRes.json();

    // Switch sessions: log in as the caregiver the task is assigned to, since
    // /caregiver/tasks only ever shows the logged-in user's own tasks for today.
    await login(page, caregiver.email, DEMO_PASSWORD);

    await page.goto("/caregiver/tasks");
    await expect(page.getByText(/not found/i)).toHaveCount(0);

    // Find this task's card by its unique name, then click ITS "Complete
    // Task" button (the TaskCard-rendered one, not TaskDetailPage's).
    const taskCard = page.locator("div", { hasText: taskName }).filter({
      has: page.getByRole("button", { name: /complete task/i }),
    }).last();
    const completeTaskButton = taskCard.getByRole("button", { name: /complete task/i });
    await expect(completeTaskButton).toBeVisible();
    await completeTaskButton.click();

    // BEFORE the fix: this click fired completeTask.mutateAsync() directly,
    // the backend 400'd on the missing signature, and the error was
    // swallowed — no modal, no toast, nothing. AFTER the fix: clicking
    // "Complete Task" on a requiredSignature task from the list view must
    // open TaskCompletionModal instead.
    const modal = page.locator(".fixed.inset-0");
    await expect(modal).toBeVisible({ timeout: 5000 });
    await expect(modal.getByText(/signature required/i)).toBeVisible();

    const modalCompleteButton = modal.getByRole("button", { name: /complete task/i });
    await expect(modalCompleteButton).toBeDisabled();

    // Draw a stroke on the signature canvas and confirm the full completion
    // flow also works end-to-end from this entry point.
    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    if (!box) throw new Error("Signature canvas has no bounding box");

    await page.mouse.move(box.x + 10, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + 100, box.y + 80, { steps: 10 });
    await page.mouse.move(box.x + 200, box.y + 40, { steps: 10 });
    await page.mouse.up();

    const saveSignatureButton = page.getByRole("button", { name: /^save$/i });
    await expect(saveSignatureButton).toBeEnabled();
    await saveSignatureButton.click();

    await expect(modalCompleteButton).toBeEnabled();
    await modalCompleteButton.click();

    await expect(modal).toHaveCount(0, { timeout: 10000 });
    await expect(page.getByText(/failed to complete task/i)).toHaveCount(0);
  });

  test("create a care plan from template end-to-end", async ({ page }) => {
    await loginAsAdmin(page);

    // Find a real client to assign the new care plan to via the authenticated
    // API context so the test isn't coupled to a specific seeded client id.
    const clientsRes = await page.request.get("/api/clients?limit=1", {
      headers: await getAuthHeaders(page),
    });
    expect(clientsRes.status()).toBe(200);
    const clientsBody = await clientsRes.json();
    // /api/clients wraps its payload in a `data` envelope, unlike
    // /api/care-plans and /api/tasks which return `items` at the top level.
    const client = clientsBody.data?.items?.[0] ?? clientsBody.items?.[0];
    test.skip(!client, "No clients available to test care plan creation against");

    await page.goto("/care-plans/from-template");
    await expect(page.getByText(/not found/i)).toHaveCount(0);

    // Templates are code-defined (CARE_PLAN_TEMPLATES), so at least one
    // template card is always present once the page renders successfully.
    const useTemplateButton = page.getByRole("button", { name: /^use template$/i }).first();
    test.skip(
      (await useTemplateButton.count()) === 0,
      "No care plan templates available to test against"
    );
    await useTemplateButton.click();

    // Preview modal opens; proceed to the customize page.
    const useThisTemplateButton = page.getByRole("button", { name: /use this template/i });
    await expect(useThisTemplateButton).toBeVisible();
    await useThisTemplateButton.click();

    await page.waitForURL(/\/care-plans\/from-template\/.+/, { timeout: 10000 });
    await expect(page.getByText(/not found/i)).toHaveCount(0);

    // Fill required fields on CustomizeTemplatePage.
    await page.getByPlaceholder("Enter client ID").fill(client.id);
    await page.getByPlaceholder("Enter care plan name").fill(
      `E2E From-Template Plan ${Date.now()}`
    );

    const createButton = page.getByRole("button", { name: /create care plan/i });
    await expect(createButton).toBeEnabled();

    const [response] = await Promise.all([
      page.waitForResponse(
        (res) => res.url().includes("/api/care-plans/from-template") && res.request().method() === "POST"
      ),
      createButton.click(),
    ]);

    expect(response.status()).toBe(201);

    // Submission should succeed: no error toast shown, and the app navigates
    // away from the customize page (to the care plans list/detail).
    await expect(page.getByText(/failed to create care plan/i)).toHaveCount(0, { timeout: 10000 });
    await page.waitForURL((url) => !url.pathname.includes("/from-template"), { timeout: 10000 });
  });
});
