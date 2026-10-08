# FC-16: Work Breakdown Structure & Tracking

**Project:** Performance Optimization (Caching, Lazy-Load, DB Indexes)  
**Start Date:** TBD (Gate approval)  
**Target Completion:** 4 weeks  
**Total Effort:** 80–120 story points

---

## WBS Hierarchy

```
FC-16: Performance Optimization
├── Vector 1: Database Indexing (WU-1 to WU-3)
│   ├── WU-1: CRITICAL Indexes (3pts)
│   ├── WU-2: HIGH Priority Indexes (2pts)
│   └── WU-3: Specialty Indexes (1pt)
│
├── Vector 2: Redis Caching (WU-4 to WU-7)
│   ├── WU-4: Infrastructure Setup (5pts)
│   ├── WU-5: Cache Client Metadata (3pts)
│   ├── WU-6: Cache Caregiver Schedules (4pts)
│   └── WU-7: Cache Billing Aggregates (4pts)
│
└── Vector 3: Frontend Optimization (WU-8 to WU-14)
    ├── WU-8: Route-Level Code-Splitting (5pts)
    ├── WU-9: Dashboard Lazy-Loading (4pts)
    ├── WU-10: Modal Lazy-Loading (3pts)
    ├── WU-11: Icon Sprite On-Demand (3pts)
    ├── WU-12: Virtual Scrolling (2pts)
    ├── WU-13: React.memo Optimization (3pts)
    └── WU-14: Tree-Shake Dependencies (2pts)

TESTING & INTEGRATION (WU-15 to WU-18)
├── WU-15: Phase 1 Testing (Index validation) (2pts)
├── WU-16: Phase 2 Testing (Cache integration) (3pts)
├── WU-17: Phase 3 Testing (Frontend perf) (3pts)
└── WU-18: Production Readiness (2pts)
```

---

## Detailed Work Unit Tracker

### VECTOR 1: DATABASE INDEXING

#### WU-1: CRITICAL Indexes (3 story points)
**Effort:** ~6 hours  
**Owner:** Senior Backend Engineer / DBA  
**Blocker:** None  
**Parallel:** Can start immediately  

**Tasks:**
- [ ] SQL scripts for 3 CRITICAL indexes prepared
- [ ] Staging index creation validated (no locks)
- [ ] EXPLAIN ANALYZE shows index usage
- [ ] Performance baseline taken (before/after queries)
- [ ] Production deployment window scheduled

**SQL Scripts Ready:**
```
1. CREATE INDEX CONCURRENTLY idx_clients_status
2. CREATE INDEX CONCURRENTLY idx_visit_caregiver_date
3. CREATE INDEX CONCURRENTLY idx_billing_client_date
```

**Definition of Done:**
- All 3 indexes created on production
- Queries show index usage in EXPLAIN (not seq scan)
- Dashboard load time reduced by 50%+ in staging

---

#### WU-2: HIGH Priority Indexes (2 story points)
**Effort:** ~4 hours  
**Owner:** Senior Backend Engineer / DBA  
**Blocker:** WU-1 complete  
**Parallel:** WU-4 (can overlap)  

**Tasks:**
- [ ] SQL scripts for 3 HIGH indexes prepared
- [ ] Staging validation: no new lock conflicts
- [ ] Performance improvement measured
- [ ] Production deployment scheduled (1 week after WU-1)

**SQL Scripts Ready:**
```
1. CREATE INDEX CONCURRENTLY idx_user_roles_user
2. CREATE INDEX CONCURRENTLY idx_care_plan_notes_plan_date
3. CREATE INDEX CONCURRENTLY idx_sessions_user_expires
```

**Definition of Done:**
- Permission check queries < 10ms (was 45ms)
- Note retrieval < 20ms (was 80–120ms)
- Session cleanup < 2s (was 15–20s)

---

