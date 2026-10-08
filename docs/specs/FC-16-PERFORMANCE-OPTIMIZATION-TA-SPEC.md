# FC-16: Performance Optimization - Technical Architecture Specification

**Version:** 1.0  
**Date Created:** September 20, 2026  
**Owner:** Mark Jordan (Technical Architect)  
**Status:** Draft (Gate-Ready)  
**Target Audience:** Backend engineers, DevOps, database architects, senior developers  

---

## Executive Summary

FC-16 addresses systemic performance degradation across the Folk Care platform through three coordinated optimization vectors:

1. **Query-Level Caching** – Memoize frequently accessed but computationally expensive data reads (client lists, caregiver schedules, billing summaries)
2. **Frontend Lazy-Loading** – Defer non-critical UI rendering and data fetches to improve Time-to-Interactive (TTI) and Largest Contentful Paint (LCP)
3. **Database Index Strategy** – Add strategic indexes on high-cardinality columns and join keys to reduce full-table scans and lock contention

**Scope:** Full-stack optimization spanning API layer, frontend bundle, and database schema

**Estimated Effort:** 80–120 story points (120–180 engineering hours)

**Expected Outcomes:**
- Page load time reduced by 40–60%
- API response time P95 < 200ms (from current ~400–800ms)
- Database query execution time < 50ms for 95th percentile
- Memory usage stability under concurrent load

---

## Architecture Layers & Problem Statements

### Layer 1: Database Performance Issues

#### Current State
- **Missing Indexes on Hot Paths:**
  - `clients.status` (text search, filtering, 50M+ rows)
  - `scheduling_visits.caregiver_id` + `scheduled_date` (JOIN in visit lists, 10M+ rows)
  - `billing_line_items.client_id` + `created_date` (invoice queries, 20M+ rows)
  - `user_roles.user_id` (permission checks on every request, 1M+ rows)
  - `care_plan_notes.care_plan_id` + `created_date` (sequential reads, 5M+ rows)

- **Query Performance Bottlenecks:**
  - Coordinator dashboard loads 84 active clients with full relationship trees → 12–15 sub-queries, response time 1.2–1.8s
  - Caregiver visit history (50 visits per page) triggers N+1 on client lookups → 51 round-trips
  - Billing detail page reconstructs invoice totals from raw line items (no aggregates) → full-table scan on 20M rows

- **Lock Contention:**
  - High-frequency writes to `user_sessions` (no partitioning, no TTL cleanup) → row lock waits 200–400ms
  - Concurrent schedule updates on `scheduling_visits` without transaction isolation → deadlocks during bulk operations

#### Impact
- **User Perception:** Dashboard and list views "feel slow" (2–5s load times)
- **Resource Utilization:** CPU spikes to 85%+ during 8–9am and 4–5pm (shift handoff times)
- **Reliability:** Occasional timeout errors when concurrent load > 50 simultaneous users

---

### Layer 2: API Caching Issues

#### Current State
- **No Query Caching:**
  - Every dashboard view re-queries the same client metadata (name, status, phone) from database
  - Care plan summaries recalculated on every visit despite no change in underlying data
  - Medication lists fetched fresh for every approval workflow, despite stable reference data

- **No Response Caching:**
  - Coordinators viewing the same caregiver assignment page hit the API 3+ times in 30 minutes
  - List endpoints (clients, caregivers, scheduling) return full datasets with no pagination or field selection
  - No cache headers on static content (reference data, configs)

- **Inefficient Data Shapes:**
  - Client detail endpoint returns 47 fields; dashboard needs only 8
  - Caregiver list includes full availability matrix (500 data points per person); list view needs only 12
  - Billing detail page fetches all historical transactions when showing only current month

#### Impact
- **Database Load:** 30–40% of queries are duplicates within 60-second windows
- **Bandwidth:** Unnecessary data transfer (average response 250KB vs. needed 45KB)
- **Perceived Performance:** Stale data assumptions cause 10–20% of requests to be retries

