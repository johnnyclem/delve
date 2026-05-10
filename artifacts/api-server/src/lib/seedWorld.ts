// Curated SRD-based starter content for brand-new campaigns.
//
// Pulls from the already-licensed SRD bestiary cached in `reference_chunks`
// and inserts a small, tasteful set of `npc` and `mob_encounter` entities
// into a campaign so DMs have something to work with on day one.
//
// Idempotent: re-running on a campaign that already has some of these
// entries will only fill the gaps (uses the unique
// (campaign_id, kind, slug) constraint via ON CONFLICT DO NOTHING).
import { sql } from "drizzle-orm";
import {
  db,
  campaignEntitiesTable,
  campaignsTable,
  referenceChunksTable,
  type SrdEdition,
} from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { syncEntityChunks } from "./entityEmbeddings";
import { logger } from "./logger";

interface NpcSeed {
  srdSlug: string;
  name: string;
  occupation: string;
  disposition: "friendly" | "neutral" | "hostile" | "unknown";
  hint: string;
}

interface MobSeed {
  srdSlug: string;
  name: string;
  count: number;
  hint: string;
}

// Keep these short and tasteful — quality over quantity.
const NPC_SEEDS: NpcSeed[] = [
  {
    srdSlug: "guard",
    name: "Town Guard",
    occupation: "City Watch",
    disposition: "neutral",
    hint: "Standard town watchman — useful as a contact, witness, or patrol encounter.",
  },
  {
    srdSlug: "acolyte",
    name: "Temple Acolyte",
    occupation: "Junior Cleric",
    disposition: "friendly",
    hint: "Devoted novice at a local temple. Good source of healing and rumors.",
  },
  {
    srdSlug: "commoner",
    name: "Townsfolk",
    occupation: "Laborer",
    disposition: "neutral",
    hint: "Generic peasant or shopkeeper to populate the world.",
  },
  {
    srdSlug: "noble",
    name: "Local Noble",
    occupation: "Aristocrat",
    disposition: "neutral",
    hint: "Wealthy, well-connected, and probably hiding something.",
  },
  {
    srdSlug: "bandit-captain",
    name: "Bandit Captain",
    occupation: "Outlaw Leader",
    disposition: "hostile",
    hint: "Charismatic outlaw — works as a recurring villain or quest target.",
  },
  {
    srdSlug: "mage",
    name: "Court Mage",
    occupation: "Wizard",
    disposition: "neutral",
    hint: "Skilled spellcaster — patron, advisor, or eccentric scholar.",
  },
  {
    srdSlug: "veteran",
    name: "Veteran Soldier",
    occupation: "Mercenary Captain",
    disposition: "neutral",
    hint: "Hardened warrior available as a hireling or rival.",
  },
];

const MOB_SEEDS: MobSeed[] = [
  { srdSlug: "goblin", name: "Goblin Raiders", count: 6, hint: "Classic low-CR ambush." },
  { srdSlug: "kobold", name: "Kobold Pack", count: 8, hint: "Cowardly but cunning trapsetters." },
  { srdSlug: "wolf", name: "Wolf Pack", count: 4, hint: "Wilderness encounter staple." },
  { srdSlug: "bandit", name: "Bandit Gang", count: 5, hint: "Roadside human threat." },
  { srdSlug: "orc", name: "Orc War Band", count: 4, hint: "Mid-tier brutal raiders." },
  { srdSlug: "ogre", name: "Lone Ogre", count: 1, hint: "A single mid-CR brute fight." },
  { srdSlug: "young-red-dragon", name: "Young Red Dragon", count: 1, hint: "High-stakes set-piece encounter." },
];

function makeEntitySlug(srdSlug: string): string {
  return `srd-${srdSlug}`;
}

/**
 * Extract `**label**: value` pairs from rendered SRD body markdown.
 */
function extractField(body: string, label: string): string | null {
  const re = new RegExp(
    `\\*\\*${label.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}\\*\\*:\\s*([^\\n]+)`,
    "i",
  );
  const m = body.match(re);
  return m ? m[1].trim() : null;
}