#### WU-3: Specialty Indexes (1 story point)
**Effort:** ~2 hours  
**Owner:** Senior Backend Engineer / DBA  
**Blocker:** WU-2 complete  
**Parallel:** WU-6, WU-7  

**Tasks:**
- [ ] Partial index for scheduling status created
- [ ] Index bloat monitoring configured
- [ ] Index maintenance scheduled (weekly analyze)

**SQL Scripts Ready:**
```
1. CREATE INDEX CONCURRENTLY idx_scheduling_status_date
   ON public.scheduling_visits (status, scheduled_date)
   WHERE status IN ('PENDING', 'UNASSIGNED');
```

**Definition of Done:**
- Partial index created and in use
- Storage footprint optimized (<500MB on 10M rows)

---

### VECTOR 2: REDIS CACHING

#### WU-4: Redis Infrastructure Setup (5 story points)
**Effort:** ~10 hours  
**Owner:** DevOps / Platform Engineer  
**Blocker:** None  
**Parallel:** WU-1, WU-8  

**Tasks:**
- [ ] Redis cluster deployed (3+ nodes, staging + prod)
- [ ] Connection pooling configured (fail-fast, retries)
- [ ] Memory limits set (eviction: allkeys-lru)
- [ ] Monitoring dashboards created (hit rate, evictions, latency)
- [ ] Runbook for cache flush/restart documented
- [ ] Backup & recovery procedures tested

**Configuration Checklist:**
- [ ] Redis version: 7.0+
- [ ] Max memory: 2GB per node
- [ ] Eviction policy: allkeys-lru
- [ ] Appendonly: yes (persistence)
- [ ] Sentinel enabled (failover)
- [ ] Metrics exported to monitoring system

**Definition of Done:**
- Redis cluster operational in staging
- Failover tested (node down → reconnect works)
- Hit/miss metrics exporting to monitoring
- Zero data loss after restart

---

#### WU-5: Cache Client Metadata (3 story points)
**Effort:** ~6 hours  
**Owner:** Backend Engineer  
**Blocker:** WU-4 complete  
**Parallel:** WU-6, WU-7  

**Tasks:**
- [ ] Cache utility function created (getCachedData wrapper)
- [ ] GET /api/clients/{id} decorated with cache
- [ ] Update handler invalidates cache on write
- [ ] Unit tests for hit/miss/invalidation scenarios
- [ ] Staging load test: 100x requests, measure latency
- [ ] Code review + merge

**Implementation Checklist:**
- [ ] Cache key: `client:{id}:meta`
- [ ] TTL: 1 hour
- [ ] Fields cached: id, name, status, phone, email, created_at
- [ ] Invalidation: on client update (immediate)
- [ ] Fallback: if Redis unavailable, fallback to DB

**Definition of Done:**
- First request (miss): 45ms (DB query)
- Second request (hit): 2ms (Redis)
- Hit rate in staging: >70% after warm-up
- Cache invalidation: < 500ms

---

#### WU-6: Cache Caregiver Schedules (4 story points)
**Effort:** ~8 hours  
**Owner:** Backend Engineer  
**Blocker:** WU-4 complete  
**Parallel:** WU-5, WU-7  

**Tasks:**
- [ ] Complex schedule query refactored into getCaregiverSchedule()
- [ ] GET /api/caregivers/{id}/schedule?date=YYYY-MM-DD cached
- [ ] Multi-level invalidation: visit creates/updates, exceptions
- [ ] Unit & integration tests
- [ ] Staging load test: 100x daily schedules fetched
- [ ] Production performance baseline set

**Implementation Checklist:**
- [ ] Cache key: `caregiver:{id}:schedule:{date}`
- [ ] TTL: 30 minutes (schedules change frequently)
- [ ] Includes: visits, availability, exceptions
- [ ] Invalidation: event-driven on visit/exception changes
- [ ] Event queue for async invalidation

**Definition of Done:**
- Schedule query: 120–150ms (miss) → 4ms (hit)
- Hit rate: >70%
- Event propagation: < 500ms