---

### Layer 3: Frontend Bundle & Rendering Issues

#### Current State
- **No Lazy-Loading:**
  - Dashboard loads **all** dashboard types (nurse, coordinator, admin, caregiver) on initial page load → 1.8MB JS
  - Modal components (create visit, edit client, approval flows) bundled in main chunk
  - Charts, tables, and reports loaded even when user never scrolls to them

- **No Code-Splitting:**
  - Route-level splitting exists but component-level granularity missing
  - Vendor bundles (lodash, date-fns, recharts) not tree-shaken
  - Icons library loaded as one monolithic 680KB SVG sprite

- **Unoptimized Rendering:**
  - Dashboard re-renders entire page on single data update (no React.memo, no memoization)
  - List views render all 50 rows; viewport contains only 12
  - Form validations trigger full component tree re-renders

#### Impact
- **Time-to-Interactive:** 3.2s (target: 1.5s)
- **Largest Contentful Paint:** 2.8s (target: 1.2s)
- **Memory footprint:** 120–140MB on low-end mobile devices
- **30% of user base experiences slow performance** on 3G networks (bundle bloat)

---

## Optimization Vectors

### Vector 1: Database Indexing Strategy

#### Index Roadmap

| Index Name | Table | Columns | Type | Estimated Gain | Priority |
|------------|-------|---------|------|----------------|----------|
| `idx_clients_status` | `clients` | `status` | B-tree | 85% faster filtering | CRITICAL |
| `idx_visit_caregiver_date` | `scheduling_visits` | `(caregiver_id, scheduled_date)` | B-tree composite | 70% faster schedule queries | CRITICAL |
| `idx_billing_client_date` | `billing_line_items` | `(client_id, created_date DESC)` | B-tree composite | 60% faster invoice queries | HIGH |
| `idx_user_roles_user` | `user_roles` | `user_id` | B-tree | 50% faster permission checks | HIGH |
| `idx_care_plan_notes_plan_date` | `care_plan_notes` | `(care_plan_id, created_date DESC)` | B-tree composite | 65% faster note retrieval | MEDIUM |
| `idx_sessions_user_expires` | `user_sessions` | `(user_id, expires_at)` | B-tree composite | Session cleanup 10x faster | MEDIUM |
| `idx_scheduling_status_date` | `scheduling_visits` | `(status, scheduled_date)` | Partial: status='PENDING' | Fewer scans on unscheduled | LOW |

#### Implementation Sequence
1. **Week 1:** CRITICAL indexes (idx_clients_status, idx_visit_caregiver_date, idx_billing_client_date)
2. **Week 2:** HIGH priority (idx_user_roles_user, idx_care_plan_notes_plan_date)
3. **Week 3:** MEDIUM + monitoring & tuning

#### Execution Plan

**WU-1: Create CRITICAL Indexes (Low Risk)**

```sql
-- Phase 1: Add indexes without immediate pressure
CREATE INDEX CONCURRENTLY idx_clients_status 
  ON public.clients (status) 
  WHERE active = TRUE;

CREATE INDEX CONCURRENTLY idx_visit_caregiver_date 
  ON public.scheduling_visits (caregiver_id, scheduled_date DESC) 
  WHERE status != 'CANCELLED';

CREATE INDEX CONCURRENTLY idx_billing_client_date 
  ON public.billing_line_items (client_id, created_date DESC);
```

**Validation:**
- Index creation time < 30 seconds per index (test on staging)
- No impact on write performance (monitor INSERT/UPDATE latency)
- Query plan shows index usage within 24 hours

**Done When:**
- [ ] All 3 indexes created on staging
- [ ] Staging dashboard load time reduced by 50%+
- [ ] EXPLAIN shows index usage, no seq scans
- [ ] No new locks or contention observed

---

**WU-2: High-Priority Indexes**

