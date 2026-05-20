# Delve Security Audit Report

**Generated:** 2026-05-12  
**Scope:** Full-stack monorepo — api-server, frontend, db, entity-embeddings, integrations

Severity key: **CRITICAL** | **HIGH** | **MEDIUM** | **LOW** | **INFO**

---

## CRITICAL

### C-01: XSS via `dangerouslySetInnerHTML` in Chat and House Rules

**Files:**
- `artifacts/dnd-manager/src/components/chat-panel.tsx`
- `artifacts/dnd-manager/src/pages/house-rules-share.tsx`

**Issue:** Both the chat panel and the public house-rules share page use `dangerouslySetInnerHTML` with a custom Markdown-to-HTML renderer. If the `escapeHtml` utility misses any edge case (nested HTML entities, unclosed tags, attribute injection via Markdown syntax), an attacker who can influence chat messages or house-rules content can execute arbitrary JavaScript in viewers' browsers.

**Risk:** Chat messages come from the AI (OpenAI), which could be prompt-injected. House rules are authored by the DM. An XSS in the public house-rules share page is especially dangerous since it requires no authentication.

**Recommendation:**
- Replace `dangerouslySetInnerHTML` with a safe Markdown renderer that runs in a sanitized DOM context (e.g., `rehype-sanitize` + `rehype-react`, or `DOMPurify` on the output HTML).
- Add a Content-Security-Policy header with `script-src 'self'` to limit XSS blast radius even if injection occurs.

---

## HIGH

### H-01: HMAC Secret Fallback Chain Collision

**Files:**
- `artifacts/api-server/src/lib/rsvp-token.ts:9-14`
- `artifacts/api-server/src/lib/unsubscribe.ts:10-15`

**Issue:** Both token libraries use an identical fallback chain:
```
RSVP_SECRET → UNSUBSCRIBE_SECRET → CLERK_SECRET_KEY → SESSION_SECRET
```

If `CLERK_SECRET_KEY` is reused as the signing key for both RSVP and unsubscribe tokens (because neither `RSVP_SECRET` nor `UNSUBSCRIBE_SECRET` is set), the same key signs tokens for two different purposes. An RSVP token could theoretically be replayed as an unsubscribe token (or vice versa) since both use `HS256` with the same key and similar payload structures.

**Risk:** Medium-high depending on deployment config. If only `CLERK_SECRET_KEY` is set, the fallback chain collapses both token types to the same secret.

**Recommendation:**
- Enforce distinct secrets: require `RSVP_SECRET` and `UNSUBSCRIBE_SECRET` env vars at startup; fail fast if missing.
- Add a `purpose` claim to the JWT payload (`"purpose": "rsvp"` / `"purpose": "unsubscribe"`) and verify it on the receiving end.

### H-02: Empty ACL Enforcement (`ObjectAccessGroupType`)

**File:** `artifacts/api-server/src/lib/objectAcl.ts`

**Issue:** The ACL framework has a well-structured policy model (`ObjectAccessPolicy`, `CampaignObjectAccessPolicy`, `ObjectAccessEntry`, etc.) and a `getEffectiveAccess` function, but the `ObjectAccessGroupType` enum is defined as empty (`as const satisfies string[]` with no members). This means **no group-level access control is actually enforced** — all object storage access falls through to the default public/private path resolution in `objectStorage.ts`.

**Risk:** Any object marked as "private" relies solely on the unpredictability of its object storage path (a UUID). There is no group-based access revocation, no per-campaign object isolation beyond path naming conventions, and no audit trail for object access.

**Recommendation:**
- Populate `ObjectAccessGroupType` with actual group types (e.g., `"campaign_member"`, `"dm"`, `"player"`).
- Wire `getEffectiveAccess` into the object storage proxy/download endpoints.
- Add database-backed object-to-group mappings or use the existing `campaign_members` table for campaign-scoped object access.

### H-03: SSRF via Portrait URL (Partial)

**File:** `artifacts/api-server/src/routes/characters.ts` (portrait handling)

**Issue:** The `fetchPortraitBytes` function only fetches from internal `/objects/` paths when a portrait URL references internal storage. However, externally-hosted portrait URLs (`http://...`, `https://...`) are silently embedded as-is in the generated character sheet PDF without server-side fetch validation. An attacker who controls their character's `portrait_url` could:
- Embed a URL that exfiltrates data when the PDF is opened (via PDF hyperlinks or embedded resources)
- Point to a local network resource if the PDF renderer follows embedded links

**Risk:** Limited because the PDF generation itself doesn't fetch external URLs — it embeds them as references. But if the PDF library resolves embedded URLs during rendering, this becomes SSRF.

**Recommendation:**
- For externally-hosted portrait URLs, validate the URL against an allowlist of image hosts, or proxy the fetch through the server (with length limits and content-type validation).
- Sanitize URLs in the PDF generation pipeline to strip hyperlink behavior from embedded images.

---

