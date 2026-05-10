// Ingests the 2014 D&D Monster Manual PDF into the `reference_chunks` table.
// Mirrors the SRD ingestion pipeline: extract text -> parse monsters ->
// normalize to markdown chunks -> embed (OpenAI text-embedding-3-small) ->
// upsert with the existing (edition, slug, kind, content_hash) unique key.
//
// Usage:
//   pnpm --filter @workspace/scripts run mm:ingest
//
// Env:
//   MM_PDF_PATH  — path to the Monster Manual PDF (default: the freshest
//                  copy in attached_assets/).
//   MM_DRY_RUN=1 — parse + chunk only, skip embedding + DB writes.
//   MM_FROM_PAGE / MM_TO_PAGE — narrow the page range (debug).
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import pLimit from "p-limit";
import { sql } from "drizzle-orm";
import { db, pool, referenceChunksTable } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { extractMonsterManual } from "./extract";
import { parseMonsterManual } from "./parse";
import { monsterToChunks } from "./normalize";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const DEFAULT_PDF = path.join(
  REPO_ROOT,
  "attached_assets",
  "D&D_5E_-_Monster_Manual_1778436120506.pdf",
);
const PDF_PATH = process.env.MM_PDF_PATH
  ? path.resolve(process.env.MM_PDF_PATH)
  : DEFAULT_PDF;
const DRY_RUN = process.env.MM_DRY_RUN === "1";
// The Replit AI Integrations OpenAI proxy does not currently expose the
// /embeddings endpoint. When MM_NO_EMBED=1 we skip embedding entirely and
// insert chunks with a NULL embedding so they remain searchable via the
// full-text fallback path used by /api/rules/search when embedding is null.
const NO_EMBED = process.env.MM_NO_EMBED === "1";
const EDITION = "2014" as const;
const EMBED_MODEL = "text-embedding-3-small";
const EMBED_DIMS = 1536;
const EMBED_BATCH = 100;
const EMBED_CONCURRENCY = 8;

interface PreparedChunk {
  edition: typeof EDITION;
  entitySlug: string;
  entityKind: "monster";
  section: string | null;
  title: string;
  bodyMd: string;
  contentHash: string;
  sourceUrl: string | null;
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const res = await openai.embeddings.create({
    model: EMBED_MODEL,
    input: texts,
    dimensions: EMBED_DIMS,
  });
  return res.data.map((d) => d.embedding as unknown as number[]);
}

function vectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
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

async function existingHashes(): Promise<Set<string>> {
  const rows = await db
    .select({ h: referenceChunksTable.contentHash })
    .from(referenceChunksTable)
    .where(
      sql`${referenceChunksTable.edition} = ${EDITION} AND ${referenceChunksTable.entityKind} = 'monster'`,
    );
  return new Set(rows.map((r) => r.h));
}