```sql
CREATE INDEX CONCURRENTLY idx_user_roles_user 
  ON public.user_roles (user_id);

CREATE INDEX CONCURRENTLY idx_care_plan_notes_plan_date 
  ON public.care_plan_notes (care_plan_id, created_date DESC);

CREATE INDEX CONCURRENTLY idx_sessions_user_expires 
  ON public.user_sessions (user_id, expires_at);
```

**Testing:**
- Permission check queries drop from 45ms avg to < 10ms
- Note retrieval for care plan pages < 20ms (was 80–120ms)
- Session cleanup background job runtime < 2 seconds (was 15–20s)

---

**WU-3: Partial & Specialty Indexes**

```sql
-- Low-cardinality partial index to skip already-scheduled visits
CREATE INDEX CONCURRENTLY idx_scheduling_status_date 
  ON public.scheduling_visits (status, scheduled_date) 
  WHERE status IN ('PENDING', 'UNASSIGNED');
```

---

### Vector 2: Query-Layer Caching (Redis Backend)

#### Cache Architecture

```
┌─────────────────────┐
│   Client Requests   │
│   (Web/Mobile)      │
└──────────┬──────────┘
           │
     ┌─────▼──────────────────────┐
     │   FastAPI/Node.js API      │
     │  (Cache Lookup Layer)       │
     └─────┬──────────┬───────────┘
           │ HIT      │ MISS
    ┌──────▼─────┐    │
    │ Redis      │◄───┴─────┐
    │ Cache      │          │
    └────────────┘    ┌─────▼──────────┐
                      │  PostgreSQL    │
                      │  (Write-Back)  │
                      └────────────────┘
```

#### Cache Layers & TTLs

| Data Type | Cache Key Pattern | TTL | Invalidation Strategy | Estimated Compression |
|-----------|-------------------|-----|----------------------|----------------------|
| Client metadata | `client:{id}:meta` | 1 hour | Manual on write | 85% (8KB → 1.2KB) |
| Caregiver schedules | `caregiver:{id}:schedule:{date}` | 30 min | Time-based + event | 70% |
| Care plan summary | `care_plan:{id}:summary` | 2 hours | Manual on note creation | 80% |
| Billing totals | `billing:{client_id}:{month}:totals` | 4 hours | Manual on line item insert | 90% |
| Reference data (meds, units) | `ref:medications` | 24 hours | Nightly refresh | 95% |
| User permissions | `user:{id}:permissions` | 30 min | Role change event | 88% |

#### Cache Invalidation Patterns

**Write-Through Pattern (Strong Consistency):**
```
SET cache
 ├─ Write to cache
 └─ Write to DB
 (Fail safe: if cache unavailable, proceed to DB)
```

Used for: User permissions, active caregivers (real-time critical)

**Write-Behind Pattern (Eventual Consistency):**
```
WRITE to DB
 └─ Async invalidate cache
     (Cache becomes stale for < 5 seconds)
```

Used for: Client metadata, billing summaries (eventual consistency acceptable)

**TTL-Based Expiry (Passive):**
```
GET from cache
 └─ If expired or miss
     └─ Fetch from DB
        └─ Refresh cache + TTL
```

Used for: Reference data, reporting (no strong consistency requirement)

#### Implementation Sequence

**WU-4: Redis Infrastructure Setup**

**Prerequisites:**
- Redis 7.0+ deployment (staging + production)
- Connection pooling (node-redis/ioredis for Node.js, redis-py for Python)
- Cache invalidation event system

**Configuration:**
```javascript
// config/cache.js
const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: 6379,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
  enableOfflineQueue: false,
  retryStrategy: () => null // fail-fast on connection loss
});

// Cache layer wrapper with fallback
export async function getCachedData(key, fetchFn, ttl = 3600) {
  try {
    // Try cache first
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached);
  } catch (e) {
    console.warn(`Cache read failed for ${key}, falling back to DB`, e);
  }

  // Fallback to source
  const data = await fetchFn();
  
  // Async cache write (non-blocking)
  redis.setex(key, ttl, JSON.stringify(data)).catch(e => 
    console.warn(`Cache write failed for ${key}`, e)
  );
  
  return data;
}
```

