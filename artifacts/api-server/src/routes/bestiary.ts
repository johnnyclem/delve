import { Router, type IRouter } from "express";
import {
  db,
  referenceChunksTable,
  campaignsTable,
  type SrdEdition,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { requireAuth, requireCampaignMember } from "../middlewares/requireAuth";
import { getOrCreateCampaign } from "../lib/campaign";

const router: IRouter = Router();

const VALID_EDITIONS: ReadonlySet<SrdEdition> = new Set(["2014", "2024"]);

class InvalidEditionError extends Error {
  constructor() {
    super("Invalid edition. Must be '2014' or '2024'.");
  }
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

// CR strings come from the SRD as plain numbers, fractions ("1/8",
// "1/4", "1/2"), or "0". Convert to a sortable / filterable number.
function parseCr(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = raw.trim();
  if (!s) return null;
  if (s.includes("/")) {
    const [a, b] = s.split("/").map((p) => Number(p));
    if (Number.isFinite(a) && Number.isFinite(b) && b !== 0) return a / b;
    return null;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function trimOrNull(s: string | null | undefined): string | null {
  if (s == null) return null;
  const t = s.trim();
  return t.length === 0 ? null : t;
}

function csvParam(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

interface MonsterRow extends Record<string, unknown> {
  entity_slug: string;
  title: string;
  source_url: string | null;
  type: string | null;
  size: string | null;
  alignment: string | null;
  cr_text: string | null;
}

// Selects one chunk per monster — the one containing the metadata
// header (challenge rating). Multi-part monster bodies (e.g. vampire,
// troll) are stored as multiple chunks, but only the first one carries
// the structured fields we filter on.
const monsterBaseSelect = (edition: SrdEdition) => sql`
  SELECT
    entity_slug,
    title,
    source_url,
    substring(body_md from '\\*\\*type\\*\\*:\\s*([^\\n]+)') AS type,
    substring(body_md from '\\*\\*size\\*\\*:\\s*([^\\n]+)') AS size,
    substring(body_md from '\\*\\*alignment\\*\\*:\\s*([^\\n]+)') AS alignment,
    substring(body_md from '\\*\\*challenge rating\\*\\*:\\s*([^\\n]+)') AS cr_text
  FROM ${referenceChunksTable}
  WHERE ${referenceChunksTable.entityKind} = 'monster'
    AND ${referenceChunksTable.edition} = ${edition}
    AND body_md ILIKE '%challenge rating%'
`;

router.get(
  "/bestiary",
  requireAuth,
  requireCampaignMember,
  async (req, res): Promise<void> => {
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

    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const types = csvParam(req.query.type);
    const sizes = csvParam(req.query.size);
    const alignments = csvParam(req.query.alignment);
    const crMin = req.query.crMin != null ? Number(req.query.crMin) : null;
    const crMax = req.query.crMax != null ? Number(req.query.crMax) : null;
    const limitParam = Number.parseInt(String(req.query.limit ?? "100"), 10);
    const limit = Number.isFinite(limitParam)
      ? Math.min(500, Math.max(1, limitParam))
      : 100;
    const offsetParam = Number.parseInt(String(req.query.offset ?? "0"), 10);
    const offset = Number.isFinite(offsetParam) ? Math.max(0, offsetParam) : 0;

    // Pull the full monster set for this edition once. The total upper
    // bound is ~334 entries per edition so a full scan + in-process
    // filter is cheaper and simpler than building dynamic SQL with
    // partial regex predicates.
    const result = await db.execute<MonsterRow>(monsterBaseSelect(edition));
    const all = result.rows.map((r) => ({
      slug: r.entity_slug,
      title: r.title,
      sourceUrl: r.source_url,
      type: trimOrNull(r.type)?.toLowerCase() ?? null,
      size: trimOrNull(r.size) ?? null,
      alignment: trimOrNull(r.alignment) ?? null,
      cr: parseCr(r.cr_text),
    }));

    const qLower = q.toLowerCase();
    const filtered = all.filter((m) => {
      if (qLower && !m.title.toLowerCase().includes(qLower)) return false;
      if (types.length > 0) {
        const t = m.type ?? "";
        if (!types.some((needle) => t.includes(needle))) return false;
      }
      if (sizes.length > 0) {
        const s = (m.size ?? "").toLowerCase();
        if (!sizes.includes(s)) return false;
      }
      if (alignments.length > 0) {
        const a = (m.alignment ?? "").toLowerCase();
        if (!alignments.some((needle) => a.includes(needle))) return false;
      }
      if (crMin != null && Number.isFinite(crMin)) {
        if (m.cr == null || m.cr < crMin) return false;
      }
      if (crMax != null && Number.isFinite(crMax)) {
        if (m.cr == null || m.cr > crMax) return false;
      }
      return true;
    });

    filtered.sort((a, b) => {
      const ca = a.cr ?? Number.POSITIVE_INFINITY;
      const cb = b.cr ?? Number.POSITIVE_INFINITY;
      if (ca !== cb) return ca - cb;
      return a.title.localeCompare(b.title);
    });

    const page = filtered.slice(offset, offset + limit);

    res.json({
      edition,
      total: filtered.length,
      offset,
      limit,
      items: page,
    });
  },
);

router.get(
  "/bestiary/facets",
  requireAuth,
  requireCampaignMember,
  async (req, res): Promise<void> => {
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

    const result = await db.execute<MonsterRow>(monsterBaseSelect(edition));
    const types = new Map<string, number>();
    const sizes = new Map<string, number>();
    const alignments = new Map<string, number>();
    let total = 0;
    let crMin: number | null = null;
    let crMax: number | null = null;

    for (const r of result.rows) {
      total += 1;
      const t = trimOrNull(r.type)?.toLowerCase();
      if (t) types.set(t, (types.get(t) ?? 0) + 1);
      const s = trimOrNull(r.size);
      if (s) sizes.set(s, (sizes.get(s) ?? 0) + 1);
      const a = trimOrNull(r.alignment);
      if (a) alignments.set(a, (alignments.get(a) ?? 0) + 1);
      const cr = parseCr(r.cr_text);
      if (cr != null) {
        if (crMin == null || cr < crMin) crMin = cr;
        if (crMax == null || cr > crMax) crMax = cr;
      }
    }

    const toFacet = (m: Map<string, number>) =>
      Array.from(m.entries())
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => a.value.localeCompare(b.value));

    res.json({
      edition,
      total,
      crMin,
      crMax,
      types: toFacet(types),
      sizes: toFacet(sizes),
      alignments: toFacet(alignments),
    });
  },
);

export default router;