async function main() {
  if (!existsSync(PDF_PATH)) {
    console.error(`[mm:ingest] PDF not found at ${PDF_PATH}`);
    process.exit(1);
  }
  const fromPage = process.env.MM_FROM_PAGE
    ? Number.parseInt(process.env.MM_FROM_PAGE, 10)
    : undefined;
  const toPage = process.env.MM_TO_PAGE
    ? Number.parseInt(process.env.MM_TO_PAGE, 10)
    : undefined;

  console.log(`[mm:ingest] extracting ${PDF_PATH}`);
  const extract = extractMonsterManual(PDF_PATH, { fromPage, toPage });
  console.log(`[mm:ingest] extracted ${extract.pages.length} pages`);

  const parsed = parseMonsterManual(extract);
  console.log(`[mm:ingest] parsed ${parsed.monsters.length} monsters (${parsed.errors.length} parse errors)`);
  if (parsed.errors.length > 0) {
    for (const e of parsed.errors.slice(0, 10)) {
      console.warn(`  - page ${e.page}: ${e.reason}`);
    }
  }

  const prepared: PreparedChunk[] = [];
  const seenSlugs = new Map<string, number>();
  for (const m of parsed.monsters) {
    // Disambiguate duplicate slugs (e.g. multi-stat-block monsters where the
    // same name might appear twice). Append a numeric suffix if needed.
    const chunks = monsterToChunks(m);
    for (const c of chunks) {
      let slug = c.entitySlug;
      const key = `${slug}|${c.section}|${c.contentHash}`;
      if (seenSlugs.has(key)) continue;
      seenSlugs.set(key, 1);
      prepared.push({
        edition: EDITION,
        entitySlug: slug,
        entityKind: "monster",
        section: c.section,
        title: c.title,
        bodyMd: c.bodyMd,
        contentHash: c.contentHash,
        sourceUrl: null,
      });
    }
  }
  console.log(`[mm:ingest] prepared ${prepared.length} chunks`);

  // Per-section summary.
  const sectionCounts = prepared.reduce<Record<string, number>>((acc, p) => {
    const k = p.section ?? "(none)";
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  console.log("[mm:ingest] section counts:");
  for (const [k, v] of Object.entries(sectionCounts).sort()) {
    console.log(`  - ${k}: ${v}`);
  }

  if (DRY_RUN) {
    console.log("[mm:ingest] DRY RUN — sample monsters:");
    for (const m of parsed.monsters.slice(0, 3)) {
      console.log(`  • ${m.name} (page ${m.page}) — ${m.meta}`);
    }
    console.log("[mm:ingest] DRY RUN — sample chunk titles:");
    for (const p of prepared.slice(0, 5)) {
      console.log(`  • [${p.section}] ${p.title} (${p.bodyMd.length} chars)`);
    }
    await pool.end();
    return;
  }

  const seen = await existingHashes();
  const fresh = prepared.filter((p) => !seen.has(p.contentHash));
  console.log(`[mm:ingest] ${fresh.length} new chunks (skipped ${prepared.length - fresh.length} duplicates)`);

  if (fresh.length === 0) {
    await pool.end();
    return;
  }

  if (NO_EMBED) {
    console.log(`[mm:ingest] MM_NO_EMBED=1 — inserting ${fresh.length} chunks without embeddings`);
    const rows = fresh.map((b) => ({ ...b, embedding: null as number[] | null }));
    for (let i = 0; i < rows.length; i += 200) {
      await upsertChunks(rows.slice(i, i + 200));
      console.log(`[mm:ingest] upserted ${Math.min(i + 200, rows.length)}/${rows.length}`);
    }
    console.log("[mm:ingest] summary:");
    console.log(`  monsters parsed: ${parsed.monsters.length}`);
    console.log(`  chunks prepared: ${prepared.length}`);
    console.log(`  chunks written:  ${rows.length}`);
    console.log(`  parse errors:    ${parsed.errors.length}`);
    await pool.end();
    return;
  }

  const limit = pLimit(EMBED_CONCURRENCY);
  const batches: PreparedChunk[][] = [];
  for (let i = 0; i < fresh.length; i += EMBED_BATCH) {
    batches.push(fresh.slice(i, i + EMBED_BATCH));
  }
  let embeddedCount = 0;
  const embeddedBatches = await Promise.all(
    batches.map((batch, idx) =>
      limit(async () => {
        const texts = batch.map((b) => `${b.title}\n\n${b.bodyMd}`);
        const vectors = await embedBatch(texts);
        embeddedCount += batch.length;
        console.log(`[mm:ingest] embedded batch ${idx + 1}/${batches.length} (${embeddedCount}/${fresh.length})`);
        return batch.map((b, i) => ({ ...b, embedding: vectors[i] ?? null }));
      }),
    ),
  );
  const flattened = embeddedBatches.flat();

  for (let i = 0; i < flattened.length; i += 200) {
    await upsertChunks(flattened.slice(i, i + 200));
    console.log(`[mm:ingest] upserted ${Math.min(i + 200, flattened.length)}/${flattened.length}`);
  }

  console.log("[mm:ingest] summary:");
  console.log(`  monsters parsed: ${parsed.monsters.length}`);
  console.log(`  chunks prepared: ${prepared.length}`);
  console.log(`  chunks written:  ${flattened.length}`);
  console.log(`  parse errors:    ${parsed.errors.length}`);
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => {});
  process.exit(1);
});
