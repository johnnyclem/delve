# Delve Refactor & Maintainability Plan

**Generated:** 2026-05-12  
**Scope:** Code quality, architectural improvements, test coverage, and debt reduction

Priority key: **P0** (blocker / must-fix) | **P1** (should-fix this cycle) | **P2** (nice-to-have) | **P3** (long-term)

---

## Architecture & Structure

### A-01 (P1): Split Monolithic Dashboard Page

**File:** `artifacts/dnd-manager/src/pages/dashboard.tsx` (1100+ lines)

**Problem:** This single file contains `DashboardPage`, `SubNavStrip`, `OverviewPanel`, `SessionTrendChart`, `MembersPanel`, `JoinCampaignPage`, and keyboard shortcut handling. Component-within-component patterns prevent independent testing and hurt readability.

**Action:**
1. Extract `OverviewPanel`, `SubNavStrip`, `SessionTrendChart`, `MembersPanel` into separate files under `artifacts/dnd-manager/src/components/dashboard/`
2. Extract `JoinCampaignPage` into `artifacts/dnd-manager/src/pages/join-campaign.tsx` with its own route
3. Keep only tab-routing logic and state in `dashboard.tsx` (~200 lines expected)

**Testability gain:** Each extracted component can be unit-tested in isolation with mock data.

### A-02 (P1): Add Database Migrations

**File:** `lib/db/package.json` (scripts: `"db push"` / `"db push-force"`)

**Problem:** The project uses `drizzle-kit push` exclusively — no migration files are generated or versioned. This makes schema changes:

- Impossible to review as part of code review (no SQL diff to examine)
- Destructive (`--force` drops/recreates tables, potential data loss)
- Unreproducible across environments without the exact same schema state

**Action:**
1. Configure `drizzle-kit` to generate migrations: add `"db generate": "drizzle-kit generate"` script
2. Run `drizzle-kit generate` to create initial migration files in `lib/db/migrations/`
3. Update deploy scripts to run `drizzle-kit migrate` instead of `push`
4. Document that all schema changes require running `generate` + committing the migration

### A-03 (P1): Convert Campaign Cache to Multi-Tenant

**File:** `artifacts/api-server/src/lib/campaign.ts:7`

**Problem:** `let cachedCampaignId: number | null = null` assumes single-campaign deployments despite the schema supporting many.

**Action:**
1. Change `getCampaignId` to accept `userId` and query by `dm_user_id` directly (no caching)
2. If caching is desired for performance, key by `userId`: `Map<string, number>` with TTL
3. In `requireAuth` middleware, resolve campaign ID once per request and attach to `req`

See security finding M-01 for the risk details.

### A-04 (P2): Implement DB-Level Recap Concurrency

**File:** `artifacts/api-server/src/lib/recap-runner.ts`

**Problem:** In-memory `Map<number, RunState>` per-session concurrency control does not work across process boundaries.

**Action:**
1. Use `pg_try_advisory_lock(session_log_id)` before starting recap generation
2. Use the `version` column for optimistic locking on the recap update
3. Keep the in-memory map as an optimization for single-instance deployments (fall through to DB if no lock entry found)

### A-05 (P2): Consolidate shadcn UI Primitives

**Files:**
- `artifacts/dnd-manager/src/components/ui/` (59 primitives)
- `artifacts/mockup-sandbox/src/components/ui/` (55 primitives)

**Problem:** Two nearly-identical copies of the shadcn component library are maintained independently. They will drift over time.

**Action:**
1. Extract shared UI primitives into `lib/ui/` workspace package
2. Have both `dnd-manager` and `mockup-sandbox` depend on `@workspace/ui`
3. Remove the duplicate copies

---

## Type Safety & Validation

### T-01 (P1): Enforce Token Secret Uniqueness at Startup

**Files:**
- `artifacts/api-server/src/lib/rsvp-token.ts`
- `artifacts/api-server/src/lib/unsubscribe.ts`

**Problem:** Fallback chain allows `CLERK_SECRET_KEY` to serve as both RSVP and unsubscribe signing key, enabling cross-purpose token reuse.

**Action:**
1. Add startup validation in `app.ts` (or a `preflight.ts` module) that checks:
   - `RSVP_SECRET` is set and != `UNSUBSCRIBE_SECRET`
   - `UNSUBSCRIBE_SECRET` is set and != `RSVP_SECRET`
2. Fail fast with a clear error message if either is missing or they are identical
3. Add `purpose` claim to both token types and validate it in the handlers

### T-02 (P1): Add Per-User Rate Limiting