---

#### WU-7: Cache Billing Aggregates (4 story points)
**Effort:** ~8 hours  
**Owner:** Backend Engineer  
**Blocker:** WU-4 complete  
**Parallel:** WU-5, WU-6  

**Tasks:**
- [ ] Billing aggregation query optimized (GROUP BY category, sum)
- [ ] GET /api/billing/{clientId}/summary?year=2026&month=09 cached
- [ ] Line item creation triggers cache invalidation
- [ ] Aggregate schema defined (count, total, avg by category)
- [ ] Unit & integration tests
- [ ] Staging: 100x billing summaries, verify cache hit

**Implementation Checklist:**
- [ ] Cache key: `billing:{clientId}:{year}-{month}:totals`
- [ ] TTL: 4 hours
- [ ] Aggregates: category, count, total, avg_amount
- [ ] Invalidation: line item creation/update/delete
- [ ] Pre-warming: nightly job to cache all active clients

**Definition of Done:**
- Aggregate query: 200ms (miss) → 5ms (hit)
- Hit rate: >70%
- Billing detail page load: 800ms (was 2.0s)

---

### VECTOR 3: FRONTEND OPTIMIZATION

#### WU-8: Route-Level Code-Splitting (5 story points)
**Effort:** ~10 hours  
**Owner:** Senior Frontend Engineer  
**Blocker:** None  
**Parallel:** WU-1, WU-4  

**Tasks:**
- [ ] React.lazy() imports for all route components
- [ ] Suspense boundaries with LoadingShell
- [ ] Route configuration updated
- [ ] Webpack code-splitting configuration verified
- [ ] Bundle analysis: before/after chunks measured
- [ ] Testing: route transitions, lazy load timing
- [ ] webpack-bundle-analyzer integration in CI

**Implementation Checklist:**
- [ ] Each route in separate chunk (dashboard, billing, scheduling, etc.)
- [ ] Suspense fallback renders quickly (< 100ms)
- [ ] Chunks lazy-loaded on route change
- [ ] No duplicate code across chunks

**Definition of Done:**
- Initial bundle: 520KB → ~250KB (52% reduction)
- Route transitions load new chunk in < 300ms
- Zero test failures, no console errors
- Bundle size monitored in CI (alert if > 220KB)

---

#### WU-9: Dashboard Lazy-Loading (4 story points)
**Effort:** ~8 hours  
**Owner:** Frontend Engineer  
**Blocker:** WU-8 complete  
**Parallel:** WU-10, WU-11  

**Tasks:**
- [ ] Each dashboard (Nurse, Coordinator, Caregiver, Admin) into separate chunk
- [ ] Dashboard router loads user role, renders matching dashboard lazily
- [ ] Suspense fallback shows skeleton while loading
- [ ] Unit tests: render correct dashboard by role
- [ ] Integration tests: route + lazy load + data fetch
- [ ] Staging test: verify only one dashboard chunk loads

**Implementation Checklist:**
- [ ] NurseDashboard.tsx → lazy chunk (95KB)
- [ ] CoordinatorDashboard.tsx → lazy chunk (110KB)
- [ ] CaregiverDashboard.tsx → lazy chunk (65KB)
- [ ] AdminDashboard.tsx → lazy chunk (80KB)
- [ ] Only user's dashboard loads on init

**Definition of Done:**
- Dashboard load: 2.8s → 1.2s (57% faster)
- First Contentful Paint: < 1.2s
- Only one dashboard chunk in bundle (280KB bundle)
- Cache chunks (service worker, HTTP cache headers)

---

#### WU-10: Modal Lazy-Loading (3 story points)
**Effort:** ~6 hours  
**Owner:** Frontend Engineer  
**Blocker:** WU-8 complete  
**Parallel:** WU-9, WU-11  

