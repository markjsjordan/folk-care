import { test, expect } from "@playwright/test";

// FC-AUDIT-BILLING-PAYROLL-EVV WU-1/WU-7: EVV clock-in/out server persistence.
//
// AC7 (EVV clock-in/out backend) was already fully implemented by prior
// work on this ticket. This spec verifies clock-in/out persist server-side
// (via GET /api/evv/:id afterward), not just in localStorage/UI state, by
// calling the real backend endpoints directly — see note below on why the
// caregiver UI itself isn't exercised.
//
// IMPORTANT (per TA recon, confirmed during this work unit): useClockIn/
// useClockOut (packages/web/src/verticals/time-tracking-evv/hooks/useEVVRecords.ts)
// are defined but are NOT called from any .tsx component anywhere in this
// codebase (verified via `grep -rn "useClockIn|useClockOut" packages/web/src --include=*.tsx`
// returning zero matches) — there is no actual caregiver clock-in button
// wired to them today. So "trigger clock-in" here drives the real
// POST /api/evv/clock-in endpoint directly (the same endpoint evv-api.ts's
// clockIn() would call if a UI ever wires it up), using the real
// ClockInInput/ClockOutInput shape from evv-handlers.ts
// (location + deviceInfo, not the frontend hook's drifted
// gpsCoordinates/verificationMethod shape), rather than clicking a UI
// control that does not exist.
//
// Also per TA warning: evv.types.ts was reshaped by a different, concurrent
// in-flight ticket (status -> recordStatus, verificationMethod ->
// verificationLevel) but useEVVRecords.ts/evv-api.ts frontend hooks still
// reference the OLD field names. That type drift is explicitly out of scope
// for this ticket. This spec talks to the raw HTTP API with loosely-typed
// (`unknown`) request/response bodies to sidestep the drift entirely rather
// than touching evv.types.ts or useEVVRecords.ts.
//
// WU-1 UPDATE: the previous version of this spec sourced visitId from the
// FIRST existing EVV record returned by GET /api/evv — but every visit with
// an existing EVV record already has a COMPLETE record from demo seed data,
// so clock-in always rejected with 400 and the spec always test.skip()'d,
// never exercising a real pass/fail. Fixed by seeding a dedicated clockable
// visit fixture (e2e/setup/seeds/evv-clock-persistence.seed.ts) — status
// ASSIGNED, geocoded service address, a caregiver/client pair with NO
// existing EVV record — and sourcing visitId from that fixture directly
// instead of from GET /api/evv. The seed is idempotent (defensively deletes
// any leftover EVV record/time entries for the fixture visit on each run),
// so this spec produces a real PASS on every run, not a skip.

const ADMIN_EMAIL = "admin@folkcare.example";
const ADMIN_PASSWORD = "Admin123!";

// Fixture visit seeded by e2e/setup/seeds/evv-clock-persistence.seed.ts —
// status ASSIGNED, geocoded TX address, caregiver/client pair with no
// existing EVV record. Seeded automatically in beforeAll below (idempotent:
// safe to re-run every pass).
const FIXTURE_VISIT_ID = "00000000-ee20-4000-8000-0000000fa001";
const FIXTURE_CAREGIVER_ID = "00000000-ee20-4000-8000-0000000ca001";
// Matches the fixture client's geocoded service address exactly (100
// Congress Ave, Austin, TX) so clock-in/out land inside the geofence and
// verification.passed comes back true rather than a geofence warning.
const FIXTURE_LOCATION = { latitude: 30.2672, longitude: -97.7431, accuracy: 10 };

async function loginAsAdmin(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: /sign in|log in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 });
}

