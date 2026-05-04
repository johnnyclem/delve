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

- `campaigns` — Single campaign record
- `campaign_members` — Users in the campaign (role: dm/player)
- `characters` — Character sheets (JSON-backed sheetJson)
- `session_logs` — Session notes + AI recaps
- `calendar_events` — Scheduled sessions
- `rsvps` — RSVPs for calendar events
- `dice_rolls` — Dice roll history

## Security

- **Auth**: Clerk middleware (plain `clerkMiddleware()` — no callback pattern)
- **Authorization**: `requireAuth` (JWT validation) + `requireCampaignMember` (membership check) on all campaign-scoped routes
- **Entry points**: `/members/me` and `/campaign/dashboard` auto-enroll users via `ensureMember()`; all other routes require existing membership
- **DM-only actions**: Session/event create/update, recap generation gated by `isDm()` check
- **Owner-only actions**: Character updates gated by `ownerUserId` check
- **Entity scoping**: All entity queries (read + write) scope by both `id` and `campaignId`
- **XSS prevention**: HTML escaped before markdown rendering (`dangerouslySetInnerHTML`)
- **CORS**: Currently allows all origins (tighten for production)

## Key Features

- **Auth**: Clerk with dark theme, "Return to the Tavern" / "Join the Party" copy
- **Dashboard**: Overview with next session, party members, latest recap, recent rolls
- **Characters**: List + detail view with editable 5e character sheets
- **Sessions**: Create sessions, add DM notes, generate AI recaps
- **Calendar**: Schedule sessions with RSVP (yes/maybe/no)
- **Dice Roller**: Roll any dice expression (e.g. 2d6+3) with shared log
- **Roles**: First user auto-becomes DM; subsequent users are players

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## API Routes (all under /api)

Auth-only (no membership required):
- GET /healthz — health check
- GET /members/me — get/create current user's membership
- GET /campaign/dashboard — dashboard (auto-enrolls user)

Requires campaign membership:
- GET /campaign — get campaign info
- GET /members — list members
- GET /characters — list characters
- GET /characters/:id — get character detail
- PATCH /characters/:id — update character (owner only)
- GET /sessions — list session logs
- POST /sessions — create session (DM only)
- GET /sessions/:id — get session detail
- PATCH /sessions/:id — update session (DM only)
- POST /sessions/:id/generate-recap — generate AI recap (DM only)
- GET /sessions/latest-recap — get latest recap
- GET /calendar — list events
- POST /calendar — create event (DM only)
- GET /calendar/:id — get event with RSVPs
- PATCH /calendar/:id — update event (DM only)
- PUT /calendar/:eventId/rsvp — upsert RSVP
- POST /dice/roll — roll dice
- GET /dice/recent — recent rolls

## Theme

Dark mode default. Purple primary (#9333ea). Cinzel serif for headings, Inter for body. Warm parchment tones for foreground text.