**Validation:**
- [ ] Redis cluster healthy (3+ nodes in prod)
- [ ] Connection failover tested (node down → fallback to DB)
- [ ] Memory limits set (eviction policy: allkeys-lru)
- [ ] Monitoring in place (hit rate, evictions, latency)

---

**WU-5: Cache Client Metadata**

**Endpoint:** `GET /api/clients/{id}`

**Current:** 45ms (DB query) + serialization  
**Cached:** 2ms (Redis hit) + serialization

```javascript
// routes/clients.js
export async function getClient(req, res) {
  const { id } = req.params;
  
  const client = await getCachedData(
    `client:${id}:meta`,
    () => db.query('SELECT id, name, status, phone, email, created_at FROM clients WHERE id = $1', [id]),
    3600 // 1 hour TTL
  );
  
  res.json(client);
}

// On client update: invalidate cache
export async function updateClient(req, res) {
  const { id } = req.params;
  const { name, status } = req.body;
  
  // Update DB
  await db.query('UPDATE clients SET name = $1, status = $2 WHERE id = $3', [name, status, id]);
  
  // Invalidate cache
  await redis.del(`client:${id}:meta`);
  
  res.json({ success: true });
}
```

**Test Cases:**
- [ ] First request (cache miss) → DB query executed, result cached
- [ ] Second request (cache hit) → no DB query, Redis hit
- [ ] Update client → cache invalidated, next request fetches fresh
- [ ] Redis down → fallback to DB, request succeeds

---

**WU-6: Cache Caregiver Schedules**

**Endpoint:** `GET /api/caregivers/{id}/schedule?date=2026-09-20`

**Current:** 120–150ms (multiple sub-queries for availability, assignments, exceptions)  
**Cached:** 4ms (Redis hit)

```javascript
export async function getCaregiverSchedule(req, res) {
  const { id } = req.params;
  const { date } = req.query; // YYYY-MM-DD
  
  const schedule = await getCachedData(
    `caregiver:${id}:schedule:${date}`,
    () => buildCaregiverSchedule(id, date), // Complex query
    1800 // 30 min TTL (schedule changes frequently)
  );
  
  res.json(schedule);
}

async function buildCaregiverSchedule(caregiverId, date) {
  const visits = await db.query(`
    SELECT id, client_id, start_time, end_time, status
    FROM scheduling_visits
    WHERE caregiver_id = $1 AND DATE(scheduled_date) = $2
    ORDER BY start_time
  `, [caregiverId, date]);
  
  const availability = await db.query(`
    SELECT ... FROM caregiver_availability WHERE caregiver_id = $1 AND date = $2
  `, [caregiverId, date]);
  
  const exceptions = await db.query(`
    SELECT ... FROM scheduling_exceptions WHERE caregiver_id = $1 AND date = $2
  `, [caregiverId, date]);
  
  return { visits, availability, exceptions };
}

// Invalidation on visit changes
async function scheduleVisit(req, res) {
  const { caregiverId, date } = req.body;
  
  // Create visit
  await db.query('INSERT INTO scheduling_visits ...');
  
  // Invalidate caregiver schedule cache
  await redis.del(`caregiver:${caregiverId}:schedule:${date}`);
  
  // Also invalidate any cached dashboards that show this caregiver
  await redis.del(`dashboard:coordinator:*`); // Broad invalidation, or targeted?
  
  res.json({ success: true });
}
```

---

**WU-7: Cache Billing Aggregates**

**Problem:** Billing detail page calls 15 queries to sum line items by category (nursing, personal care, equipment, etc.)

**Solution:** Pre-aggregate and cache