**Files:** All route handlers (`artifacts/api-server/src/routes/*.ts`)

**Problem:** Only public endpoints are rate-limited. Authenticated endpoints (chat, entities, sessions) have no cost protection.

**Action:**
1. Create a reusable `userRateLimit` middleware:
   ```typescript
   export const userRateLimit = (limit: number, windowMs: number) =>
     rateLimit({
       keyGenerator: (req) => req.userId, // from auth middleware
       windowMs,
       max: limit,
       standardHeaders: true,
     });
   ```
2. Apply to cost-sensitive routes:
   - `/chat/*` → 60 req/min per user
   - `/sessions/*/recap` → 5 req/min per user
   - `/entities/*` → 120 req/min per user

### T-03 (P2): Replace Raw Fetch Calls with Generated Hooks

**Files:**
- `artifacts/dnd-manager/src/pages/dashboard.tsx` (`JoinCampaignPage`)
- `artifacts/dnd-manager/src/pages/admin-status.tsx`

**Problem:** Some pages bypass Orval-generated hooks and use raw `fetch()` with `credentials: "include"`, losing type safety, error handling, and cache management.

**Action:**
1. Add missing endpoints to the OpenAPI spec if they aren't covered
2. Regenerate Orval types
3. Replace raw fetch calls with generated hooks in both pages

### T-04 (P2): Use Generated Query Key Helpers Consistently

**File:** `artifacts/dnd-manager/src/**/*.tsx`

**Problem:** Manual cache invalidation uses string-based query keys (e.g., `["/api/maps"]`) instead of the type-safe generated `getMapsQueryKey()` helpers.

**Action:**
1. Search for all `invalidateQueries` calls with string arrays
2. Replace with the corresponding generated query key function
3. This ensures cache invalidation stays in sync if the API changes

---

## Security Hardening

### S-01 (P0): Replace `dangerouslySetInnerHTML`

**Files:**
- `artifacts/dnd-manager/src/components/chat-panel.tsx`
- `artifacts/dnd-manager/src/pages/house-rules-share.tsx`

**Problem:** Custom Markdown rendering with `dangerouslySetInnerHTML` is an XSS vector.

**Action:**
1. Install `rehype-sanitize` and `remark-rehype` (or use `DOMPurify`)
2. Create a `SafeMarkdown` component:
   ```typescript
   import DOMPurify from "dompurify";
   import { Markdown } from "./markdown";
   export function SafeMarkdown({ content }: { content: string }) {
     const sanitized = useMemo(() => DOMPurify.sanitize(renderMarkdown(content)), [content]);
     return <div dangerouslySetInnerHTML={{ __html: sanitized }} />;
   }
   ```
3. Replace all `dangerouslySetInnerHTML` usage with `<SafeMarkdown>`

### S-02 (P1): Implement ACL Group Enforcement

**Files:**
- `artifacts/api-server/src/lib/objectAcl.ts`
- `artifacts/api-server/src/lib/objectStorage.ts`
- `artifacts/api-server/src/routes/storage.ts`

**Problem:** The ACL framework is a no-op — no access groups are defined, no enforcement happens.

**Action:**
1. Populate `ObjectAccessGroupType` with `"campaign_member"`, `"dm"`, `"player"`
2. Implement `ObjectAccessEntry` resolution using the `campaign_members` table
3. Wire `getEffectiveAccess` into the storage proxy/download endpoint in `routes/storage.ts`
4. Remove the empty enum and dead code if group-level ACL is not needed yet

### S-03 (P1): Add Security Headers via Helmet

**File:** `artifacts/api-server/src/app.ts`

**Problem:** No CSP, `X-Content-Type-Options`, `X-Frame-Options`, or `Referrer-Policy` headers.

**Action:**
```typescript
import helmet from "helmet";
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https://img.clerk.com"],
      connectSrc: ["'self'", "https://*.clerk.accounts.dev"],
    },
  },
}));
```

### S-04 (P2): Sanitize Session Notes Before LLM Context

**File:** `artifacts/api-server/src/lib/recap-prompt.ts`

**Problem:** Raw session notes (`raw_notes_md`) are included verbatim in the LLM prompt, enabling potential indirect prompt injection.

**Action:**
1. Strip HTML tags from notes before inclusion
2. Add a size limit (e.g., 50KB) for notes text in the recap prompt
3. Consider adding a "system boundary" separator in the prompt between instructions and user content

---

## Observability & Resilience

### O-01 (P1): Add Embedding Failure Metrics

