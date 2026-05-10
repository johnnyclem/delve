// Fetches the official 5e SRD content from https://www.dnd5eapi.co
// (free, public mirror of the SRD 5.1 / 2014 and SRD 5.2 / 2024) and
// upserts it into `reference_chunks` with OpenAI embeddings.
//
// This is an alternative to the Foundry-based `srd:ingest` pipeline for
// environments where the Foundry VTT dnd5e packs are not available.
//
// Usage:
//   pnpm --filter @workspace/scripts run srd:ingest-api
//
// Optional env:
//   SRD_DRY_RUN=1            — skip embedding + DB writes
//   SRD_API_BASE             — override API base (default https://www.dnd5eapi.co)
//   SRD_EDITIONS=2014,2024   — restrict editions
//   SRD_FETCH_CONCURRENCY=8  — parallel detail fetches per edition
import pLimit from "p-limit";
import { sql } from "drizzle-orm";
import { db, pool, referenceChunksTable, type SrdEdition } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { contentHash, slugify, splitIfLong } from "./normalize";

const API_BASE = process.env.SRD_API_BASE ?? "https://www.dnd5eapi.co";
const DRY_RUN = process.env.SRD_DRY_RUN === "1";
// The Replit AI Integrations OpenAI proxy does not currently expose the
// embeddings endpoint. When SRD_NO_EMBED=1 we skip embedding entirely and
// rely on the FTS path (ts_rank over the generated tsvector). The hybrid
// retrieval code in `lib/retrieval.ts` already gracefully handles
// `embedding IS NULL`.
const NO_EMBED = process.env.SRD_NO_EMBED === "1";
const EDITIONS: SrdEdition[] = (process.env.SRD_EDITIONS ?? "2014,2024")
  .split(",")
  .map((s) => s.trim())
  .filter((s): s is SrdEdition => s === "2014" || s === "2024");
const FETCH_CONCURRENCY = Number(process.env.SRD_FETCH_CONCURRENCY ?? "8");
const EMBED_MODEL = "text-embedding-3-small";
const EMBED_DIMS = 1536;
const EMBED_BATCH = 100;
const EMBED_CONCURRENCY = 4;

// Categories we ingest. The api endpoint name maps to a `ReferenceEntityKind`.
// Some categories only exist for one edition (e.g. `races` in 2014, `species`
// in 2024). Missing categories are silently skipped.
type Kind =
  | "spell"
  | "monster"
  | "class"
  | "subclass"
  | "feat"
  | "item"
  | "background"
  | "race"
  | "subrace"
  | "condition"
  | "magicitem"
  | "rule"
  | "other";

interface CategorySpec {
  endpoint: string;
  kind: Kind;
}

const CATEGORIES_2014: CategorySpec[] = [
  { endpoint: "spells", kind: "spell" },
  { endpoint: "monsters", kind: "monster" },
  { endpoint: "classes", kind: "class" },
  { endpoint: "subclasses", kind: "subclass" },
  { endpoint: "feats", kind: "feat" },
  { endpoint: "equipment", kind: "item" },
  { endpoint: "magic-items", kind: "magicitem" },
  { endpoint: "backgrounds", kind: "background" },
  { endpoint: "races", kind: "race" },
  { endpoint: "subraces", kind: "subrace" },
  { endpoint: "conditions", kind: "condition" },
  { endpoint: "rules", kind: "rule" },
  { endpoint: "rule-sections", kind: "rule" },
  { endpoint: "ability-scores", kind: "other" },
  { endpoint: "skills", kind: "other" },
  { endpoint: "alignments", kind: "other" },
  { endpoint: "damage-types", kind: "other" },
  { endpoint: "magic-schools", kind: "other" },
  { endpoint: "languages", kind: "other" },
  { endpoint: "weapon-properties", kind: "other" },
  { endpoint: "features", kind: "other" },
  { endpoint: "traits", kind: "other" },
  { endpoint: "proficiencies", kind: "other" },
];

