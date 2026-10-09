# TA Spec: Standardize Search Input Debouncing (Clients, Caregivers)

**Ticket:** FC-SEARCH-001
**Status:** GATE-1 pending approval
**TA recon date:** 2026-10-09
**Role:** Technical Architect (read-only recon — no code written)

## Root cause (verified against live code, not assumed)

The user's symptom — "search refreshes after every keystroke, only lets you
type one letter at a time" — is caused by a missing **debounce layer** between
the raw `<input>` value and the `onFiltersChange` callback that feeds a
React Query hook. Confirmed by reading all five search components and their
consuming pages/hooks:

| Component | File | Debounced? | Consuming page(s) | Query hook | queryKey includes raw filters? |
|---|---|---|---|---|---|
| `ClientSearch` | `packages/web/src/verticals/client-demographics/components/ClientSearch.tsx:50-56` | ❌ No — `onChange` calls `onFiltersChange` directly | `ClientList.tsx:98`, `TaskClientPicker.tsx:24` | `useClients` | Yes |
| `CaregiverSearch` | `packages/web/src/verticals/caregivers/components/CaregiverSearch.tsx:86-92` | ❌ No — same pattern | `CaregiverList.tsx:104` | `useCaregivers` (`useCaregivers.ts:24`) | Yes |
| `CarePlanSearch` | `packages/web/src/verticals/care-plans/components/CarePlanSearch.tsx:46-59` | ✅ Yes — local `queryInput` state + 300ms `setTimeout` | `CarePlanList.tsx` | `useCarePlans` | Debounced before reaching queryKey |
| `TaskSearchFilters` (inline in `TaskInstanceList.tsx:28-49`) | `packages/web/src/verticals/care-plans/components/TaskInstanceList.tsx` | ✅ Yes — identical local-state + 300ms pattern | `TaskList.tsx` → `TaskInstanceList` | `useTasks` | Debounced before reaching queryKey |
| Scheduling search (inline in `VisitList.tsx:38-47`) | `packages/web/src/verticals/scheduling-visits/pages/VisitList.tsx` | ✅ Yes — but different approach: debounces a **client-side filter** over an already-fetched 30-day window, not a server refetch | `VisitList.tsx` | `useVisits` (fetched once with a static default date range, filtered client-side) | N/A — search never touches the query key |

**Mechanism of the bug:** `useCaregivers(filters)` / `useClients(filters)` use
`queryKey: ['caregivers', filters, page, limit]` (`useCaregivers.ts:24`). Every
keystroke creates a new `filters` object via `onFiltersChange({ ...filters,
query: e.target.value })`, which is a new React Query key, which fires an
immediate network refetch — on every single character. This is exactly the
"one letter at a time, refreshes after each click" symptom reported.

**Why Care Plans and Tasks don't have this bug:** `CarePlanSearch.tsx` and the
task search inside `TaskInstanceList.tsx` already hold the raw input in local
`useState` (`queryInput`) and only call `onFiltersChange` — the thing that
changes the query key — after a 300ms idle timer. Note: these two components
were fixed in the `showcase/` static demo by recent commits (`84b5c534`,
`ff1f64ee`), but the **same pattern already independently exists in
`packages/web`** (the real SaaS app) — it was not copied from showcase, it's
parallel prior work. The user's base of comparison ("Tasks and Scheduling are
most accurate") matches what's actually in `packages/web`.

**Corrected premise vs. ticket text:** The user named "Clients, Caregivers,
Scheduling, Care Plans, Tasks" as the five pages to unify. Recon shows 3 of
5 (Scheduling, Care Plans, Tasks) are already correct in `packages/web`. Only
**Clients** and **Caregivers** need the fix. Scope the ticket to those two.

