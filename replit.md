# Delve — D&D 5e Campaign Manager

## Overview

A private D&D 5e campaign manager web app for ~6 users. Single campaign, no multi-tenancy. Branded as **Delve** with an "Arcane Artifact" dark glass UI identity.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React 19 + Vite + Tailwind CSS v4 + shadcn/ui
- **Auth**: Clerk (social + email login)
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **AI**: OpenAI (gpt-4o) for session recaps via Replit AI Integrations
- **Build**: esbuild (API server CJS bundle), Vite (frontend)

## Architecture

- `artifacts/dnd-manager/` — React frontend ("Delve" brand, dark glass UI, Inter sans + JetBrains Mono for numbers)
- `artifacts/api-server/` — Express API server (port 8080)
- `lib/api-spec/` — OpenAPI spec + Orval codegen config
- `lib/api-client-react/` — Generated React Query hooks
- `lib/api-zod/` — Generated Zod validators
- `lib/db/` — Drizzle schema + migrations
- `lib/integrations-openai-ai-server/` — OpenAI integration proxy

## Database Schema

- `campaigns` — Single campaign record (includes `invite_code` for joining)
- `campaign_members` — Users in the campaign (role: dm/player, `email_notifications` boolean default false, unique index on `(campaign_id, user_id)`)
- `characters` — Character sheets (JSON-backed sheetJson)
- `session_logs` — Session notes + AI recaps
- `recap_views` — Tracks which players have viewed which recaps (unique index on `(session_log_id, user_id)`)
- `calendar_events` — Scheduled sessions (`series_id` + `recurrence_rule` for recurring series)
- `rsvps` — RSVPs for calendar events
- `notification_logs` — Email delivery log; `kind` ∈ {`recap`, `event_invite`}, nullable `session_log_id` / `calendar_event_id`
- `dice_rolls` — Dice roll history

## Security

- **Auth**: Clerk middleware (plain `clerkMiddleware()` — no callback pattern)
- **Authorization**: `requireAuth` (JWT validation) + `requireCampaignMember` (membership check) on all campaign-scoped routes
- **Membership gating**: First user auto-enrolls as DM via `bootstrapDmIfNeeded()`. All subsequent users must join with invite code via `POST /members/join`. No auto-enrollment for non-first users.
- **DM-only data**: `rawNotesMd` stripped from session responses for non-DM users via `stripDmFields()`. DM Notes section hidden from players in the frontend.
- **DM-only actions**: Session/event create/update, recap generation gated by `isDm()` check
- **Owner-only actions**: Character updates gated by `ownerUserId` check
- **Entity scoping**: All entity queries (read + write) scope by both `id` and `campaignId`
- **Invite code flow**: Campaign has `inviteCode` column. DM sees invite code on dashboard. Players enter code to join via `POST /members/join`.
- **XSS prevention**: HTML escaped before markdown rendering (`dangerouslySetInnerHTML`)
- **CORS**: In production, cross-origin requests are blocked by default (frontend and API share the same domain via path-based routing). Set `ALLOWED_ORIGINS` env var (comma-separated URLs) to allow specific external origins. In development, all origins are allowed.
- **Typed middleware**: `AuthenticatedRequest` interface with helper functions (`getUserId`, `getCampaignMember`, `getUserDisplayName`, `getUserAvatarUrl`) to avoid `as any` casts in routes.

## Key Features