function normalizeCr(raw: string | null): string | null {
  if (!raw) return null;
  const num = Number(raw);
  if (!Number.isFinite(num)) return raw;
  if (num === 0.125) return "1/8";
  if (num === 0.25) return "1/4";
  if (num === 0.5) return "1/2";
  if (Number.isInteger(num)) return String(num);
  return String(num);
}

interface ChunkRow {
  id: number;
  edition: SrdEdition;
  entitySlug: string;
  title: string;
  bodyMd: string;
  sourceUrl: string | null;
}

async function loadMonsterChunks(
  slugs: string[],
  preferEdition: SrdEdition,
): Promise<Map<string, ChunkRow>> {
  if (slugs.length === 0) return new Map();
  const rows = await db
    .select({
      id: referenceChunksTable.id,
      edition: referenceChunksTable.edition,
      entitySlug: referenceChunksTable.entitySlug,
      title: referenceChunksTable.title,
      bodyMd: referenceChunksTable.bodyMd,
      sourceUrl: referenceChunksTable.sourceUrl,
    })
    .from(referenceChunksTable)
    .where(
      and(
        eq(referenceChunksTable.entityKind, "monster"),
        inArray(referenceChunksTable.entitySlug, slugs),
      ),
    );

  // Pick the best chunk per slug: prefer the requested edition, prefer
  // the section-less / longest body (heuristic for the "main" stat block).
  const bySlug = new Map<string, ChunkRow>();
  for (const r of rows as ChunkRow[]) {
    const cur = bySlug.get(r.entitySlug);
    if (!cur) {
      bySlug.set(r.entitySlug, r);
      continue;
    }
    const curEdMatch = cur.edition === preferEdition ? 1 : 0;
    const newEdMatch = r.edition === preferEdition ? 1 : 0;
    if (newEdMatch > curEdMatch) {
      bySlug.set(r.entitySlug, r);
      continue;
    }
    if (newEdMatch === curEdMatch && r.bodyMd.length > cur.bodyMd.length) {
      bySlug.set(r.entitySlug, r);
    }
  }
  return bySlug;
}

function buildPublicMd(name: string, body: string, kindLabel: "npc" | "mob"): string {
  const type = extractField(body, "type");
  const size = extractField(body, "size");
  const align = extractField(body, "alignment");
  const cr = normalizeCr(extractField(body, "challenge rating"));
  const parts: string[] = [];
  const descBits: string[] = [];
  if (size) descBits.push(size);
  if (type) descBits.push(type);
  const head = descBits.join(" ").trim();
  if (head) {
    parts.push(`${name} — ${head}${align ? `, ${align}` : ""}.`);
  }
  if (kindLabel === "mob" && cr) parts.push(`Challenge rating ${cr}.`);
  parts.push("Drawn from the SRD bestiary as starter content.");
  return parts.join(" ");
}

export interface SeedSummary {
  added: { npc: number; mob_encounter: number };
  skipped: { npc: number; mob_encounter: number };
  missing: string[];
  bestiaryAvailable: boolean;
}

export async function bestiaryAvailable(): Promise<boolean> {
  const [row] = await db
    .select({ id: referenceChunksTable.id })
    .from(referenceChunksTable)
    .where(eq(referenceChunksTable.entityKind, "monster"))
    .limit(1);
  return !!row;
}

/**
 * Seeds a campaign with the curated SRD starter NPCs and mob encounters.
 * Idempotent — entities whose (campaign, kind, slug) already exist are
 * left untouched and counted as `skipped`.
 */