const CATEGORIES_2024: CategorySpec[] = [
  { endpoint: "spells", kind: "spell" },
  { endpoint: "monsters", kind: "monster" },
  { endpoint: "classes", kind: "class" },
  { endpoint: "subclasses", kind: "subclass" },
  { endpoint: "feats", kind: "feat" },
  { endpoint: "equipment", kind: "item" },
  { endpoint: "magic-items", kind: "magicitem" },
  { endpoint: "backgrounds", kind: "background" },
  { endpoint: "species", kind: "race" },
  { endpoint: "subspecies", kind: "subrace" },
  { endpoint: "conditions", kind: "condition" },
  { endpoint: "ability-scores", kind: "other" },
  { endpoint: "skills", kind: "other" },
  { endpoint: "alignments", kind: "other" },
  { endpoint: "damage-types", kind: "other" },
  { endpoint: "magic-schools", kind: "other" },
  { endpoint: "languages", kind: "other" },
  { endpoint: "weapon-properties", kind: "other" },
  { endpoint: "weapon-mastery-properties", kind: "other" },
  { endpoint: "traits", kind: "other" },
  { endpoint: "proficiencies", kind: "other" },
];

function categoriesFor(edition: SrdEdition): CategorySpec[] {
  return edition === "2014" ? CATEGORIES_2014 : CATEGORIES_2024;
}

interface PreparedChunk {
  edition: SrdEdition;
  entitySlug: string;
  entityKind: Kind;
  section: string | null;
  title: string;
  bodyMd: string;
  contentHash: string;
  sourceUrl: string | null;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return (await res.json()) as T;
}

interface ApiIndexResponse {
  count: number;
  results: Array<{ index: string; name: string; url: string }>;
}

const TITLE_FIELDS = new Set([
  "index",
  "name",
  "url",
  "updated_at",
  "_id",
  "subclasses",
]);

function fmtScalar(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

function fmtRef(v: unknown): string | null {
  if (v && typeof v === "object" && "name" in (v as Record<string, unknown>)) {
    const name = (v as { name?: unknown }).name;
    if (typeof name === "string") return name;
  }
  return null;
}

// Render an arbitrary nested JSON value into compact markdown. Used as a
// best-effort fallback for fields the API returns that we don't render
// explicitly. Keeps embeddings/text-search useful without bloating chunks.
function renderValue(v: unknown, depth = 0): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) {
    const items = v
      .map((x) => {
        const ref = fmtRef(x);
        if (ref) return ref;
        const s = fmtScalar(x);
        if (s) return s;
        return renderValue(x, depth + 1);
      })
      .filter((s) => s.length > 0);
    if (items.every((i) => !i.includes("\n") && i.length < 80)) {
      return items.join(", ");
    }
    return items.map((i) => `- ${i.replace(/\n/g, "\n  ")}`).join("\n");
  }
  if (typeof v === "object") {
    const ref = fmtRef(v);
    if (ref) return ref;
    const lines: string[] = [];
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (val == null) continue;
      if (k === "url" || k === "index" || k === "updated_at") continue;
      const rendered = renderValue(val, depth + 1).trim();
      if (!rendered) continue;
      const label = k.replace(/_/g, " ");
      if (rendered.includes("\n")) {
        lines.push(`**${label}**:\n${rendered}`);
      } else {
        lines.push(`**${label}**: ${rendered}`);
      }
    }
    return lines.join(depth === 0 ? "\n\n" : "\n");
  }
  return "";
}

function paragraphs(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v)) {
    return v
      .map((x) => (typeof x === "string" ? x : renderValue(x)))
      .filter((s) => s && s.trim().length > 0)
      .join("\n\n");
  }
  return "";
}

