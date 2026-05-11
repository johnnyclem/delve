# Delve — Shared Test Account

A pre-seeded demo account lets you (and anyone you share it with) sign in and explore Delve without creating a personal account.

## Credentials

| Field    | Value              |
| -------- | ------------------ |
| Email    | `demo@delve.app`   |
| Password | `Delve@Demo2025`   |

## What's pre-seeded

Signing in with these credentials lands on a dashboard that already contains:

- **A campaign** — the demo user is DM (if the campaign's DM slot was unclaimed) or player (if a real user already owns the campaign). Either role provides full dashboard access.
- **3 characters**: Thorn Ironsong (Human Fighter 5), Lyra Moonwhisper (High Elf Wizard 5), Brom Stonefoot (Hill Dwarf Cleric 5)
- **3 sessions** (sessions 1 and 2 have full narrative recaps; session 3 has DM notes only and is ready for recap generation)

## How the seed works

The seed script targets the same campaign the app resolves at runtime — the first campaign row returned by `SELECT … LIMIT 1`, matching `getOrCreateCampaign()` exactly. On a fresh database it creates a new campaign called "The Shattered Crown". On an existing database it reuses that first campaign, ensuring the demo user is always a member of the exact campaign the app serves.

**DM privilege rule**: the demo user is granted DM only when the campaign's DM slot is unclaimed (`pending`). If a real user already owns the campaign, the demo user is added as a player — it never steals another user's DM status.

## Running the seed

The seed script is idempotent — running it multiple times never creates duplicates.

### Development

```bash
pnpm --filter @workspace/api-server run seed:test-user
```

Make sure `CLERK_SECRET_KEY` and `DATABASE_URL` are set in your environment before running.

### Production

The seed must also be run once against the production database to make the account available in the deployed app. Use the **production** `CLERK_SECRET_KEY` and `DATABASE_URL` together — if your Clerk dev and production instances are separate tenants, you must use the key that matches the production app:

```bash
CLERK_SECRET_KEY="<prod-clerk-secret>" DATABASE_URL="<prod-db-url>" pnpm --filter @workspace/api-server run seed:test-user
```

If your project uses a single shared Clerk tenant for both dev and production, the `CLERK_SECRET_KEY` already in your environment is sufficient and you only need to override `DATABASE_URL`.

## Security note

Anyone with these credentials has the demo user's role (DM or player) on the seeded campaign. Do not store sensitive campaign data under this account. If you want to revoke access, delete or change the password of `demo@delve.app` in your Clerk dashboard.