```javascript
export async function getBillingMonthSummary(req, res) {
  const { clientId, year, month } = req.query;
  
  const summary = await getCachedData(
    `billing:${clientId}:${year}-${month}:totals`,
    () => aggregateBillingData(clientId, year, month),
    14400 // 4 hours TTL
  );
  
  res.json(summary);
}

async function aggregateBillingData(clientId, year, month) {
  const query = `
    SELECT 
      category,
      COUNT(*) as count,
      SUM(amount) as total,
      AVG(amount) as avg_amount
    FROM billing_line_items
    WHERE client_id = $1 
      AND EXTRACT(YEAR FROM created_date) = $2
      AND EXTRACT(MONTH FROM created_date) = $3
    GROUP BY category
  `;
  
  return await db.query(query, [clientId, year, month]);
}

// On new line item: invalidate aggregate
async function createLineItem(req, res) {
  const { clientId, created_date } = req.body;
  
  const [year, month] = [created_date.getFullYear(), created_date.getMonth() + 1];
  
  // Create line item
  await db.query('INSERT INTO billing_line_items ...');
  
  // Invalidate aggregate cache
  await redis.del(`billing:${clientId}:${year}-${String(month).padStart(2, '0')}:totals`);
  
  res.json({ success: true });
}
```

---

### Vector 3: Frontend Lazy-Loading & Code-Splitting

#### Current Bundle Analysis
```
Initial Page Load (SPA):
├── React + ReactDOM           180KB
├── React Router                60KB
├── Dashboard Components      280KB (ALL dashboard types!)
│   ├── NurseDashboard        95KB
│   ├── CoordinatorDashboard  110KB
│   ├── CaregiverDashboard    65KB
│   └── AdminDashboard        80KB (loaded but not visible)
├── Charts & Graphs           240KB (recharts, plotly)
├── Tables & UI               200KB
├── Lodash utilities          150KB (full library!)
├── Date utilities (date-fns)  85KB
├── Icons SVG sprite          680KB
└── CSS & other               300KB
────────────────
Total: ~2.2MB (uncompressed), ~520KB (gzipped)

Time-to-Interactive: 3.2s (slow 3G)
Largest Contentful Paint: 2.8s
First Input Delay: 450ms
```

#### Post-Optimization Target
```
Initial Page Load:
├── Core framework            180KB
├── Router                     60KB
├── Dashboard shell            45KB (type selector only)
├── Initial dashboard only    120KB (lazy-loaded on route)
├── Essential charts           50KB (tree-shaken)
├── Essential UI              80KB
├── Optimized utils            30KB (tree-shaken)
├── Icons (on-demand)         120KB (lazy sprite loading)
└── CSS                       140KB
────────────────
Total: ~825KB (uncompressed), ~185KB (gzipped)

Expected:
├── Time-to-Interactive: 1.4s (target: 1.5s) ✓
├── LCP: 1.1s ✓
├── FID: 120ms ✓
```

#### Lazy-Loading Strategy

**WU-8: Route-Level Code Splitting**

```javascript
// config/routes.js - Add lazy loading
import { lazy, Suspense } from 'react';

const DashboardRouter = lazy(() => import('./pages/DashboardRouter'));
const BillingPage = lazy(() => import('./pages/BillingPage'));
const SchedulingPage = lazy(() => import('./pages/SchedulingPage'));
const ClientDetailPage = lazy(() => import('./pages/ClientDetailPage'));

export const routes = [
  {
    path: '/dashboard',
    element: (
      <Suspense fallback={<LoadingShell />}>
        <DashboardRouter />
      </Suspense>
    )
  },
  {
    path: '/billing/*',
    element: (
      <Suspense fallback={<LoadingShell />}>
        <BillingPage />
      </Suspense>
    )
  },
  // ... more routes
];
```

**Expected Impact:**
- Initial bundle: 520KB → 180KB (65% reduction)
- Dashboard load time: 2.8s → 1.2s
- Route transitions: 800ms → 200ms (lazy chunk load)

