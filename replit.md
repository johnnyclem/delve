# D&D 5e Campaign Manager

## Overview

A private D&D 5e campaign manager web app for ~6 users. Single campaign, no multi-tenancy.

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

- `artifacts/dnd-manager/` — React frontend (dark fantasy theme, Cinzel serif + Inter sans)
- `artifacts/api-server/` — Express API server (port 8080)
- `lib/api-spec/` — OpenAPI spec + Orval codegen config
- `lib/api-client-react/` — Generated React Query hooks
- `lib/api-zod/` — Generated Zod validators
- `lib/db/` — Drizzle schema + migrations
- `lib/integrations-openai-ai-server/` — OpenAI integration proxy

## Database Schema

- `campaigns` — Single campaign record (includes `invite_code` for joining)
- `campaign_members` — Users in the campaign (role: dm/player, unique index on `(campaign_id, user_id)`)
- `characters` — Character sheets (JSON-backed sheetJson)
- `session_logs` — Session notes + AI recaps
- `calendar_events` — Scheduled sessions
- `rsvps` — RSVPs for calendar events
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
- **CORS**: Currently allows all origins (tighten for production)
- **Typed middleware**: `AuthenticatedRequest` interface with helper functions (`getUserId`, `getCampaignMember`, `getUserDisplayName`, `getUserAvatarUrl`) to avoid `as any` casts in routes.

## Key Features

- **Auth**: Clerk with dark theme, "Return to the Tavern" / "Join the Party" copy. Landing page IS the sign-in page (no marketing page).
- **Join flow**: Non-members see a "Join Campaign" page with invite code input. DM shares invite code from dashboard.
- **Dashboard**: Overview with next session, party members, latest recap, recent rolls. DM sees invite code.
- **Characters**: List + detail view with editable 5e character sheets
- **Sessions**: Create sessions, add DM notes, generate AI recaps. Players see recaps but not raw DM notes.
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

Requires campaign membership:
- GET /members — list members
- GET /characters — list characters
- GET /characters/:id — get character detail
- PATCH /characters/:id — update character (owner only)
- GET /sessions — list session logs (rawNotesMd stripped for players)
- POST /sessions — create session (DM only)
- GET /sessions/:id — get session detail (rawNotesMd stripped for players)
- PATCH /sessions/:id — update session (DM only)
- POST /sessions/:id/generate-recap — generate AI recap (DM only)
- GET /sessions/latest-recap — get latest recap (rawNotesMd stripped)
- GET /calendar — list events
- POST /calendar — create event (DM only)
- GET /calendar/:id — get event with RSVPs
- PATCH /calendar/:id — update event (DM only)
- PUT /calendar/:eventId/rsvp — upsert RSVP
- POST /dice/roll — roll dice
- GET /dice/recent — recent rolls

## Theme

Dark mode default. Purple primary (#9333ea). Cinzel serif for headings, Inter for body. Warm parchment tones for foreground text.