function renderEntity(name: string, doc: Record<string, unknown>): string {
  const parts: string[] = [`# ${name}`];

  // Render canonical free-text fields first when present.
  const desc = paragraphs(doc.desc);
  if (desc) parts.push(desc);
  const higher = paragraphs(doc.higher_level);
  if (higher) parts.push(`**At Higher Levels.** ${higher}`);
  const special = paragraphs((doc as { special?: unknown }).special);
  if (special) parts.push(special);

  // Render the rest of the structured fields.
  const skip = new Set([
    ...TITLE_FIELDS,
    "desc",
    "higher_level",
    "special",
    "image",
  ]);
  const lines: string[] = [];
  for (const [k, v] of Object.entries(doc)) {
    if (skip.has(k)) continue;
    if (v == null) continue;
    const rendered = renderValue(v).trim();
    if (!rendered) continue;
    const label = k.replace(/_/g, " ");
    if (rendered.includes("\n")) {
      lines.push(`**${label}**:\n${rendered}`);
    } else {
      lines.push(`**${label}**: ${rendered}`);
    }
  }
  if (lines.length > 0) parts.push(lines.join("\n"));

  return parts.join("\n\n").trim();
}

function prepareDoc(
  doc: Record<string, unknown>,
  edition: SrdEdition,
  spec: CategorySpec,
): PreparedChunk[] {
  const name = typeof doc.name === "string" ? doc.name.trim() : "";
  if (!name) return [];
  const indexSlug =
    typeof doc.index === "string" && doc.index.length > 0
      ? doc.index
      : slugify(name);
  const slug = slugify(indexSlug);
  const md = renderEntity(name, doc);
  if (!md) return [];

  const split = splitIfLong({ title: name, bodyMd: md });
  const sourceUrl = typeof doc.url === "string" ? `${API_BASE}${doc.url}` : null;
  return split.map((c) => ({
    edition,
    entitySlug: slug,
    entityKind: spec.kind,
    section: c.section ?? null,
    title: c.title,
    bodyMd: c.bodyMd,
    contentHash: contentHash(
      edition,
      slug,
      spec.kind,
      c.section ?? "",
      c.bodyMd,
    ),
    sourceUrl,
  }));
}

async function fetchCategory(
  edition: SrdEdition,
  spec: CategorySpec,
): Promise<PreparedChunk[]> {
  const indexUrl = `${API_BASE}/api/${edition}/${spec.endpoint}`;
  let index: ApiIndexResponse;
  try {
    index = await fetchJson<ApiIndexResponse>(indexUrl);
  } catch (err) {
    console.warn(`[srd:ingest-api] ${edition}/${spec.endpoint}: skipped (${(err as Error).message})`);
    return [];
  }
  if (!index.results?.length) return [];

  const limit = pLimit(FETCH_CONCURRENCY);
  const docs = await Promise.all(
    index.results.map((r) =>
      limit(async () => {
        try {
          return await fetchJson<Record<string, unknown>>(`${API_BASE}${r.url}`);
        } catch (err) {
          console.warn(
            `[srd:ingest-api] ${edition}/${spec.endpoint}/${r.index}: ${(err as Error).message}`,
          );
          return null;
        }
      }),
    ),
  );

  const prepared: PreparedChunk[] = [];
  for (const d of docs) {
    if (!d) continue;
    prepared.push(...prepareDoc(d, edition, spec));
  }
  console.log(
    `[srd:ingest-api] ${edition}/${spec.endpoint}: ${index.results.length} docs -> ${prepared.length} chunks`,
  );
  return prepared;
}

function vectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const res = await openai.embeddings.create({
    model: EMBED_MODEL,
    input: texts,
    dimensions: EMBED_DIMS,
  });
  return res.data.map((d) => d.embedding as unknown as number[]);
}

async function existingHashes(edition: SrdEdition): Promise<Set<string>> {
  const rows = await db
    .select({ h: referenceChunksTable.contentHash })
    .from(referenceChunksTable)
    .where(sql`${referenceChunksTable.edition} = ${edition}`);
  return new Set(rows.map((r) => r.h));
}