**Tasks:**
- [ ] Identify all modals (ScheduleVisitModal, EditClientModal, etc.) → 8 modals
- [ ] Each modal wrapped in lazy() + Suspense
- [ ] Modal trigger buttons show Suspense fallback while loading
- [ ] Tests: modal opens, lazy chunk loads
- [ ] Staging: verify modals don't load until opened

**Implementation Checklist:**
- [ ] ScheduleVisitModal → lazy (45KB)
- [ ] EditClientModal → lazy (38KB)
- [ ] ApprovalWorkflowModal → lazy (52KB)
- [ ] … (5 more modals)
- [ ] Modal fallback: ModalSkeleton (simple spinner)

**Definition of Done:**
- Modals don't load until user clicks (saves ~360KB initial)
- Modal opens in < 200ms
- No console errors
- Initial bundle: 520KB → ~180KB (65% reduction overall)

---

#### WU-11: Icon Sprite On-Demand Loading (3 story points)
**Effort:** ~6 hours  
**Owner:** Frontend Engineer  
**Blocker:** WU-8 complete  
**Parallel:** WU-9, WU-10  

**Tasks:**
- [ ] Icons refactored from monolithic 680KB sprite → chunked sprites
- [ ] useLazyIcon hook created (async load + cache)
- [ ] Icon components updated to use hook
- [ ] Tests: icons load, cached on second use
- [ ] Staging: verify icon sprite chunks load on-demand

**Implementation Checklist:**
- [ ] Icon sprites split by category (common, scheduling, billing, etc.)
- [ ] Sprites cached in component state
- [ ] Fallback: placeholder icon if load fails
- [ ] No render-blocking on icon load

**Definition of Done:**
- Initial bundle: 680KB icons removed from main chunk
- Common icons (8) load immediately: 45KB
- Other icons load on-demand: 120KB total (lazy chunks)
- Icon display time: < 50ms

---

#### WU-12: Virtual Scrolling for Lists (2 story points)
**Effort:** ~4 hours  
**Owner:** Frontend Engineer  
**Blocker:** None (independent)  
**Parallel:** All  

**Tasks:**
- [ ] Identify long lists: ClientList (50+ rows), VisitHistory (30+ rows), BillingHistory (100+ rows)
- [ ] react-window FixedSizeList integration
- [ ] Tests: scroll performance, rendering only visible items
- [ ] Staging: scroll 100-row list, verify smooth (60 FPS)

**Implementation Checklist:**
- [ ] ClientList: render 15 rows (was 50)
- [ ] VisitHistory: render 12 rows (was 30)
- [ ] BillingHistory: render 20 rows (was 100)
- [ ] Row height: consistent, known in advance

**Definition of Done:**
- Lists scroll at 60 FPS
- DOM node count: 50 rows → 20 nodes (60% reduction)
- Memory footprint: -50MB for large lists
- Accessibility: keyboard nav still works

---

#### WU-13: React.memo Optimization (3 story points)
**Effort:** ~6 hours  
**Owner:** Frontend Engineer  
**Blocker:** None (independent)  
**Parallel:** All  

**Tasks:**
- [ ] Identify unnecessary re-renders in dashboards
- [ ] Wrap stateless components in React.memo
- [ ] Add useMemo() for expensive calculations
- [ ] Tests: re-renders only on prop change
- [ ] React DevTools Profiler: verify render count reduction

**Implementation Checklist:**
- [ ] MetricsPanel, UnassignedVisits, ConflictList memoized
- [ ] Dashboard state updates don't trigger child re-renders
- [ ] Complex selectors/filters memoized

**Definition of Done:**
- Dashboard re-renders: 15 → 3 on metric update (80% reduction)
- Interaction responsiveness: FID < 100ms
- Memory: stable (no memory leaks)

---

#### WU-14: Tree-Shake Vendor Dependencies (2 story points)
**Effort:** ~4 hours  
**Owner:** Frontend Engineer  
**Blocker:** None (independent)  
**Parallel:** All  