- **Auth**: Clerk with dark glass theme, "Welcome Back" / "Begin Your Journey" copy. Landing page IS the sign-in page (no marketing page).
- **Join flow**: Non-members see a "Join Campaign" page with invite code input. DM shares invite code from dashboard.
- **Dashboard**: Overview with session stats card (total sessions + recap count + session trend sparkline chart showing sessions per month over last 6 months), next session, party members, latest recap, recent rolls. DM sees invite code.
- **Characters**: List + detail view with editable 5e character sheets + multi-step creation wizard (basics → ability scores → combat → details)
- **Sessions**: Create sessions, add DM notes, generate AI recaps. Players see recaps but not raw DM notes. DM notes have autosave: drafts persist to localStorage immediately on each keystroke, and auto-save to the server via debounced PATCH (30s after last keystroke). Drafts are restored when re-opening edit mode if the server version hasn't changed. Visual status indicators show auto-save progress. Custom hook: `use-autosave.ts`. Players get notified of new recaps via "New" badge + toast; notification clears after viewing. **Multi-tab conflict detection**: Uses optimistic concurrency via integer `version` column + `expectedVersion` field in PATCH requests. Atomic `UPDATE ... WHERE version = ?` with auto-increment prevents race conditions. If another tab/window has saved changes, the API returns 409 Conflict with the current server session data. The UI shows an amber conflict banner with "Keep my changes" (force overwrite) and "Load server version" (discard local) options. Single-tab usage is unaffected. Optional email notifications: players can toggle "Recap emails" in the sidebar to receive an email when a new recap is generated (requires `RESEND_API_KEY` env var; uses Clerk Backend API for email lookup).
- **Calendar**: Schedule sessions with RSVP (yes/maybe/no)
- **Dice Roller**: Roll any dice expression (e.g. 2d6+3) with shared log
- **Roles**: First user auto-becomes DM; subsequent users join with invite code as players

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## API Routes (all under /api)

Auth-only (no membership required):
- GET /healthz — health check
- GET /members/me — get current user's membership (404 if not a member)
- GET /campaign/dashboard — dashboard (auto-enrolls first user as DM, 403 for non-members)
- GET /campaign — get campaign info
- POST /members/join — join campaign with invite code
- PATCH /members/me/notifications — update email notification preferences

Requires campaign membership:
- GET /members — list members
- GET /characters — list characters
- POST /characters — create character (any member)
- GET /characters/:id — get character detail
- PATCH /characters/:id — update character (owner only)
- GET /sessions — list session logs (rawNotesMd stripped for players; includes hasNewRecap boolean for players)
- POST /sessions — create session (DM only)
- GET /sessions/:id — get session detail (rawNotesMd stripped for players)
- PATCH /sessions/:id — update session (DM only, supports `expectedVersion` integer for atomic optimistic concurrency → 409 on conflict)
- POST /sessions/:id/generate-recap — generate AI recap (DM only, clears recap_views so players see it as new)
- POST /sessions/:id/mark-recap-viewed — mark recap as viewed by current player
- GET /sessions/latest-recap — get latest recap (rawNotesMd stripped)
- GET /calendar — list events
- POST /calendar — create event (DM only); accepts `recurrence: { freq, until }` to generate a series and fires themed invite emails (capped at first 8 occurrences)
- GET /calendar/:id — get event with RSVPs
- PATCH /calendar/:id — update event (DM only)
- DELETE /calendar/:id?series=true — delete single event or whole series (DM only)
- GET /calendar/:id/notifications — invite delivery logs (DM only)
- PUT /calendar/:eventId/rsvp — upsert RSVP

Public (no auth — HMAC-signed tokens):
- GET /unsubscribe?token=… — recap email opt-out
- GET /rsvp/:token?response=yes|no|maybe — confirmation page (no state change)
- POST /rsvp/:token — commits RSVP (split GET/POST avoids email-prefetch auto-clicks)
- POST /dice/roll — roll dice
- GET /dice/recent — recent rolls

## Theme / Brand — "Delve"

Dark-only "Scrying Mirror" glass UI. Obsidian background (#09090B). Arcane Purple primary (hsl 270 100% 60%). Neon Magenta secondary (hsl 320 100% 50%). Inter for all text (tracking -0.01em, Medium 500 body / SemiBold 600 headings). JetBrains Mono for changing numeric values (HP, AC, dice results). Glass panels: translucent fill (white 4% opacity), backdrop-blur 20px, 1px glass borders with directional light catch, purple underglow shadow. Framer Motion spring-based button tap animations (scale 0.95, stiffness 400, damping 17). Dice results use fade-up drift animation. tabular-nums on all numeric displays.
