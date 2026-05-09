// Reads extracted Foundry SRD JSON from `data/srd/{2014,2024}/`, normalizes
// each entry to markdown chunks, embeds them via OpenAI
// `text-embedding-3-small` (1536 dims), and upserts into `reference_chunks`
// using the (edition, slug, kind, content_hash) unique key for idempotency.
//
// Usage:
//   pnpm --filter @workspace/scripts run srd:ingest
//
// Optional env:
//   SRD_DATA_DIR  — override the default `data/srd` location.
//   SRD_DRY_RUN=1 — parse + chunk only, skip embedding + DB writes.
import path from "node:path";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import pLimit from "p-limit";
import { sql } from "drizzle-orm";
import { db, pool, referenceChunksTable, type SrdEdition } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import {
  htmlToMd,
  slugify,
  contentHash,
  splitIfLong,
  mapFoundryType,
  srdUrlFor,
} from "./normalize";

const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..");
const DATA_ROOT = process.env.SRD_DATA_DIR
  ? path.resolve(process.env.SRD_DATA_DIR)
  : path.join(REPO_ROOT, "data", "srd");
const DRY_RUN = process.env.SRD_DRY_RUN === "1";
const EMBED_MODEL = "text-embedding-3-small";
const EMBED_DIMS = 1536;
const EMBED_BATCH = 100;
const EMBED_CONCURRENCY = 8;

interface FoundryDoc {
  _id?: string;
  name?: string;
  type?: string;
  system?: { description?: { value?: string } } & Record<string, unknown>;
  pages?: Array<{
    name?: string;
    text?: { content?: string; markdown?: string };
  }>;
}

interface PreparedChunk {
  edition: SrdEdition;
  entitySlug: string;
  entityKind: string;
  section: string | null;
  title: string;
  bodyMd: string;
  contentHash: string;
  sourceUrl: string | null;
}

async function readJsonFiles(dir: string): Promise<FoundryDoc[]> {
  const out: FoundryDoc[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...(await readJsonFiles(full)));
    } else if (e.isFile() && e.name.endsWith(".json")) {
      try {
        const raw = await fs.readFile(full, "utf8");
        out.push(JSON.parse(raw) as FoundryDoc);
      } catch (err) {
        console.warn(`[srd:ingest] failed to parse ${full}:`, err);
      }
    }
  }
  return out;
}

function extractBodyHtml(doc: FoundryDoc): string {
  // Items / Actors: system.description.value
  const desc = doc.system?.description?.value;
  if (typeof desc === "string" && desc.length > 0) return desc;
  // Journal entries: pages[].text.content
  if (Array.isArray(doc.pages)) {
    return doc.pages
      .map((p) => {
        const t = p.text;
        return (t?.markdown ?? t?.content ?? "").toString();
      })
      .filter((s) => s.length > 0)
      .join("\n\n");
  }
  return "";
}

function prepareDocument(doc: FoundryDoc, edition: SrdEdition): PreparedChunk[] {
  const name = (doc.name ?? "").trim();
  if (!name) return [];
  const slug = slugify(doc._id ?? name);
  const kind = mapFoundryType(doc.type);
  const html = extractBodyHtml(doc);
  const md = htmlToMd(html);
  if (!md) return [];

  const split = splitIfLong({ title: name, bodyMd: md });
  return split.map((c) => ({
    edition,
    entitySlug: slug,
    entityKind: kind,
    section: c.section ?? null,
    title: c.title,
    bodyMd: c.bodyMd,
    contentHash: contentHash(edition, slug, kind, c.section ?? "", c.bodyMd),
    sourceUrl: srdUrlFor(kind, slug, edition),
  }));
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

async function upsertChunks(rows: Array<PreparedChunk & { embedding: number[] | null }>) {
  if (rows.length === 0) return;
  // Use Drizzle ORM with explicit halfvec cast via raw SQL to avoid driver
  // edge cases.
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

async function existingHashes(edition: SrdEdition): Promise<Set<string>> {
  const rows = await db
    .select({ h: referenceChunksTable.contentHash })
    .from(referenceChunksTable)
    .where(sql`${referenceChunksTable.edition} = ${edition}`);
  return new Set(rows.map((r) => r.h));
}

async function ingestEdition(edition: SrdEdition) {
  const dir = path.join(DATA_ROOT, edition);
  if (!existsSync(dir)) {
    console.warn(`[srd:ingest] skipping ${edition}: ${dir} does not exist`);
    return;
  }
  console.log(`[srd:ingest] ${edition}: reading JSON from ${dir}`);
  const docs = await readJsonFiles(dir);
  console.log(`[srd:ingest] ${edition}: ${docs.length} docs found`);

  const prepared: PreparedChunk[] = [];
  for (const d of docs) prepared.push(...prepareDocument(d, edition));
  console.log(`[srd:ingest] ${edition}: ${prepared.length} chunks prepared`);

  const seen = DRY_RUN ? new Set<string>() : await existingHashes(edition);
  const fresh = prepared.filter((p) => !seen.has(p.contentHash));
  console.log(`[srd:ingest] ${edition}: ${fresh.length} new chunks (skipped ${prepared.length - fresh.length})`);

  if (DRY_RUN) {
    console.log(`[srd:ingest] DRY RUN — sample:`, fresh.slice(0, 2));
    return;
  }
  if (fresh.length === 0) return;

  // Embed in batches of EMBED_BATCH with EMBED_CONCURRENCY parallelism.
  const limit = pLimit(EMBED_CONCURRENCY);
  const batches: PreparedChunk[][] = [];
  for (let i = 0; i < fresh.length; i += EMBED_BATCH) {
    batches.push(fresh.slice(i, i + EMBED_BATCH));
  }
  const embeddedBatches = await Promise.all(
    batches.map((batch, idx) =>
      limit(async () => {
        const texts = batch.map((b) => `${b.title}\n\n${b.bodyMd}`);
        const vectors = await embedBatch(texts);
        console.log(`[srd:ingest] ${edition}: embedded batch ${idx + 1}/${batches.length}`);
        return batch.map((b, i) => ({ ...b, embedding: vectors[i] ?? null }));
      }),
    ),
  );
  const flattened = embeddedBatches.flat();

  // Upsert in chunks of 200 to keep transactions modest.
  for (let i = 0; i < flattened.length; i += 200) {
    await upsertChunks(flattened.slice(i, i + 200));
    console.log(`[srd:ingest] ${edition}: upserted ${Math.min(i + 200, flattened.length)}/${flattened.length}`);
  }
}

async function main() {
  await ingestEdition("2014");
  await ingestEdition("2024");
  await pool.end();
  console.log("[srd:ingest] done");
}

main().catch(async (err) => {
  console.error(err);
  await pool.end().catch(() => {});
  process.exit(1);
});