## MEDIUM

### M-01: Single-Tenant Campaign Caching

**File:** `artifacts/api-server/src/lib/campaign.ts:7`

**Issue:** The `cachedCampaignId` variable is an in-memory module-level `number | null`:

```typescript
let cachedCampaignId: number | null = null;
```

This assumes exactly one campaign exists per deployment. In a multi-tenant scenario (which the schema clearly supports — `campaigns` table with `dm_user_id`), users in different campaigns would all resolve to the same cached campaign. Invalidation only happens on campaign creation, not on switching campaigns.

**Risk:** Cross-campaign data exposure if a new campaign is created while traffic to the first campaign is still in-flight. Subsequent requests may use the wrong `campaignId`.

**Recommendation:**
- Remove the module-level cache and query the campaign by `dm_user_id` directly (it's already indexed by the PK).
- Or, key the cache by `userId` instead of a single scalar.

### M-02: Per-Process Recap Concurrency (No DB Lock)

**Files:**
- `artifacts/api-server/src/lib/recap-runner.ts`
- `artifacts/api-server/src/lib/recap-runner.ts:21` (commented warning)

**Issue:** The recap runner uses an in-memory `Map<number, RunState>` to track per-session run state. The code itself acknowledges this gap with a comment:

> // TODO: if we ever run multiple instances, we need a DB advisory lock here

In a multi-instance deployment (which Replit supports via multiple repls), two instances could both decide a session needs a recap, both compute it, and both write to the database — with the second write silently overwriting the first.

**Risk:** Lost updates, duplicate recap emails, and wasted OpenAI API costs.

**Recommendation:**
- Implement `pg_try_advisory_lock()` wrapping the recap generation critical section.
- Use the `version` column on `session_logs` for optimistic locking in the recap update query.

### M-03: No Rate Limiting on Authenticated Endpoints

**Files:** All route handlers except RSVP and unsubscribe

**Issue:** Rate limiting (`express-rate-limit`) is only applied to public endpoints (`/rsvp`, `/unsubscribe`). All authenticated endpoints (entities, chat, sessions, characters, maps) have no rate limiting. An authenticated attacker with valid Clerk credentials can:

- Flood the OpenAI chat endpoint, incurring unbounded API costs
- Mass-create/delete entities, causing database load
- Trigger unlimited recap generations

**Risk:** Financial (OpenAI API costs), availability (DB load, rate limits on upstream APIs).

**Recommendation:**
- Add per-user rate limiting to cost-sensitive endpoints (`/chat`, `/sessions/recap`, `/entities`).
- Use Clerk's `sessionClaims` to key rate limit buckets by user ID.
- Consider a spending cap or budget tracking for OpenAI API calls.

### M-04: Clerk Proxy Middleware for Custom Domains

**File:** `artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts`

**Issue:** The Clerk proxy middleware forwards frontend API requests to Clerk's FAPI endpoint for custom domain support. If the path or domain validation is insufficient, this could be used as an open redirect or SSRF proxy to Clerk's internal endpoints or arbitrary URLs.

**Recommendation:**
- Strictly validate that the proxied path matches expected Clerk API patterns (`/clerk/*`).
- Add hostname allowlisting for the proxy target.
- Rate-limit the proxy endpoint to prevent abuse as a general-purpose HTTP relay.

### M-05: Audio Upload Memory Pressure

**File:** `artifacts/api-server/src/routes/sessions.ts` (audio handling)

**Issue:** Audio uploads use Multer `memoryStorage` with a 25MB limit. A 25MB file stored in a Node.js buffer could cause significant memory pressure under concurrent uploads. Since the file is then streamed to OpenAI's transcription API, the entire buffer stays in memory during the API call.

**Risk:** DoS via memory exhaustion with moderate concurrent uploads (e.g., 8 concurrent 25MB uploads = 200MB RSS increase).

**Recommendation:**
- Use Multer `diskStorage` with a temp directory and stream to OpenAI from disk.
- Or reduce the upload limit (e.g., 10MB) for audio files.
- Add concurrency limiting for the transcription endpoint.

### M-06: Missing Security Headers

**File:** `artifacts/api-server/src/app.ts`

**Issue:** The application does not set standard security headers:
- No `Content-Security-Policy` (critical for XSS mitigation)
- No `X-Content-Type-Options: nosniff`
- No `X-Frame-Options: DENY`
- No `Referrer-Policy`

**Recommendation:**
- Add `helmet` middleware or manually set security headers in `app.ts`.
- CSP should be strict for the API server and allow the Clerk CDN for the frontend.

---

## LOW

### L-01: Hardcoded Demo Credentials

**File:** `artifacts/dnd-manager/src/components/sign-in-page.tsx`

**Issue:** Demo account credentials (`demo@delve.app` / `Delve@Demo2025`) are hardcoded in the frontend source. Anyone inspecting the source code can sign in as the demo user. The demo user is restricted to read-only, but the existence of a well-known shared account makes abuse easier.

**Recommendation:**
- Move demo credentials to a backend-configurable location (admin API or env vars).
- Ensure the backend strictly enforces the demo user's read-only restriction (already done via `requireAuth` middleware).

### L-02: No CSRF Protection

**Issue:** The frontend uses Clerk's cookie-based session authentication. There is no CSRF token validation on state-changing API endpoints. While SameSite cookies provide some protection, they are not sufficient for all deployment scenarios (e.g., cross-site embedding, legacy browsers).

**Recommendation:**
- Enable Clerk's CSRF protection if available, or implement double-submit cookie pattern.
- Ensure `SameSite=Lax` or `Strict` on all cookies.

### L-03: Embedding Failures Silently Swallowed

**File:** `artifacts/api-server/src/lib/entityEmbeddings.ts`

**Issue:** `syncEntityChunks` catches all errors and only logs them. Entity CRUD operations succeed even when embedding fails. While this is intentional for resilience, it means:
- The `embedding` column silently remains `NULL` for new/updated entities
- No alerting or monitoring detects embedding failures
- The chat RAG system silently falls back to keyword-only search, which users may perceive as degraded quality without explanation

**Recommendation:**
- Add metric counters for embedding failures (prometheus or structured log aggregation).
- Consider a retry queue or webhook for failed embeddings.

### L-04: No Input Sanitization on Session Notes

**File:** `artifacts/api-server/src/routes/sessions.ts`

**Issue:** Session `raw_notes_md` is stored and processed as-is. While markdown is expected, there's no sanitization before it's sent in the recap prompt context. Malicious markdown in notes could theoretically influence the LLM prompt (indirect prompt injection via stored content).

**Recommendation:**
- Strip or escape HTML tags from notes before including them in LLM context.
- Add a content size limit for notes beyond the DB column constraint.

### L-05: CORS Dev Mode Permissive

**File:** `artifacts/api-server/src/app.ts`

**Issue:** In development, `ALLOWED_ORIGINS` defaults to `true` (allow all origins). This is standard for development but could accidentally be deployed if the env var isn't set.

**Recommendation:**
- Add a startup warning/ping when `ALLOWED_ORIGINS === true` in non-development environments.
- Consider a `NODE_ENV` check.

### L-06: No Audit Trail for Campaign Deletion

**Issue:** Cascade deletes from `campaigns` remove all child data (entities, chunks, sessions, messages, etc.) without an audit trail. A campaign deletion is irreversible and untracked.

**Recommendation:**
- Add a `deleted_at` soft-delete column to `campaigns` and related tables, or log deletion events to a separate audit table.

---

## INFO

### I-01: `trust proxy: 1` for Replit Edge Proxy

**File:** `artifacts/api-server/src/app.ts`

**Note:** `app.set('trust proxy', 1)` is set for the Replit edge proxy. If deployed behind additional proxies (Cloudflare, etc.), the trust level may need to increase to `2` or more for correct client IP detection.

### I-02: Generated API Client Checked In

Orval-generated files (`api.ts`, `api.schemas.ts`) are checked into version control. This is acceptable but requires discipline to regenerate on OpenAPI spec changes. No CI step validates they are in sync.

### I-03: `pnpm` Supply Chain Protection

**File:** `pnpm-workspace.yaml`

`minimumReleaseAge: 1440` (1 day) is configured, which protects against package hijack attacks that push malicious versions. Good practice.

### I-04: Clerk JWT Validation

Clerk middleware validates JWTs on every request. The `requireAuth` middleware properly extracts `userId` and `sessionClaims`. Demo user enforcement blocks destructive methods. This is well-implemented.

### I-05: Pino Logger Redaction

**File:** `artifacts/api-server/src/lib/logger.ts`

The logger redacts `Authorization`, `Cookie`, and `Set-Cookie` headers. This prevents accidental credential leakage in logs. Consider also redacting `X-Clerk-Secret-Key` or any custom auth headers.

---

## Summary

| Severity | Count | Key Areas |
|----------|-------|-----------|
| CRITICAL | 1 | XSS in chat/house-rules via `dangerouslySetInnerHTML` |
| HIGH     | 3 | HMAC secret collision, empty ACL enforcement, portrait URL SSRF |
| MEDIUM   | 6 | Single-tenant cache, per-process concurrency, missing rate limits, Clerk proxy, audio upload memory, missing security headers |
| LOW      | 6 | Demo credentials, CSRF, silent embedding failures, notes sanitization, CORS dev mode, deletion audit |
| INFO     | 5 | trust proxy, generated client, supply chain, Clerk JWT, logger redaction |
| **Total**| **21** | |

**Top 3 Priorities:**
1. Replace `dangerouslySetInnerHTML` with a sanitized Markdown renderer (C-01)
2. Enforce distinct HMAC secrets for RSVP and unsubscribe tokens (H-01)
3. Implement the ACL group framework or remove the dead code (H-02)