**Tasks:**
- [ ] Analyze lodash usage (150KB → only 40KB needed?)
- [ ] Replace lodash with native JS where possible
- [ ] babel-plugin-lodash configured (for remaining usage)
- [ ] date-fns: analyze usage, tree-shake unused functions
- [ ] Bundle size verification

**Implementation Checklist:**
- [ ] Lodash: _.filter → Array.filter, _.sortBy → Array.sort
- [ ] date-fns: import only { format, parse } (used functions)
- [ ] recharts: remove unused chart types
- [ ] Bundle analysis confirms reductions

**Definition of Done:**
- Lodash: 150KB → 40KB (73% reduction)
- date-fns: 85KB → 30KB (65% reduction)
- Total bundle: 520KB → 185KB after all optimizations

---

### TESTING & INTEGRATION (WU-15 to WU-18)

#### WU-15: Phase 1 Testing - Database Indexes (2 story points)
**Effort:** ~4 hours  
**Owner:** QA Engineer + DBA  
**Blocker:** WU-3 complete  

**Test Scenarios:**
- [ ] Index creation on staging (no locks, no errors)
- [ ] Performance regression check: queries faster, no degradation elsewhere
- [ ] EXPLAIN ANALYZE: confirms index usage (not seq scan)
- [ ] Production data snapshot tested (real data size)
- [ ] Stress test: 100 concurrent dashboard loads

**Success Criteria:**
- Dashboard queries < 100ms (from 280ms)
- No deadlock incidents
- CPU < 60% during peak

---

#### WU-16: Phase 2 Testing - Redis Caching (3 story points)
**Effort:** ~6 hours  
**Owner:** QA Engineer + Backend  
**Blocker:** WU-7 complete  

**Test Scenarios:**
- [ ] Cache hit/miss tracking
- [ ] Invalidation timing (< 500ms)
- [ ] Redis failure: fallback to DB works
- [ ] Memory eviction: LRU works, no data loss
- [ ] Load test: 100 concurrent users, cache warm

**Success Criteria:**
- Cache hit rate > 70%
- API response P95 < 120ms
- No data corruption on invalidation

---

#### WU-17: Phase 3 Testing - Frontend Performance (3 story points)
**Effort:** ~6 hours  
**Owner:** QA Engineer + Frontend  
**Blocker:** WU-14 complete  

**Test Scenarios:**
- [ ] Bundle size audit (< 200KB gzip)
- [ ] Core Web Vitals measurement (CLS < 0.1, LCP < 1.2s)
- [ ] 3G network throttling (TTI < 1.5s)
- [ ] Low-end mobile devices (iPhone SE, Galaxy A50)
- [ ] Error rate regression check

**Success Criteria:**
- TTI < 1.5s on 3G
- LCP < 1.2s
- Zero error rate regression

---

#### WU-18: Production Readiness (2 story points)
**Effort:** ~4 hours  
**Owner:** Tech Lead + DevOps  
**Blocker:** All vectors complete  

**Checklist:**
- [ ] Deployment runbooks created (step-by-step procedures)
- [ ] Rollback procedures documented
- [ ] Monitoring dashboards verified in production
- [ ] Alert thresholds set (latency, error rate, cache health)
- [ ] On-call engineer briefed
- [ ] Stakeholder sign-off

**Definition of Done:**
- All systems operational in production
- Monitoring active for 48 hours
- First production incident response plan

---

## Effort Summary

| Phase | WUs | Story Points | Duration | Team |
|-------|-----|--------------|----------|------|
| **Vector 1: DB** | WU-1, WU-2, WU-3 | 6pts | 2 weeks | 1 Backend + 1 DBA |
| **Vector 2: Cache** | WU-4, WU-5, WU-6, WU-7 | 16pts | 3 weeks | 1 DevOps + 2 Backend |
| **Vector 3: Frontend** | WU-8–WU-14 | 22pts | 3 weeks | 2 Frontend |
| **Testing & Deployment** | WU-15–WU-18 | 10pts | 2 weeks | 1 QA + 1 Tech Lead |
| **TOTAL** | 18 WUs | **54pts** | 4 weeks | 7 engineers |