**Side effect already in scope:** `TaskClientPicker.tsx:17-24` (the "pick a
client" step shown when visiting the Tasks page in `'client'` mode) directly
reuses the broken `ClientSearch` component. Fixing `ClientSearch` once fixes
both the Clients list page AND this step of the Tasks page for free — no
separate work unit needed, but QA should verify both call sites.

## Recommended approach

**Do NOT copy the Scheduling pattern (client-side filter over a prefetched
window).** Clients and Caregivers lists are not naturally bounded by a date
range the way visits are — a client-side-filter approach would require
fetching the entire (potentially large) caregiver/client roster up front,
which doesn't fit the existing paginated `useClients`/`useCaregivers(filters,
page, limit)` signature and would be a larger behavioral change than the
ticket calls for.

**Copy the `CarePlanSearch.tsx` / `TaskSearchFilters` pattern exactly** — it
is already proven, already in this codebase twice, and requires the smallest
possible diff: add local `queryInput` state + a `useEffect` to sync it when
`filters.query` changes externally (e.g. "Clear All") + a second `useEffect`
with a 300ms `setTimeout` that calls `onFiltersChange` only when the debounced
value actually differs from the current filter. Rejected alternative:
a generic `useDebouncedValue` hook — would touch more files for the same
result and isn't how the two reference implementations did it; introducing
a new shared hook is a reasonable future cleanup but out of scope for this
ticket (note as a follow-up, don't block on it).

## work_units[]

### WU-1: Fix `ClientSearch.tsx`
- **files_to_touch:** `packages/web/src/verticals/client-demographics/components/ClientSearch.tsx`
- **exact_change:**
  - Add `const [queryInput, setQueryInput] = React.useState(filters.query || '');`
  - Add sync effect: `React.useEffect(() => { setQueryInput(filters.query || ''); }, [filters.query]);`
  - Add debounce effect (mirror `CarePlanSearch.tsx:52-59` verbatim):
    ```ts
    React.useEffect(() => {
      const timer = setTimeout(() => {
        if ((filters.query || '') !== queryInput) {
          onFiltersChange({ ...filters, query: queryInput || undefined });
        }
      }, 300);
      return () => clearTimeout(timer);
    }, [queryInput]);
    ```
  - Change the `<input>` `value={filters.query || ''}` → `value={queryInput}`,
    and `onChange` → `(e) => setQueryInput(e.target.value)`.
  - Change the clear button's `onClick` from
    `() => onFiltersChange({ ...filters, query: undefined })` →
    `() => setQueryInput('')`.
  - Update `hasAnyActiveFilter` to read `queryInput` instead of `filters.query`
    (mirror `CarePlanSearch.tsx:75`).
  - Update `handleClearFilters` to also `setQueryInput('')` before calling
    `onFiltersChange({})` (mirror `CarePlanSearch.tsx:77-80`).
- **done_when:** Typing "Jane" in the Clients search box produces exactly ONE
  network request (visible in browser devtools Network tab) ~300ms after the
  last keystroke, not one request per character. Existing advanced filters
  (status/city/state) still work unchanged.

### WU-2: Fix `CaregiverSearch.tsx`
- **files_to_touch:** `packages/web/src/verticals/caregivers/components/CaregiverSearch.tsx`
- **exact_change:** Identical transformation to WU-1, applied to this file's
  equivalent lines (state/effects added near the top of the component body;
  input bound to `queryInput`; clear button calls `setQueryInput('')`;
  `hasAnyActiveFilter` and `handleClearFilters` updated the same way).
- **done_when:** Typing "Maria" in the Caregivers search box produces exactly
  ONE network request ~300ms after the last keystroke. Existing advanced
  filters (status/role/complianceStatus) still work unchanged.

### WU-3: Regression-verify `TaskClientPicker.tsx` (no code change expected)
- **files_to_touch:** none (verification only)
- **exact_change:** N/A — this consumer imports `ClientSearch` from
  `@/verticals/client-demographics` (`TaskClientPicker.tsx:3`) and gets the
  WU-1 fix automatically. Junior must manually exercise the Tasks page →
  "View All Clients" / client-picker step after WU-1 lands and confirm typing
  a name debounces correctly there too, since it's a second call site.
- **done_when:** Typing in the Tasks page's client picker search also
  debounces to one request per 300ms pause, matching WU-1's verification.

## interfaces

No type signatures, API shapes, or DB columns change. `ClientSearchFilters`
and `CaregiverSearchFilters` are untouched — `onFiltersChange` keeps the exact
same shape and call contract; only the TIMING of when it's called changes
(after a pause instead of on every keystroke). This is the same reason
`CarePlanSearch` and `TaskSearchFilters` didn't need any hook/type changes
when they were implemented.

## sequencing

WU-1 and WU-2 touch **different files** (`ClientSearch.tsx` vs
`CaregiverSearch.tsx`) — fully parallel-safe, dispatch both juniors
simultaneously. WU-3 has no file changes and is a verification pass that must
run AFTER WU-1 lands (it depends on `ClientSearch.tsx` being fixed first) —
fold into Senior/QA for WU-1, not a separate junior dispatch.

## test_hooks

- **QA/Playwright assertions:**
  - On `/clients`: type a 4+ character name one character at a time with
    short pauses; assert the network/request-count stays at 1 per pause
    cycle (mock or spy on the fetch call, or assert via a request-count
    data attribute if the app exposes one).
  - On `/caregivers`: same assertion.
  - On the Tasks page client-picker step: same assertion.
  - Regression: advanced filter dropdowns (status, role, city, state,
    compliance) on both pages still filter correctly and `Clear All` still
    resets both `queryInput` and the advanced filters.
- **Suggested routes:** `/clients`, `/caregivers`, `/tasks` (client-picker
  mode).
- **Suggested selectors:** the search `<input>` (placeholder text
  `"Search by name or client number..."` / `"Search by name or employee
  number..."`), and the `X` clear button (`aria-label="Clear search"`).

## risks

- **Stale-closure risk:** the debounce `useEffect` compares `filters.query`
  inside the timer callback — if `filters` changes for an unrelated reason
  (e.g. an advanced filter toggle) while the user is mid-typing, the
  reference implementation (`CarePlanSearch.tsx`) already handles this
  correctly by spreading `...filters` fresh inside the timeout closure. No
  new risk beyond what the proven pattern already carries.
- **No risk to `TaskSearchFilters` or `VisitList`/Scheduling** — this ticket
  does not touch either file; they are the reference pattern, not a target.
- **Do not touch `showcase/`** — that's a separate static-demo app with its
  own already-fixed copies (`84b5c534`, `ff1f64ee`); this ticket is scoped
  entirely to `packages/web` (the real SaaS app), which has a parallel but
  independent bug.
- **Follow-up (not in scope):** both reference implementations duplicate the
  same ~10-line debounce boilerplate three times now (Care Plans, Tasks,
  and after this ticket, Clients + Caregivers = 4 times). A shared
  `useDebouncedQuery` hook in `packages/web/src/core/hooks` would de-duplicate
  this, but introducing it now would make the diff bigger than necessary for
  a bug fix ticket. Recommend as FC-SEARCH-002 (tech debt) after this lands.

## Acceptance criteria (for GATE-1)

1. Typing in the Clients page search bar accepts full words without
   refetching per keystroke (300ms debounce, matching Tasks/Care
   Plans/Scheduling).
2. Typing in the Caregivers page search bar — same.
3. The Tasks page's client-picker step (which reuses `ClientSearch`) also
   benefits, verified manually.
4. All existing advanced filters on both pages continue to work unchanged.
5. No changes to Scheduling, Care Plans, or Tasks' own search — they are
   already correct and serve as the reference pattern.