export async function seedCampaignWorldFromSrd(
  campaignId: number,
): Promise<SeedSummary> {
  const summary: SeedSummary = {
    added: { npc: 0, mob_encounter: 0 },
    skipped: { npc: 0, mob_encounter: 0 },
    missing: [],
    bestiaryAvailable: true,
  };

  if (!(await bestiaryAvailable())) {
    summary.bestiaryAvailable = false;
    return summary;
  }

  const [campaign] = await db
    .select({ defaultEdition: campaignsTable.defaultEdition })
    .from(campaignsTable)
    .where(eq(campaignsTable.id, campaignId))
    .limit(1);
  const preferEdition: SrdEdition = (campaign?.defaultEdition as SrdEdition) ?? "2024";

  const allSlugs = Array.from(
    new Set([...NPC_SEEDS.map((s) => s.srdSlug), ...MOB_SEEDS.map((s) => s.srdSlug)]),
  );
  const chunkBySlug = await loadMonsterChunks(allSlugs, preferEdition);

  const inserts: Array<{
    kind: "npc" | "mob_encounter";
    slug: string;
    name: string;
    publicMd: string;
    dmNotes: string | null;
    data: Record<string, unknown>;
  }> = [];

  for (const seed of NPC_SEEDS) {
    const chunk = chunkBySlug.get(seed.srdSlug);
    if (!chunk) {
      summary.missing.push(seed.srdSlug);
      continue;
    }
    const race = extractField(chunk.bodyMd, "type") ?? "humanoid";
    inserts.push({
      kind: "npc",
      slug: makeEntitySlug(seed.srdSlug),
      name: seed.name,
      publicMd: buildPublicMd(seed.name, chunk.bodyMd, "npc"),
      dmNotes: `${seed.hint}\n\nSRD reference: ${chunk.title}${chunk.sourceUrl ? ` (${chunk.sourceUrl})` : ""}`,
      data: {
        race: race.charAt(0).toUpperCase() + race.slice(1),
        occupation: seed.occupation,
        disposition: seed.disposition,
        srdSlug: seed.srdSlug,
        srdEdition: chunk.edition,
        srdChunkId: chunk.id,
      },
    });
  }

  for (const seed of MOB_SEEDS) {
    const chunk = chunkBySlug.get(seed.srdSlug);
    if (!chunk) {
      summary.missing.push(seed.srdSlug);
      continue;
    }
    const cr = normalizeCr(extractField(chunk.bodyMd, "challenge rating"));
    const creatureType = extractField(chunk.bodyMd, "type") ?? "creature";
    inserts.push({
      kind: "mob_encounter",
      slug: makeEntitySlug(seed.srdSlug),
      name: seed.name,
      publicMd: buildPublicMd(seed.name, chunk.bodyMd, "mob"),
      dmNotes: `${seed.hint}\n\nSRD reference: ${chunk.title}${chunk.sourceUrl ? ` (${chunk.sourceUrl})` : ""}`,
      data: {
        cr: cr ?? undefined,
        count: seed.count,
        creatureType,
        srdSlug: seed.srdSlug,
        srdEdition: chunk.edition,
        srdChunkId: chunk.id,
      },
    });
  }

  // Insert idempotently with ON CONFLICT DO NOTHING on the unique
  // (campaign_id, kind, slug) constraint. RETURNING tells us which rows
  // were actually inserted vs already present.
  for (const r of inserts) {
    try {
      const inserted = await db.execute<{ id: number }>(sql`
        INSERT INTO campaign_entities
          (campaign_id, kind, slug, name, public_md, dm_notes, data, revealed)
        VALUES (
          ${campaignId},
          ${r.kind},
          ${r.slug},
          ${r.name},
          ${r.publicMd},
          ${r.dmNotes},
          ${JSON.stringify(r.data)}::jsonb,
          false
        )
        ON CONFLICT (campaign_id, kind, slug) DO NOTHING
        RETURNING id
      `);
      const rows = (inserted as unknown as { rows?: Array<{ id: number }> }).rows
        ?? (inserted as unknown as Array<{ id: number }>);
      const newRow = Array.isArray(rows) ? rows[0] : undefined;
      if (newRow?.id) {
        summary.added[r.kind] += 1;
        // Best-effort embedding sync. Failures are logged but don't break seeding.
        await syncEntityChunks(newRow.id, campaignId, [
          { field: "public_md", body: r.publicMd },
          { field: "dm_notes", body: r.dmNotes },
        ]);
      } else {
        summary.skipped[r.kind] += 1;
      }
    } catch (err) {
      logger.error({ err, slug: r.slug, kind: r.kind }, "[seed-world] insert failed");
    }
  }

  return summary;
}