async function upsertChunks(
  rows: Array<PreparedChunk & { embedding: number[] | null }>,
) {
  if (rows.length === 0) return;
  await db.transaction(async (tx) => {
    for (const r of rows) {
      const embedSql = r.embedding
        ? sql`${vectorLiteral(r.embedding)}::halfvec(1536)`
        : sql`NULL`;
      await tx.execute(sql`
        INSERT INTO reference_chunks
          (edition, entity_slug, entity_kind, section, title, body_md, source_url, content_hash, embedding)
        VALUES (
          ${r.edition},
          ${r.entitySlug},
          ${r.entityKind},
          ${r.section},
          ${r.title},
          ${r.bodyMd},
          ${r.sourceUrl},
          ${r.contentHash},
          ${embedSql}
        )
        ON CONFLICT (edition, entity_slug, entity_kind, content_hash) DO NOTHING
      `);
    }
  });
}

// --- Open5e fallback for 2024 spells & monsters ---------------------------
// dnd5eapi.co's /api/2024 dataset (5e-bits) does not include spells, and
// only ships a handful of monsters. Open5e's v2 API exposes the official
// SRD 5.2 (key=`srd-2024`) for spells and creatures, so we use it to fill
// those gaps. Open5e is the canonical free mirror used by many tools.
const OPEN5E_BASE = process.env.OPEN5E_API_BASE ?? "https://api.open5e.com";

interface Open5eListResponse<T> {
  count: number;
  next: string | null;
  results: T[];
}

async function fetchOpen5eAll<T>(path: string): Promise<T[]> {
  const out: T[] = [];
  let url: string | null = `${OPEN5E_BASE}${path}`;
  while (url) {
    const page: Open5eListResponse<T> = await fetchJson<Open5eListResponse<T>>(url);
    out.push(...page.results);
    url = page.next;
  }
  return out;
}

interface Open5eSpell {
  key: string;
  name: string;
  desc?: string;
  higher_level?: string | null;
  level?: number;
  school?: { name?: string } | null;
  classes?: Array<{ name?: string }>;
  range?: number | string | null;
  ritual?: boolean;
  concentration?: boolean;
  casting_time?: string | null;
  duration?: string | null;
  components?: unknown;
  material?: string | null;
  damage_roll?: string | null;
  attack_type?: string | null;
  saving_throw_ability?: { name?: string } | null;
  target_type?: string | null;
}

function renderOpen5eSpell(s: Open5eSpell): string {
  const parts: string[] = [`# ${s.name}`];
  if (s.desc) parts.push(s.desc);
  if (s.higher_level) parts.push(`**At Higher Levels.** ${s.higher_level}`);
  const meta: string[] = [];
  if (typeof s.level === "number") meta.push(`**level**: ${s.level}`);
  if (s.school?.name) meta.push(`**school**: ${s.school.name}`);
  if (s.casting_time) meta.push(`**casting time**: ${s.casting_time}`);
  if (s.range != null) meta.push(`**range**: ${s.range}`);
  if (s.duration) meta.push(`**duration**: ${s.duration}`);
  if (s.ritual) meta.push(`**ritual**: true`);
  if (s.concentration) meta.push(`**concentration**: true`);
  if (s.material) meta.push(`**material**: ${s.material}`);
  if (s.damage_roll) meta.push(`**damage**: ${s.damage_roll}`);
  if (s.attack_type) meta.push(`**attack**: ${s.attack_type}`);
  if (s.saving_throw_ability?.name)
    meta.push(`**save**: ${s.saving_throw_ability.name}`);
  if (s.classes?.length) {
    const names = s.classes.map((c) => c.name).filter(Boolean).join(", ");
    if (names) meta.push(`**classes**: ${names}`);
  }
  if (meta.length) parts.push(meta.join("\n"));
  return parts.join("\n\n").trim();
}

