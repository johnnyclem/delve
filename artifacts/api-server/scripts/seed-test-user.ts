/**
 * Test-user seed script.
 *
 * Creates (or reuses) a shared demo account in Clerk and ensures the demo user
 * is a member of the campaign that the app resolves at runtime (the first row
 * by id, mirroring getOrCreateCampaign). Sample characters and sessions are
 * seeded into that same campaign.
 *
 * IDEMPOTENT — safe to run multiple times:
 *   - Clerk user is looked up by email; created only if absent.
 *   - Campaign is the same row the app resolves (id ORDER BY id LIMIT 1).
 *     Created fresh only when the table is empty.
 *   - If campaign dmUserId is "pending" the demo user claims DM.
 *   - If campaign dmUserId is already the demo user they remain DM.
 *   - If campaign is owned by a real user the demo user is added as player so
 *     they can still access the dashboard without privilege escalation.
 *   - Membership row is inserted only if absent; role is not downgraded.
 *   - Characters are matched by (campaignId, name); existing rows are skipped.
 *   - Sessions are matched by (campaignId, sessionNumber); existing rows are skipped.
 *
 * Usage (from repo root):
 *   pnpm --filter @workspace/api-server run seed:test-user
 *
 * Required env vars:
 *   CLERK_SECRET_KEY   — Clerk backend secret key
 *   DATABASE_URL       — PostgreSQL connection string
 *
 * SECURITY NOTE: DM role is granted on the app-resolved campaign ONLY when the
 * campaign's DM slot is unclaimed ("pending"). If a real user already owns the
 * campaign the demo account is added as a player — it never steals DM status
 * from a live user.
 */