---

## Dependencies & Critical Path

```
WU-4 (Redis setup) ──→ WU-5, WU-6, WU-7
                        └─→ WU-16 (cache testing)
                            └─→ WU-18 (production)

WU-1 (Critical indexes) ──→ WU-2 ──→ WU-3
                              └─→ WU-15 (index testing)
                                  └─→ WU-18

WU-8 (Route splitting) ──→ WU-9, WU-10, WU-11
                            └─→ WU-12, WU-13, WU-14
                                └─→ WU-17 (frontend testing)
                                    └─→ WU-18
```

**Critical Path (longest dependency chain):** WU-4 → WU-7 → WU-16 → WU-18 (~3.5 weeks)

---

## Staffing Plan

**Week 1:**
- 1 Senior Backend Engineer (WU-1, WU-2)
- 1 DBA (WU-1, WU-2, WU-15)
- 1 DevOps (WU-4 setup)
- 2 Frontend Engineers (WU-8, WU-9, WU-10, WU-11, WU-12, WU-13, WU-14)

**Week 2:**
- 1 Senior Backend Engineer (WU-5 complete, WU-6 start)
- 1 DBA (index monitoring)
- 1 Backend Engineer (WU-6, WU-7)
- 2 Frontend Engineers (continue WU-9–WU-14, WU-17 start)
- 1 QA Engineer (WU-15 execution, WU-16 prep)

**Week 3:**
- 1 Backend Engineer (WU-6, WU-7 completion)
- 1 Frontend Engineer (code review, WU-17)
- 1 QA Engineer (WU-16, WU-17)

**Week 4:**
- 1 Tech Lead (WU-18 coordination)
- 1 QA Engineer (final validation)
- On-call engineer (production monitoring)

**Total Effort:** 7 engineers × 4 weeks = 28 person-weeks (allowing for parallel work, reduces to ~12 person-weeks actual)

---

## Status Tracking Template

**Status Update Format (Weekly):**

```
FC-16 Status Report – Week [X]
Date: [YYYY-MM-DD]

VECTOR 1: Database Indexing
- WU-1: [✅ DONE / 🟡 IN PROGRESS / ⏳ NOT STARTED]
  - Tasks complete: 5/5
  - Blockers: None
  - Notes: Ready for production

- WU-2: [STATUS]
  - Tasks complete: X/X
  - Blockers: [List any]
  - Notes: [Blocker details]

VECTOR 2: Redis Caching
- WU-4: [STATUS] ...
- WU-5: [STATUS] ...
- WU-6: [STATUS] ...
- WU-7: [STATUS] ...

VECTOR 3: Frontend Optimization
- WU-8: [STATUS] ...
- WU-9: [STATUS] ...
- ... (WU-10–14)

TESTING & INTEGRATION
- WU-15: [STATUS] ...
- WU-16: [STATUS] ...
- WU-17: [STATUS] ...
- WU-18: [STATUS] ...

KEY METRICS
- Database query P95: [current] ms
- API response P95: [current] ms
- Bundle size: [current] KB
- Cache hit rate: [current] %
- TTI (3G): [current] s

RISKS & BLOCKERS
1. [Risk description] → Mitigation: [plan]
2. ...

NEXT WEEK PLAN
- Primary focus: [WU-X, WU-Y]
- Approval needed: [Gate/sign-off]
- Resource needs: [team adjustments]
```

---

## Sign-Off

| Role | Name | Date | Status |
|------|------|------|--------|
| Technical Architect | Mark Jordan | 2026-09-20 | ✅ Draft Complete |
| Project Manager | TBD | — | ⏳ Pending |
| Engineering Lead | TBD | — | ⏳ Pending |
| DevOps Lead | TBD | — | ⏳ Pending |

---

*End of Work Breakdown Structure*