---

**WU-9: Component-Level Lazy Loading**

```javascript
// pages/DashboardRouter.tsx
const NurseDashboard = lazy(() => import('./dashboards/NurseDashboard'));
const CoordinatorDashboard = lazy(() => import('./dashboards/CoordinatorDashboard'));
const CaregiverDashboard = lazy(() => import('./dashboards/CaregiverDashboard'));
const AdminDashboard = lazy(() => import('./dashboards/AdminDashboard'));

export function DashboardRouter() {
  const [userRole, setUserRole] = useState(null);
  
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      {userRole === 'NURSE' && <NurseDashboard />}
      {userRole === 'COORDINATOR' && <CoordinatorDashboard />}
      {userRole === 'CAREGIVER' && <CaregiverDashboard />}
      {userRole === 'ADMIN' && <AdminDashboard />}
    </Suspense>
  );
}
```

**Only load the dashboard for the user's role. Others load on-demand if needed.**

---

**WU-10: Lazy Load Non-Critical Modals & Panels**

```javascript
// components/ScheduleVisitModal.tsx - Lazy loaded
const ScheduleVisitForm = lazy(() => import('./forms/ScheduleVisitForm'));

export function CoordinatorDashboard() {
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  
  return (
    <>
      <Dashboard>
        <button onClick={() => setShowScheduleModal(true)}>
          Schedule Visit
        </button>
      </Dashboard>
      
      {showScheduleModal && (
        <Suspense fallback={<ModalSkeleton />}>
          <ScheduleVisitForm
            onClose={() => setShowScheduleModal(false)}
          />
        </Suspense>
      )}
    </>
  );
}
```

**Modal JS only loads when user clicks. Saves 45KB per modal × 8 modals = 360KB.**

---

**WU-11: Image & Icon Lazy Loading**

```javascript
// components/Icon.tsx - On-demand icon sprite chunk loading
import { useLazyIcon } from '@/hooks/useLazyIcon';

export function Icon({ name, size = 24 }) {
  const iconSrc = useLazyIcon(name); // Async loader
  
  return (
    <img 
      src={iconSrc} 
      alt={name} 
      width={size} 
      height={size}
      loading="lazy"
    />
  );
}

// hooks/useLazyIcon.ts
const iconSpriteCache = new Map();

export function useLazyIcon(name: string) {
  const [src, setSrc] = useState<string | null>(null);
  
  useEffect(() => {
    if (iconSpriteCache.has(name)) {
      setSrc(iconSpriteCache.get(name));
      return;
    }
    
    // Load icon sprite chunk on-demand
    import(`@/assets/icons/${name}-sprite.svg`).then(module => {
      const url = module.default;
      iconSpriteCache.set(name, url);
      setSrc(url);
    });
  }, [name]);
  
  return src;
}
```

---

**WU-12: Virtual Scrolling for Large Lists**

Current: Render 50 rows on page load (even if only 12 visible)  
Solution: Render only visible + buffer

```javascript
import { FixedSizeList } from 'react-window';

export function ClientList({ clients }) {
  return (
    <FixedSizeList
      height={600}
      itemCount={clients.length}
      itemSize={60}
      width="100%"
    >
      {({ index, style }) => (
        <div style={style} className="client-row">
          <ClientRow client={clients[index]} />
        </div>
      )}
    </FixedSizeList>
  );
}
```

**Impact:** 50-row list → render only 15-20 at a time. Saves DOM nodes and re-renders.

---

**WU-13: React.memo & useMemo Optimization**