interface Open5eCreature {
  key: string;
  name: string;
  type?: { name?: string } | null;
  size?: { name?: string } | null;
  alignment?: string | null;
  challenge_rating?: number | null;
  proficiency_bonus?: number | null;
  armor_class?: number | null;
  armor_detail?: string | null;
  hit_points?: number | null;
  hit_dice?: string | null;
  speed_all?: Record<string, unknown> | null;
  ability_scores?: Record<string, number> | null;
  saving_throws?: Record<string, number> | null;
  skill_bonuses?: Record<string, number> | null;
  passive_perception?: number | null;
  languages?: { as_string?: string } | null;
  resistances_and_immunities?: Record<string, unknown> | null;
  actions?: Array<{ name?: string; desc?: string; action_type?: string }>;
  traits?: Array<{ name?: string; desc?: string }>;
}

function renderOpen5eCreature(c: Open5eCreature): string {
  const parts: string[] = [`# ${c.name}`];
  const meta: string[] = [];
  if (c.type?.name) meta.push(`**type**: ${c.type.name}`);
  if (c.size?.name) meta.push(`**size**: ${c.size.name}`);
  if (c.alignment) meta.push(`**alignment**: ${c.alignment}`);
  if (c.challenge_rating != null) meta.push(`**challenge rating**: ${c.challenge_rating}`);
  if (c.armor_class != null)
    meta.push(`**armor class**: ${c.armor_class}${c.armor_detail ? ` (${c.armor_detail})` : ""}`);
  if (c.hit_points != null)
    meta.push(`**hit points**: ${c.hit_points}${c.hit_dice ? ` (${c.hit_dice})` : ""}`);
  if (c.speed_all) {
    const speeds = Object.entries(c.speed_all)
      .filter(([k, v]) => k !== "unit" && k !== "hover" && typeof v === "number" && (v as number) > 0)
      .map(([k, v]) => `${k} ${v} ft.`)
      .join(", ");
    if (speeds) meta.push(`**speed**: ${speeds}`);
  }
  if (c.ability_scores) {
    meta.push(
      `**ability scores**: ` +
        Object.entries(c.ability_scores)
          .map(([k, v]) => `${k} ${v}`)
          .join(", "),
    );
  }
  if (c.saving_throws && Object.keys(c.saving_throws).length) {
    meta.push(
      `**saving throws**: ` +
        Object.entries(c.saving_throws)
          .map(([k, v]) => `${k} ${v >= 0 ? "+" : ""}${v}`)
          .join(", "),
    );
  }
  if (c.skill_bonuses && Object.keys(c.skill_bonuses).length) {
    meta.push(
      `**skills**: ` +
        Object.entries(c.skill_bonuses)
          .map(([k, v]) => `${k} ${v >= 0 ? "+" : ""}${v}`)
          .join(", "),
    );
  }
  if (c.passive_perception != null) meta.push(`**passive perception**: ${c.passive_perception}`);
  if (c.languages?.as_string) meta.push(`**languages**: ${c.languages.as_string}`);
  if (meta.length) parts.push(meta.join("\n"));

  if (c.traits?.length) {
    const t = c.traits
      .map((tr) => (tr.name && tr.desc ? `**${tr.name}.** ${tr.desc}` : ""))
      .filter(Boolean)
      .join("\n\n");
    if (t) parts.push(`## Traits\n\n${t}`);
  }
  if (c.actions?.length) {
    const a = c.actions
      .map((ac) => (ac.name && ac.desc ? `**${ac.name}.** ${ac.desc}` : ""))
      .filter(Boolean)
      .join("\n\n");
    if (a) parts.push(`## Actions\n\n${a}`);
  }
  return parts.join("\n\n").trim();
}