async function apiGet(page: import("@playwright/test").Page, url: string) {
  return page.evaluate(async (u) => {
    const raw = localStorage.getItem("auth-storage");
    const token = raw ? JSON.parse(raw)?.state?.token : null;
    const res = await fetch(u, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  }, url);
}

// Body typed loosely (`unknown`, not the drifted EVVRecord/clockIn typings)
// precisely to work around the concurrent ticket's in-flight type rename —
// scoped to this test file only, per the TA's explicit instruction not to
// touch evv.types.ts or useEVVRecords.ts.
async function apiPost(page: import("@playwright/test").Page, url: string, data: unknown) {
  return page.evaluate(
    async ({ u, d }) => {
      const raw = localStorage.getItem("auth-storage");
      const token = raw ? JSON.parse(raw)?.state?.token : null;
      const res = await fetch(u, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(d),
      });
      const body = await res.json().catch(() => null);
      return { status: res.status, body };
    },
    { u: url, d: data }
  );
}

test.describe("FC-AUDIT-BILLING-PAYROLL-EVV: EVV clock-in/out server persistence", () => {
  test.beforeAll(async () => {
    // Re-seed the clockable visit fixture fresh before every run so this
    // spec never depends on leftover state from a previous pass (the seed
    // defensively deletes any EVV record/time entries for this visit and
    // resets its status to ASSIGNED).
    const { execFileSync } = await import("node:child_process");
    execFileSync(
      "npx",
      ["tsx", "scripts/run-evv-fixture-seed.ts"],
      { cwd: process.cwd(), stdio: "inherit" }
    );
  });

  test("clock-in persists server-side, then clock-out persists server-side", async ({ page }) => {
    await loginAsAdmin(page);

    const clockInRes = await apiPost(page, "/api/evv/clock-in", {
      visitId: FIXTURE_VISIT_ID,
      caregiverId: FIXTURE_CAREGIVER_ID,
      location: { ...FIXTURE_LOCATION, timestamp: new Date().toISOString(), method: "GPS", mockLocationDetected: false },
      deviceInfo: { deviceId: "e2e-test-device", deviceModel: "Playwright", deviceOS: "TestOS", osVersion: "1.0", appVersion: "1.0" },
    });

    expect(clockInRes.status, `Clock-in failed: ${JSON.stringify(clockInRes.body)}`).toBe(201);

    const evvRecordId: string | undefined = clockInRes.body?.evvRecordId;
    expect(evvRecordId).toBeTruthy();
    // Clock-in verification.passed is expected false at this point (the
    // MISSING_CLOCK_OUT issue is raised by design until clock-out happens);
    // what we assert here is that location/geofence verification succeeded.
    expect(clockInRes.body?.location?.isWithinGeofence).toBe(true);

    // Verify server-side persistence via a follow-up GET — not UI/localStorage.
    const afterClockIn = await apiGet(page, `/api/evv/${evvRecordId}`);
    expect(afterClockIn.status).toBe(200);
    expect(afterClockIn.body?.id).toBe(evvRecordId);
    expect(afterClockIn.body?.clockInTime).toBeTruthy();
    expect(afterClockIn.body?.recordStatus).toBe("PENDING");

    // --- Clock out ---
    const clockOutRes = await apiPost(page, `/api/evv/${evvRecordId}/clock-out`, {
      visitId: FIXTURE_VISIT_ID,
      caregiverId: FIXTURE_CAREGIVER_ID,
      location: { ...FIXTURE_LOCATION, timestamp: new Date().toISOString(), method: "GPS", mockLocationDetected: false },
      deviceInfo: { deviceId: "e2e-test-device", deviceModel: "Playwright", deviceOS: "TestOS", osVersion: "1.0", appVersion: "1.0" },
    });
    expect(clockOutRes.status, `Clock-out failed: ${JSON.stringify(clockOutRes.body)}`).toBe(200);
    expect(clockOutRes.body?.verification?.passed).toBe(true);

    // Re-verify server-side persistence after clock-out.
    const afterClockOut = await apiGet(page, `/api/evv/${evvRecordId}`);
    expect(afterClockOut.status).toBe(200);
    expect(afterClockOut.body?.id).toBe(evvRecordId);
    expect(afterClockOut.body?.clockOutTime).toBeTruthy();
    expect(afterClockOut.body?.recordStatus).toBe("COMPLETE");
  });
});
