import { Router, type IRouter } from "express";
import {
  db,
  referenceChunksTable,
  campaignsTable,
  monsterImagesTable,
  REFERENCE_ENTITY_KINDS,
  type SrdEdition,
  type ReferenceEntityKind,
} from "@workspace/db";
import { and, asc, eq, sql } from "drizzle-orm";
import { requireAuth, requireCampaignMember } from "../middlewares/requireAuth";
import { getOrCreateCampaign } from "../lib/campaign";

const router: IRouter = Router();

const VALID_EDITIONS: ReadonlySet<SrdEdition> = new Set(["2014", "2024"]);
const VALID_KINDS: ReadonlySet<string> = new Set(REFERENCE_ENTITY_KINDS);

class InvalidEditionError extends Error {
  constructor() {
    super("Invalid edition. Must be '2014' or '2024'.");
  }
}

function parseKind(raw: unknown): ReferenceEntityKind | null {
  return typeof raw === "string" && VALID_KINDS.has(raw)
    ? (raw as ReferenceEntityKind)
    : null;
}

async function resolveEdition(raw: unknown): Promise<SrdEdition> {
  if (typeof raw === "string" && raw.length > 0) {
    if (!VALID_EDITIONS.has(raw as SrdEdition)) {
      throw new InvalidEditionError();
    }
    return raw as SrdEdition;
  }
  const campaignId = await getOrCreateCampaign();
  const [campaign] = await db
    .select({ defaultEdition: campaignsTable.defaultEdition })
    .from(campaignsTable)
    .where(eq(campaignsTable.id, campaignId));
  return (campaign?.defaultEdition as SrdEdition | undefined) ?? "2024";
}

router.get("/rules/search", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (!q) {
    res.status(400).json({ error: "Query parameter 'q' is required" });
    return;
  }
  let edition: SrdEdition;
  try {
    edition = await resolveEdition(req.query.edition);
  } catch (err) {
    if (err instanceof InvalidEditionError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
  const kindFilter = parseKind(req.query.kind);
  const limitParam = Number.parseInt(String(req.query.limit ?? "20"), 10);
  const limit = Number.isFinite(limitParam) ? Math.min(50, Math.max(1, limitParam)) : 20;

  const whereParts = [sql`${referenceChunksTable.edition} = ${edition}`];
  whereParts.push(sql`${referenceChunksTable.tsv} @@ websearch_to_tsquery('english', ${q})`);
  if (kindFilter) {
    whereParts.push(sql`${referenceChunksTable.entityKind} = ${kindFilter}`);
  }

  const rows = await db
    .select({
      id: referenceChunksTable.id,
      edition: referenceChunksTable.edition,
      entityKind: referenceChunksTable.entityKind,
      entitySlug: referenceChunksTable.entitySlug,
      section: referenceChunksTable.section,
      title: referenceChunksTable.title,
      bodyMd: referenceChunksTable.bodyMd,
      sourceUrl: referenceChunksTable.sourceUrl,
      rank: sql<number>`ts_rank(${referenceChunksTable.tsv}, websearch_to_tsquery('english', ${q}))`,
      snippet: sql<string>`ts_headline('english', ${referenceChunksTable.bodyMd}, websearch_to_tsquery('english', ${q}), 'StartSel="«",StopSel="»",MaxFragments=2,MinWords=5,MaxWords=20,ShortWord=2')`,
    })
    .from(referenceChunksTable)
    .where(and(...whereParts))
    .orderBy(sql`ts_rank(${referenceChunksTable.tsv}, websearch_to_tsquery('english', ${q})) DESC`)
    .limit(limit);

  res.json({
    edition,
    query: q,
    hits: rows.map((r) => ({
      id: r.id,
      edition: r.edition as SrdEdition,
      entityKind: r.entityKind,
      entitySlug: r.entitySlug,
      section: r.section,
      title: r.title,
      snippet: r.snippet ?? r.bodyMd.slice(0, 200),
      sourceUrl: r.sourceUrl,
    })),
  });
});

router.get("/rules/:kind/:slug", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const kind = parseKind(req.params.kind);
  if (!kind) {
    res.status(400).json({ error: "Invalid rule kind" });
    return;
  }
  const slug = String(req.params.slug ?? "");
  let edition: SrdEdition;
  try {
    edition = await resolveEdition(req.query.edition);
  } catch (err) {
    if (err instanceof InvalidEditionError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }

  const rows = await db
    .select()
    .from(referenceChunksTable)
    .where(
      and(
        eq(referenceChunksTable.edition, edition),
        eq(referenceChunksTable.entityKind, kind),
        eq(referenceChunksTable.entitySlug, slug),
      ),
    )
    .orderBy(asc(referenceChunksTable.id));

  if (rows.length === 0) {
    res.status(404).json({ error: "Reference entity not found" });
    return;
  }

  const first = rows[0];

  // Monster portraits are shared across editions and stored in
  // `monster_images` keyed by slug. Other entity kinds don't have
  // generated artwork yet — return null so the FE fallback fires.
  let imageUrl: string | null = null;
  if (kind === "monster") {
    const [img] = await db
      .select({ objectPath: monsterImagesTable.objectPath })
      .from(monsterImagesTable)
      .where(eq(monsterImagesTable.slug, first.entitySlug));
    imageUrl = img?.objectPath ?? null;
  }

  res.json({
    edition,
    entityKind: first.entityKind,
    entitySlug: first.entitySlug,
    title: first.title,
    sourceUrl: first.sourceUrl,
    imageUrl,
    chunks: rows.map((r) => ({
      id: r.id,
      section: r.section,
      title: r.title,
      bodyMd: r.bodyMd,
    })),
  });
});

export default router;