function open5eKeyToSlug(k: string): string {
  // Open5e keys are formatted like `srd-2024_acid-arrow`. Strip the
  // document prefix so slugs line up with the dnd5eapi `index` slugs
  // (and therefore the 2014 rows already in the table).
  const idx = k.indexOf("_");
  return slugify(idx >= 0 ? k.slice(idx + 1) : k);
}

async function fetchOpen5eSpells2024(): Promise<PreparedChunk[]> {
  const items = await fetchOpen5eAll<Open5eSpell>(
    "/v2/spells/?document__key=srd-2024&limit=100",
  );
  console.log(`[srd:ingest-api] 2024/spells (open5e fallback): ${items.length} docs`);
  const out: PreparedChunk[] = [];
  for (const s of items) {
    if (!s.name) continue;
    const slug = open5eKeyToSlug(s.key);
    const md = renderOpen5eSpell(s);
    const split = splitIfLong({ title: s.name, bodyMd: md });
    for (const c of split) {
      out.push({
        edition: "2024",
        entitySlug: slug,
        entityKind: "spell",
        section: c.section ?? null,
        title: c.title,
        bodyMd: c.bodyMd,
        contentHash: contentHash(
          "2024",
          slug,
          "spell",
          c.section ?? "",
          c.bodyMd,
        ),
        sourceUrl: `${OPEN5E_BASE}/v2/spells/${s.key}/`,
      });
    }
  }
  return out;
}

async function fetchOpen5eMonsters2024(): Promise<PreparedChunk[]> {
  const items = await fetchOpen5eAll<Open5eCreature>(
    "/v2/creatures/?document__key=srd-2024&limit=100",
  );
  console.log(`[srd:ingest-api] 2024/monsters (open5e fallback): ${items.length} docs`);
  const out: PreparedChunk[] = [];
  for (const c of items) {
    if (!c.name) continue;
    const slug = open5eKeyToSlug(c.key);
    const md = renderOpen5eCreature(c);
    const split = splitIfLong({ title: c.name, bodyMd: md });
    for (const piece of split) {
      out.push({
        edition: "2024",
        entitySlug: slug,
        entityKind: "monster",
        section: piece.section ?? null,
        title: piece.title,
        bodyMd: piece.bodyMd,
        contentHash: contentHash(
          "2024",
          slug,
          "monster",
          piece.section ?? "",
          piece.bodyMd,
        ),
        sourceUrl: `${OPEN5E_BASE}/v2/creatures/${c.key}/`,
      });
    }
  }
  return out;
}

// Exact expected SRD entity counts per edition, measured by distinct
// `entity_slug` (not chunk count, since multi-part monsters like vampire
// or troll legitimately produce multiple chunks for one entity).
//
// These numbers come from auditing the live upstreams:
//   - dnd5eapi 2014: 334 monsters, 319 spells, 12 classes (incl.
//     subclasses exposed by the `/classes` endpoint), 15 conditions.
//   - open5e srd-2024 (with dnd5eapi 2024 fallback for non-monster
//     kinds): 330 monsters, 339 spells, 12 classes, 15 conditions.
//
// Mismatching counts cause `assertCoverage` to throw so post-merge
// automation fails loudly if a category silently drops entries.
const EXPECTED_COUNTS: Record<SrdEdition, Partial<Record<Kind, number>>> = {
  "2014": { spell: 319, monster: 334, class: 12, condition: 15 },
  "2024": { spell: 339, monster: 330, class: 12, condition: 15 },
};

function distinctSlugCounts(prepared: PreparedChunk[]): Map<Kind, number> {
  const seen = new Map<Kind, Set<string>>();
  for (const p of prepared) {
    let slugs = seen.get(p.entityKind);
    if (!slugs) {
      slugs = new Set();
      seen.set(p.entityKind, slugs);
    }
    slugs.add(p.entitySlug);
  }
  const counts = new Map<Kind, number>();
  for (const [k, s] of seen) counts.set(k, s.size);
  return counts;
}