**Files:**
- `artifacts/api-server/src/lib/entityEmbeddings.ts`
- `lib/entity-embeddings/src/index.ts`

**Problem:** Embedding failures are silently swallowed with only a log line. No alerting, no metrics, no retry.

**Action:**
1. Export a counter metric from the entity-embeddings package (or use a callback)
2. Log embedding failures with structured fields (`entityId`, `campaignId`, `error`) for easy aggregation
3. Consider a dead-letter queue: store failed entity IDs in a `failed_embeddings` table for background retry

### O-02 (P2): Add Request Tracing

**File:** `artifacts/api-server/src/app.ts`

**Problem:** No request IDs or trace IDs are propagated across log entries. Correlating a frontend action with backend logs requires manual effort.

**Action:**
1. Add `express-request-id` or a simple UUID generator middleware
2. Include `req.id` in all pino log statements (pino's `child()` API)
3. Propagate the trace ID to OpenAI API calls via custom headers

### O-03 (P3): Implement Soft-Delete for Campaigns

**File:** `lib/db/src/schema/campaigns.ts`

**Problem:** Campaign deletion cascades to destroy all child data irreversibly.

**Action:**
1. Add `deleted_at TIMESTAMP WITH TIME ZONE` to `campaigns`
2. Modify queries to filter `WHERE deleted_at IS NULL`
3. Move cascade-delete logic into a cleanup job that runs after a grace period (e.g., 30 days)

---

## Testing

### TST-01 (P1): Add Integration Tests for Critical API Paths

**Files:** None exist (only `dice.test.ts`)

**Problem:** The only test in the entire monorepo is a dice expression parser unit test. No routes, middleware, or service logic is tested.

**Action (minimum viable):**
1. Set up Vitest (already a devDep) + `supertest` for Express integration tests
2. Write tests for:
   - `requireAuth` middleware (rejects unauthenticated, allows demo read-only)
   - RSVP token verification (valid, expired, tampered)
   - Chat retrieval with RRF hybrid search (mock OpenAI)
   - Entity CRUD with embedding pipeline
3. Add CI step: `pnpm -r test`

### TST-02 (P2): Add Error Boundary Smoke Tests

**File:** `artifacts/dnd-manager/src/App.tsx`

**Problem:** No React Error Boundaries exist. A runtime error in any component unmounts the whole app.

**Action:**
1. Create a `<ErrorBoundary>` component
2. Wrap each route's component in an error boundary
3. Add a fallback UI that offers "Retry" or "Go to Dashboard"

### TST-03 (P2): Add Frontend Component Tests

**Problem:** No component tests exist despite extensive `data-testid` attributes.

**Action:**
1. Set up `@testing-library/react` + `vitest` + `happy-dom`
2. Write smoke tests for key pages:
   - Dashboard renders tabs correctly
   - Sign-in page renders Clerk components
   - Map editor loads with correct grid
3. Target the components that are already extractable (post A-01)

---

## Documentation

### D-01 (P1): Document OpenAPI Spec Regeneration

**Action:**
1. Add a `CONTRIBUTING.md` section explaining:
   - When to regenerate (any schema/route change)
   - Command: `pnpm --filter @workspace/api-client-react generate`
   - Verification step: check that `api.schemas.ts` changed as expected

### D-02 (P2): Add Startup Checks Documentation

**Action:**
1. Document all required env vars and their fallback chains in a `.env.example` or ENVVARS.md
2. Clearly mark which secrets must be distinct from each other

---

## Summary by Priority

| Priority | Count | Key Items |
|----------|-------|-----------|
| **P0**   | 1 | Replace `dangerouslySetInnerHTML` (S-01) |
| **P1**   | 11 | Split dashboard (A-01), DB migrations (A-02), multi-tenant cache (A-03), token secrets (T-01), rate limiting (T-02), ACL enforcement (S-02), security headers (S-03), embedding metrics (O-01), integration tests (TST-01), generated hooks consistency (T-03), fallback chain (S-01 related) |
| **P2**   | 9 | Recap DB concurrency (A-04), consolidate shadcn (A-05), replace raw fetch (T-03), query key helpers (T-04), notes sanitization (S-04), request tracing (O-02), error boundaries (TST-02), component tests (TST-03), OpenAPI docs (D-01) |
| **P3**   | 2 | Soft-delete campaigns (O-03), startup checks doc (D-02) |
| **Total**| **23** | |

**Quick Wins (can be done in < 1 hour):**
- T-01: Add startup validation for distinct token secrets
- S-03: Add helmet middleware
- T-04: Replace string query keys with generated helpers
- O-02: Add request ID middleware