import { createClerkClient } from "@clerk/express";
import {
  db,
  campaignsTable,
  campaignMembersTable,
  charactersTable,
  sessionLogsTable,
  pool,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import crypto from "node:crypto";

const TEST_EMAIL = "demo@delve.app";
const TEST_PASSWORD = "Delve@Demo2025";
const TEST_DISPLAY_NAME = "Demo Adventurer";

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;

function log(label: string, msg: string) {
  console.log(`  ${bold(label.padEnd(18))} ${msg}`);
}

function generateInviteCode(): string {
  return crypto.randomBytes(4).toString("hex").toUpperCase();
}

async function main(): Promise<void> {
  console.log(bold("\n=== Delve — test-user seed ===\n"));

  if (!process.env.CLERK_SECRET_KEY) {
    console.error("❌  CLERK_SECRET_KEY is not set. Aborting.");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("❌  DATABASE_URL is not set. Aborting.");
    process.exit(1);
  }

  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

  // ── 1. Clerk user ──────────────────────────────────────────────────────────
  let clerkUserId: string;

  const { data: existingUsers } = await clerk.users.getUserList({
    emailAddress: [TEST_EMAIL],
    limit: 1,
  });

  if (existingUsers.length > 0) {
    clerkUserId = existingUsers[0].id;
    log("Clerk user", green(`already exists  (${clerkUserId})`));
  } else {
    const created = await clerk.users.createUser({
      emailAddress: [TEST_EMAIL],
      password: TEST_PASSWORD,
      firstName: "Demo",
      lastName: "Adventurer",
      skipPasswordChecks: false,
    });
    clerkUserId = created.id;
    log("Clerk user", green(`created  (${clerkUserId})`));
  }

  // ── 2. Campaign — mirror getOrCreateCampaign() resolution ─────────────────
  // The app resolves the campaign via `db.select().from(campaignsTable).limit(1)`
  // (no explicit ORDER BY). We match that exact query so the seed targets the
  // same row the app will serve to the demo user at runtime.
  const [existingCampaign] = await db
    .select()
    .from(campaignsTable)
    .limit(1);

  let campaignId: number;
  let campaignName: string;
  let demoUserRole: "dm" | "player";

  if (existingCampaign) {
    campaignId = existingCampaign.id;
    campaignName = existingCampaign.name;

    if (
      existingCampaign.dmUserId === "pending" ||
      existingCampaign.dmUserId === clerkUserId
    ) {
      // Slot is unclaimed or already ours — take / keep DM.
      demoUserRole = "dm";
      if (existingCampaign.dmUserId === "pending") {
        await db
          .update(campaignsTable)
          .set({ dmUserId: clerkUserId })
          .where(eq(campaignsTable.id, campaignId));
        log("Campaign", yellow(`"${campaignName}"  (id=${campaignId}) — claimed DM slot`));
      } else {
        log("Campaign", green(`"${campaignName}"  (id=${campaignId}) — demo user is DM`));
      }
    } else {
      // A real user is DM. Add demo user as player — they still get full
      // dashboard read access without escalating privileges.
      demoUserRole = "player";
      log(
        "Campaign",
        yellow(
          `"${campaignName}"  (id=${campaignId}) — owned by another user; demo added as player`,
        ),
      );
    }
  } else {
    // Empty database — create a fresh campaign for the demo user.
    const [created] = await db
      .insert(campaignsTable)
      .values({
        name: "The Shattered Crown",
        worldName: "Aethoria",
        dmUserId: clerkUserId,
        inviteCode: generateInviteCode(),
        timezone: "UTC",
      })
      .returning();
    campaignId = created.id;
    campaignName = created.name;
    demoUserRole = "dm";
    log("Campaign", green(`created  "${campaignName}"  (id=${campaignId})`));
  }

  // ── 3. Membership ──────────────────────────────────────────────────────────
  const [existingMember] = await db
    .select()
    .from(campaignMembersTable)
    .where(
      and(
        eq(campaignMembersTable.campaignId, campaignId),
        eq(campaignMembersTable.userId, clerkUserId),
      ),
    );

  if (existingMember) {
    log("Membership", green(`already a member  (role: ${existingMember.role})`));
    // Reconcile role: if the demo user was previously added as player but we
    // now resolved them as DM (e.g. they claimed the pending slot), upgrade
    // the member row so DM-gated routes work correctly.
    if (demoUserRole === "dm" && existingMember.role !== "dm") {
      await db
        .update(campaignMembersTable)
        .set({ role: "dm" })
        .where(eq(campaignMembersTable.id, existingMember.id));
      log("Membership", yellow("role upgraded to dm"));
    }
  } else {
    await db.insert(campaignMembersTable).values({
      campaignId,
      userId: clerkUserId,
      role: demoUserRole,
      displayName: TEST_DISPLAY_NAME,
      avatarUrl: null,
    });
    log("Membership", green(`added as ${demoUserRole}`));
  }

  // ── 4. Characters ──────────────────────────────────────────────────────────
  const characterSeeds = [
    {
      name: "Thorn Ironsong",
      race: "Human",
      class: "Fighter",
      level: 5,
      sheetJson: {
        abilityScores: { str: 18, dex: 12, con: 16, int: 10, wis: 12, cha: 8 },
        hp: { current: 44, max: 44 },
        ac: 17,
        speed: 30,
        proficiencyBonus: 3,
        savingThrows: { str: true, con: true },
        skills: { Athletics: true, Intimidation: true },
        background: "Soldier",
        alignment: "Lawful Good",
        personalityTraits: "I face problems head-on.",
        ideals: "Responsibility.",
        bonds: "Those who fight beside me are worth dying for.",
        flaws: "I make rash decisions in the heat of battle.",
      },
    },
    {
      name: "Lyra Moonwhisper",
      race: "High Elf",
      class: "Wizard",
      level: 5,
      sheetJson: {
        abilityScores: { str: 8, dex: 14, con: 12, int: 18, wis: 13, cha: 11 },
        hp: { current: 27, max: 27 },
        ac: 12,
        speed: 30,
        proficiencyBonus: 3,
        savingThrows: { int: true, wis: true },
        skills: { Arcana: true, History: true, Investigation: true },
        background: "Sage",
        alignment: "Neutral Good",
        personalityTraits: "I quote ancient tomes on every topic.",
        ideals: "Knowledge is the path to power.",
        bonds: "I seek a tome stolen from my mentor's library.",
        flaws: "I overlook obvious solutions in favour of complex ones.",
      },
    },
    {
      name: "Brom Stonefoot",
      race: "Hill Dwarf",
      class: "Cleric",
      level: 5,
      sheetJson: {
        abilityScores: { str: 14, dex: 9, con: 16, int: 11, wis: 18, cha: 12 },
        hp: { current: 38, max: 38 },
        ac: 16,
        speed: 25,
        proficiencyBonus: 3,
        savingThrows: { wis: true, cha: true },
        skills: { Medicine: true, Insight: true, Religion: true },
        background: "Acolyte",
        alignment: "Lawful Good",
        personalityTraits: "I see omens in every event and action.",
        ideals: "Faith. I trust that the divine will guide my hammer.",
        bonds: "My holy symbol was a gift from a dear friend now lost.",
        flaws: "I am suspicious of strangers and expect the worst.",
      },
    },
  ];

  const existingChars = await db
    .select()
    .from(charactersTable)
    .where(eq(charactersTable.campaignId, campaignId));

  let charsCreated = 0;
  let charsSkipped = 0;
  const charIds: Record<string, number> = {};

  for (const seed of characterSeeds) {
    const existing = existingChars.find((c) => c.name === seed.name);
    if (existing) {
      charIds[seed.name] = existing.id;
      charsSkipped++;
    } else {
      const [inserted] = await db
        .insert(charactersTable)
        .values({ campaignId, ownerUserId: clerkUserId, ...seed })
        .returning();
      charIds[seed.name] = inserted.id;
      charsCreated++;
    }
  }

  log("Characters", green(`${charsCreated} created, ${charsSkipped} already existed`));

  // ── 5. Sessions ────────────────────────────────────────────────────────────
  const allCharIds = Object.values(charIds);

  const sessionSeeds = [
    {
      sessionNumber: 1,
      title: "The Crooked Crown Tavern",
      playedAt: new Date("2025-10-04T19:00:00Z"),
      rawNotesMd: `Party met for the first time at the Crooked Crown Tavern in Millhaven.
Hired by innkeeper Daran to clear rats from the cellar — turned out to be giant rats led by a wererat named Skrix.
Thorn cornered Skrix behind the barrels while Lyra cast Sleep on the smaller rats.
Brom healed Thorn for 8 HP mid-fight. Skrix surrendered and revealed he was working for someone called "the Pale Hand."
Party earned 15gp each and a room for the night.`,
      recapMd: `## Narrative

The adventure began in the smoky common room of the Crooked Crown Tavern, where three strangers were drawn together by coin and circumstance. Innkeeper Daran had a problem: something was raiding his cellar every night, and his patience — much like his stock of aged Thornfield ale — was running dry.

What waited in the cellar was no ordinary vermin. A pack of giant rats answered to Skrix, a wererat who had made the vaults his kingdom. Thorn drove Skrix into the far corner while Lyra's Sleep incantation silenced the scuttling horde. Brom kept the fighter on his feet with a well-timed healing word.

Faced with Brom's warhammer and nowhere to run, Skrix broke. He admitted serving a figure known only as **the Pale Hand** — a name that meant nothing to the party yet but hung in the cellar air like the smell of old stone.

## Key Events

- Party assembled at the Crooked Crown Tavern and accepted a job from innkeeper Daran.
- Descended to the cellar; encountered giant rats and their wererat leader, Skrix.
- Thorn cornered Skrix; Lyra cast Sleep to neutralise the smaller rats.
- Brom healed Thorn for 8 HP during the fight.
- Skrix surrendered and named the Pale Hand as his patron.
- Party received 15 gp each and free lodging for the night.`,
      attendees: {
        characterIds: allCharIds,
        npcs: [{ name: "Skrix the Wererat" }, { name: "Daran the Innkeeper" }],
      },
    },
    {
      sessionNumber: 2,
      title: "Into the Hollow Cliffs",
      playedAt: new Date("2025-10-18T19:00:00Z"),
      rawNotesMd: `Party followed rumours north of Millhaven to the Hollow Cliffs.
Found a cave entrance guarded by two goblin scouts — Thorn dispatched them quickly.
Inside: shrine to an unknown deity (crescent moon over a black eye), locked iron chest.
Lyra identified the shrine as possibly tied to the Pale Hand cult.
Brom picked the lock (eventually); chest had 60gp, a silver ring engraved with "For M.", and a rolled parchment map.
Map shows a route to something labelled "Cradle of the Pale Hand" in the mountains.
Session ended as party heard distant drumming deeper in the cave.`,
      recapMd: `## Narrative

Rumours led the party north along the Millhaven road to the Hollow Cliffs, a jagged wound in the hillside where the wind moaned between the rocks. Two goblin scouts barred the entrance — a problem Thorn resolved efficiently while Lyra kept watch on the road.

Inside, torchlight revealed a shrine unlike any in the standard faith: a crescent moon arching over a lidded black eye. Lyra's knowledge of arcane iconography placed it near the orbit of the Pale Hand — the same shadowy patron Skrix had invoked a fortnight ago.

The iron chest demanded more patience than the goblins. Brom worked the lock with steady hands until the tumblers surrendered. Within: sixty gold pieces, a silver ring engraved *For M.*, and a tightly rolled parchment. The map it bore showed a mountain path terminating at a location marked **Cradle of the Pale Hand**.

Deep in the cave, drums began.

## Key Events

- Party followed rumours to the Hollow Cliffs cave entrance.
- Thorn defeated two goblin scouts guarding the entrance.
- Lyra linked the shrine's crescent-moon-over-eye symbol to the Pale Hand cult.
- Brom unlocked the iron chest.
- Chest contained 60 gp, a silver ring engraved "For M.", and a map.
- Map reveals a route to a location called "Cradle of the Pale Hand."
- Session ended with drumming heard from deeper in the cave.`,
      attendees: {
        characterIds: allCharIds,
        npcs: [{ name: "Goblin Scout (x2)" }],
      },
    },
    {
      sessionNumber: 3,
      title: "The Pale Hand Stirs",
      playedAt: new Date("2025-11-01T19:00:00Z"),
      rawNotesMd: `Party pressed deeper into the cave following the drums.
Large ritual chamber — 6 cultists in grey robes around a stone altar. Pale Hand symbol on every wall.
Thorn charged; Lyra cast Fireball (thank you level 5 spell slots) — 4 cultists down immediately.
Remaining 2 cultists fled through a hidden passage in the north wall.
Altar had a body on it — merchant from Millhaven, Aldric Fenn, barely alive. Party stabilised him.
Aldric said he was kidnapped 3 days ago and witnessed a ritual involving a black gem.
Black gem was gone; hidden passage led outside to a cliff trail, footprints heading northeast.
Party escorted Aldric back to Millhaven. Sheriff offered 50gp bounty on the cult.`,
      recapMd: null,
      attendees: {
        characterIds: allCharIds,
        npcs: [{ name: "Aldric Fenn, Merchant" }, { name: "Pale Hand Cultists" }],
      },
    },
  ];

  // Sessions are keyed by title (stable sentinel) rather than sessionNumber so
  // demo sessions are inserted even when session numbers 1–3 are already taken
  // by a pre-existing campaign. New sessions are appended after the current max.
  const existingSessions = await db
    .select()
    .from(sessionLogsTable)
    .where(eq(sessionLogsTable.campaignId, campaignId));

  const existingTitles = new Set(existingSessions.map((s) => s.title));
  const maxSessionNumber = existingSessions.reduce(
    (max, s) => Math.max(max, s.sessionNumber),
    0,
  );

  let sessionsCreated = 0;
  let sessionsSkipped = 0;
  let nextSessionNumber = maxSessionNumber + 1;

  for (const seed of sessionSeeds) {
    if (existingTitles.has(seed.title)) {
      sessionsSkipped++;
      continue;
    }
    // Prefer the canonical session number if it is available; otherwise append.
    const sessionNumberInUse = existingSessions.some(
      (s) => s.sessionNumber === seed.sessionNumber,
    );
    const assignedNumber = sessionNumberInUse ? nextSessionNumber++ : seed.sessionNumber;
    await db.insert(sessionLogsTable).values({
      campaignId,
      sessionNumber: assignedNumber,
      title: seed.title,
      playedAt: seed.playedAt,
      rawNotesMd: seed.rawNotesMd,
      recapMd: seed.recapMd ?? null,
      generatedAt: seed.recapMd ? seed.playedAt : null,
      recapStatus: seed.recapMd ? "done" : "idle",
      attendees: seed.attendees,
      version: 1,
    });
    sessionsCreated++;
  }

  log("Sessions", green(`${sessionsCreated} created, ${sessionsSkipped} already existed`));

  // ── 6. Post-seed recap assertion ───────────────────────────────────────────
  // Confirm at least one recap-bearing session exists for the demo user's
  // campaign so the dashboard shows a populated "Latest Recap" card.
  const allSessions = await db
    .select()
    .from(sessionLogsTable)
    .where(eq(sessionLogsTable.campaignId, campaignId));
  const recapCount = allSessions.filter(
    (s) => s.recapMd && s.recapMd.trim().length > 0,
  ).length;

  if (recapCount === 0) {
    log(
      "Recaps",
      yellow(
        "⚠  No recap-bearing sessions found. The campaign may have pre-existing sessions that occupy numbers 1-3. Generate a recap manually from the Sessions tab.",
      ),
    );
  } else {
    log("Recaps", green(`${recapCount} session(s) with recap confirmed`));
  }

  // ── Done ───────────────────────────────────────────────────────────────────
  console.log(`
${bold("✅  Seed complete.")}

${bold("Test account credentials")}
  Email    ${green(TEST_EMAIL)}
  Password ${green(TEST_PASSWORD)}
  Role     ${green(demoUserRole)} on campaign "${campaignName}" (id=${campaignId})

Sign in at the app's /sign-in page with these credentials.
The dashboard will show the campaign, ${characterSeeds.length} characters, and ${sessionSeeds.length} sessions (${sessionSeeds.filter((s) => s.recapMd).length} with recaps).

${dim("Re-running this script is safe — existing data is never duplicated.")}
${dim("DM role is only claimed when the campaign's DM slot is unclaimed (dmUserId='pending').")}
${dim("To make the account available in the deployed app, run this script once")}
${dim("against the production DATABASE_URL (CLERK_SECRET_KEY is shared).")}
`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