```javascript
// Before: Dashboard re-renders entire page on single metric change
export function CoordinatorDashboard() {
  const [metrics, setMetrics] = useState(...);
  
  return (
    <>
      <MetricsPanel metrics={metrics} />  {/* RE-RENDERS */}
      <UnassignedVisits />  {/* RE-RENDERS (no props change!) */}
      <ConflictList />  {/* RE-RENDERS (no props change!) */}
    </>
  );
}

// After: Memoize components that don't have prop changes
export const MetricsPanel = memo(function MetricsPanel({ metrics }) {
  return <div>...</div>;
});

export const UnassignedVisits = memo(function UnassignedVisits() {
  const visits = useMemo(() => fetchVisits(), []);
  return <VisitList visits={visits} />;
});

export const ConflictList = memo(function ConflictList() {
  return <div>...</div>;
});
```

---

**WU-14: Tree-Shake Vendor Dependencies**

Current: Import full lodash library (150KB)  
Solution: Import only used functions

```javascript
// Before
import _ from 'lodash';
const filtered = _.filter(...);
const sorted = _.sortBy(...);

// After (manually or with babel-plugin-lodash)
import { filter, sortBy } from 'lodash-es';
const filtered = filter(...);
const sorted = sortBy(...);

// OR use native JS (best)
const filtered = data.filter(x => x.active);
const sorted = data.sort((a, b) => a.date - b.date);
```

**Impact:** 150KB → 40KB (73% reduction on lodash alone)

---

## Acceptance Criteria & Testing

### Performance Benchmarks

| Metric | Current | Target | Vector |
|--------|---------|--------|--------|
| Dashboard load time | 2.8s | 1.2s | Lazy-load + caching |
| API response P95 | 450ms | 120ms | DB indexes + caching |
| Database query P95 | 280ms | 45ms | Indexes |
| Bundle size (gzip) | 520KB | 185KB | Code-splitting |
| TTI | 3.2s | 1.5s | All vectors |
| LCP | 2.8s | 1.2s | Code-split + cache |
| Cache hit rate | N/A | >70% | Caching strategy |

### Test Plan

**Phase 1: Index Testing (Week 1)**
- [ ] Staging: Run dashboard load 100x, measure BEFORE/AFTER
- [ ] Confirm EXPLAIN shows index usage
- [ ] Monitor lock contention metrics
- [ ] Revert on regression > 5%

**Phase 2: Cache Testing (Week 2)**
- [ ] Unit tests for cache layer (hit/miss/invalidation)
- [ ] Integration tests with Redis failure scenarios
- [ ] Cache hit rate monitoring (target >70%)
- [ ] Verify cache invalidation timing (< 500ms)

**Phase 3: Frontend Testing (Week 3)**
- [ ] Bundle size analysis with webpack-bundle-analyzer
- [ ] Core Web Vitals measurement (target: CLS < 0.1, LCP < 1.2s)
- [ ] Load testing with 3G throttling
- [ ] Mobile device testing (low-end: iPhone SE, Galaxy A50)

**Phase 4: Integration & Production Readiness (Week 4)**
- [ ] Staging full-load test (100 concurrent users)
- [ ] Cache warm-up strategy defined
- [ ] Monitoring dashboards in place
- [ ] Rollback plan documented

---

## Deployment Strategy

### Phased Rollout

**Week 1: Database Optimization** (Low risk, backward compatible)
- Deploy CRITICAL indexes to production
- Monitor: Query latency, lock waits, CPU
- Rollback: Drop indexes if latency increases

**Week 2: Caching Layer** (Medium risk, requires monitoring)
- Deploy Redis cluster to staging
- Gradually enable cache for read-heavy endpoints
- Canary: 10% traffic → 50% → 100%
- Rollback: Disable Redis, fallback to DB

**Week 3: Frontend Code-Splitting** (Medium risk, requires testing)
- Deploy new bundle with code splitting to staging
- A/B test: 20% new bundle → 50% → 100%
- Monitor: Error rates, performance metrics
- Rollback: Deploy old bundle

**Week 4: Full Production** (High confidence)
- Deploy all vectors to production
- Run production load test
- Monitor 24/7 for first week

---

## Monitoring & Observability

### Key Metrics to Track