function assertCoverage(edition: SrdEdition, prepared: PreparedChunk[]): void {
  const counts = distinctSlugCounts(prepared);
  const expected = EXPECTED_COUNTS[edition];
  const failures: string[] = [];
  for (const [kind, want] of Object.entries(expected) as Array<[Kind, number]>) {
    const got = counts.get(kind) ?? 0;
    if (got !== want) {
      failures.push(`${kind}: got ${got}, expected ${want}`);
    }
  }
  if (failures.length) {
    throw new Error(
      `[srd:ingest-api] ${edition} coverage check failed: ${failures.join(", ")}`,
    );
  }
}

async function ingestEdition(edition: SrdEdition) {
  console.log(`[srd:ingest-api] ${edition}: starting`);
  const prepared: PreparedChunk[] = [];
  for (const spec of categoriesFor(edition)) {
    prepared.push(...(await fetchCategory(edition, spec)));
  }

  // 2024 SRD: dnd5eapi does not yet include spells and only ships a few
  // monsters. Fall back to open5e's official SRD 5.2 mirror so Compare
  // Editions can actually diff e.g. "fireball 2014 vs 2024".
  if (edition === "2024") {
    const haveSpells = prepared.some((p) => p.entityKind === "spell");
    const monsterCount = prepared.filter((p) => p.entityKind === "monster").length;
    if (!haveSpells) {
      try {
        prepared.push(...(await fetchOpen5eSpells2024()));
      } catch (err) {
        console.warn(`[srd:ingest-api] open5e spells fallback failed: ${(err as Error).message}`);
      }
    }
    if (monsterCount < 50) {
      try {
        prepared.push(...(await fetchOpen5eMonsters2024()));
      } catch (err) {
        console.warn(`[srd:ingest-api] open5e creatures fallback failed: ${(err as Error).message}`);
      }
    }
  }

  // De-duplicate by (edition, kind, slug): when the same entity is fetched
  // from multiple sources (e.g. an aboleth that exists in both the
  // dnd5eapi 2024 monsters list and the open5e fallback), keep only the
  // first source's chunk-set so /rules/:kind/:slug returns a single
  // coherent body rather than a merged duplicate.
  const seenEntities = new Set<string>();
  const deduped: PreparedChunk[] = [];
  for (const c of prepared) {
    const entityKey = `${c.entityKind}:${c.entitySlug}`;
    // First occurrence: claim the entity. Allow subsequent chunks of the
    // SAME entity (e.g. multi-part splits) through.
    if (!seenEntities.has(entityKey)) {
      seenEntities.add(entityKey);
      deduped.push(c);
      continue;
    }
    // Same entity already claimed — only keep this chunk if it shares the
    // same source url (i.e. it's a continuation chunk from the SAME
    // source). Drop conflicting duplicates from a different source.
    const firstSourceForEntity = deduped.find(
      (d) => d.entityKind === c.entityKind && d.entitySlug === c.entitySlug,
    )?.sourceUrl;
    if (c.sourceUrl === firstSourceForEntity) deduped.push(c);
  }
  if (deduped.length !== prepared.length) {
    console.log(
      `[srd:ingest-api] ${edition}: deduped ${prepared.length - deduped.length} cross-source duplicate chunks`,
    );
  }
  prepared.length = 0;
  prepared.push(...deduped);

  console.log(`[srd:ingest-api] ${edition}: ${prepared.length} chunks prepared`);

  // Per-kind summary so regressions are easy to spot in CI logs.
  const summary: Partial<Record<string, number>> = {};
  for (const p of prepared) summary[p.entityKind] = (summary[p.entityKind] ?? 0) + 1;
  console.log(
    `[srd:ingest-api] ${edition}: by kind -> ` +
      Object.entries(summary)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}=${v}`)
        .join(", "),
  );

  assertCoverage(edition, prepared);

  const seen = DRY_RUN ? new Set<string>() : await existingHashes(edition);
  const fresh = prepared.filter((p) => !seen.has(p.contentHash));
  console.log(
    `[srd:ingest-api] ${edition}: ${fresh.length} new chunks (skipped ${prepared.length - fresh.length})`,
  );

  if (DRY_RUN) {
    console.log(`[srd:ingest-api] DRY RUN — sample:`, fresh.slice(0, 1));
    return;
  }
  if (fresh.length === 0) return;

  if (NO_EMBED) {
    console.log(
      `[srd:ingest-api] ${edition}: SRD_NO_EMBED=1 — inserting ${fresh.length} chunks without embeddings`,
    );
    const rows = fresh.map((b) => ({ ...b, embedding: null as number[] | null }));
    for (let i = 0; i < rows.length; i += 200) {
      await upsertChunks(rows.slice(i, i + 200));
      console.log(
        `[srd:ingest-api] ${edition}: upserted ${Math.min(i + 200, rows.length)}/${rows.length}`,
      );
    }
    return;
  }

  const limit = pLimit(EMBED_CONCURRENCY);
  const batches: PreparedChunk[][] = [];
  for (let i = 0; i < fresh.length; i += EMBED_BATCH) {
    batches.push(fresh.slice(i, i + EMBED_BATCH));
  }
  const embeddedBatches = await Promise.all(
    batches.map((batch, idx) =>
      limit(async () => {
        const texts = batch.map((b) => `${b.title}\n\n${b.bodyMd}`.slice(0, 8000));
        const vectors = await embedBatch(texts);
        console.log(
          `[srd:ingest-api] ${edition}: embedded batch ${idx + 1}/${batches.length}`,
        );
        return batch.map((b, i) => ({ ...b, embedding: vectors[i] ?? null }));
      }),
    ),
  );
  const flattened = embeddedBatches.flat();

  for (let i = 0; i < flattened.length; i += 200) {
    await upsertChunks(flattened.slice(i, i + 200));
    console.log(
      `[srd:ingest-api] ${edition}: upserted ${Math.min(i + 200, flattened.length)}/${flattened.length}`,
    );
  }
}

async function alreadyPopulated(): Promise<boolean> {
  // Pre-flight check that keeps post-merge under its 20s timeout once
  // the SRD is fully loaded — but only short-circuits when EVERY tracked
  // category is at its exact expected distinct-slug count. If even one
  // entity is missing (e.g. a previous run crashed mid-monster), the
  // re-run proceeds and backfills the gap. Set SRD_FORCE=1 to override.
  const result = await db.execute<{
    edition: string;
    entity_kind: string;
    n: number;
  }>(
    sql`SELECT edition, entity_kind, count(DISTINCT entity_slug)::int AS n
        FROM reference_chunks
        WHERE entity_kind IN ('spell','monster','class','condition')
        GROUP BY edition, entity_kind`,
  );
  const counts = new Map<string, number>();
  for (const r of result.rows) counts.set(`${r.edition}:${r.entity_kind}`, Number(r.n));
  for (const ed of EDITIONS) {
    const expected = EXPECTED_COUNTS[ed];
    for (const [kind, want] of Object.entries(expected) as Array<[Kind, number]>) {
      const got = counts.get(`${ed}:${kind}`) ?? 0;
      if (got < want) {
        console.log(
          `[srd:ingest-api] preflight: ${ed}/${kind} has ${got}/${want} distinct slugs — running ingest to backfill`,
        );
        return false;
      }
    }
  }
  return true;
}

async function main() {
  if (process.env.SRD_FORCE !== "1" && (await alreadyPopulated())) {
    console.log(
      "[srd:ingest-api] reference_chunks already populated for both editions — skipping (set SRD_FORCE=1 to override)",
    );
    await pool.end();
    return;
  }
  for (const ed of EDITIONS) {
    await ingestEdition(ed);
  }
  await pool.end();
  console.log("[srd:ingest-api] done");
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => {});
  process.exit(1);
});