**Database Performance:**
```
- Index hit ratio (goal: >95% for CRITICAL indexes)
- Query execution time by query type (dashboard, billing, scheduling)
- Lock wait time P95 (goal: < 10ms)
- Cache hit ratio on Redis (goal: >70%)
```

**API Performance:**
```
- Response time P95 by endpoint (goal: <120ms)
- Request throughput (requests/sec)
- Error rate (4xx, 5xx per endpoint)
```

**Frontend Performance:**
```
- Core Web Vitals: CLS, FID, LCP, TTFB
- Bundle size (gzip)
- Time-to-Interactive
- Memory usage
```

**Cache Health:**
```
- Redis memory usage (goal: < 2GB)
- Eviction rate (goal: <1% per day)
- Cache invalidation lag (goal: <500ms)
```

### Monitoring Tools & Dashboards

- **Database:** PostgreSQL EXPLAIN ANALYZE, pgAdmin monitoring
- **API:** Application Performance Monitoring (DataDog/New Relic)
- **Frontend:** Google Lighthouse CI, WebVitals, Sentry
- **Cache:** Redis INFO, RedisInsight dashboard

---

## Risk Assessment & Mitigation

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Index creation locks table | HIGH | Use CONCURRENTLY, test on staging first, schedule off-peak |
| Cache invalidation race conditions | MEDIUM | Event-driven invalidation, TTL-based fallback, Redis sentinel |
| OOM on Redis cluster | MEDIUM | Memory limits, eviction policy (allkeys-lru), monitoring alerts |
| Bundle size increase from lazy-loading overhead | LOW | Use React.lazy, webpack optimization, test bundle size in CI |
| User experience during cache warming | MEDIUM | Pre-warm cache on deployment, fallback to DB if cold |

---

## Success Criteria

✅ **Achieved when:**

1. **Database Performance:**
   - [ ] All CRITICAL indexes created and in use
   - [ ] Dashboard queries < 100ms (was 280ms)
   - [ ] No deadlock incidents in 1 week
   - [ ] CPU utilization < 60% during peak

2. **Caching:**
   - [ ] Redis cluster operational, no data loss
   - [ ] Cache hit rate > 70% across all endpoints
   - [ ] Billing queries < 50ms (was 200ms)
   - [ ] Cache invalidation < 500ms

3. **Frontend:**
   - [ ] Bundle size < 200KB (gzip)
   - [ ] TTI < 1.5s on 3G
   - [ ] LCP < 1.2s
   - [ ] CLS < 0.1
   - [ ] No regression in error rates

4. **User Experience:**
   - [ ] Dashboard load "feels instant"
   - [ ] No timeout errors during normal load
   - [ ] No regression in concurrent user capacity
   - [ ] Support tickets for performance < 2/week (was 8/week)

---

## Appendices

### A. Database Schema Changes
*None required; all optimizations use existing columns.*

### B. Configuration Examples
*See inline code samples in each WU section.*

### C. Monitoring Queries

```sql
-- Check index usage
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;

-- Check slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
WHERE mean_exec_time > 50
ORDER BY mean_exec_time DESC;

-- Check lock contention
SELECT relation, mode, granted, count(*)
FROM pg_locks
GROUP BY relation, mode, granted;
```

### D. References
- PostgreSQL Index Documentation: https://www.postgresql.org/docs/current/indexes.html
- Redis Caching Patterns: https://redis.io/docs/management/patterns/
- React Code-Splitting: https://react.dev/reference/react/lazy
- Core Web Vitals: https://web.dev/vitals/

---

## Sign-Off

| Role | Name | Date | Status |
|------|------|------|--------|
| Technical Architect | Mark Jordan | 2026-09-20 | Draft → Ready for Gate |
| Senior Backend Engineer | TBD | — | Pending Review |
| DevOps Lead | TBD | — | Pending Review |
| Product Manager | TBD | — | Pending Review |

---

**End of TA Specification**
