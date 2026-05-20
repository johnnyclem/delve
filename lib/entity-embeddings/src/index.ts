// Shared chunking + embedding helpers for `campaign_entity_chunks`.
//
// Used by both the API server (to keep chunks in sync on entity create/edit)
// and the operator backfill script (to populate chunks for entities that
// existed before the embedding worker was wired up). Keeping a single
// implementation prevents drift in chunk size, hashing, model, or dimension
// settings between live writes and offline backfills.
import crypto from "node:crypto";
import { sql, eq, and, inArray } from "drizzle-orm";
import {
  db,
  campaignEntityChunksTable,
  type EntityChunkSourceField,
} from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";

export const EMBED_MODEL = "text-embedding-3-small";
export const EMBED_DIMS = 1536;
// Most entries are short, but split very long ones into ~1500-char chunks
// at paragraph boundaries to keep embeddings focused.
export const MAX_CHUNK_CHARS = 1500;

export const ENTITY_TEXT_FIELDS: EntityChunkSourceField[] = [
  "public_md",
  "secret_md",
  "dm_notes",
];

export function contentHash(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 32);
}

export function chunkText(body: string): string[] {
  const trimmed = body.trim();
  if (!trimmed) return [];
  if (trimmed.length <= MAX_CHUNK_CHARS) return [trimmed];

  const paragraphs = trimmed.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = "";
  for (const para of paragraphs) {
    if (current.length + para.length + 2 > MAX_CHUNK_CHARS && current.length > 0) {
      chunks.push(current.trim());
      current = "";
    }
    if (para.length > MAX_CHUNK_CHARS) {
      // Hard split overlong paragraphs.
      for (let i = 0; i < para.length; i += MAX_CHUNK_CHARS) {
        chunks.push(para.slice(i, i + MAX_CHUNK_CHARS).trim());
      }
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }
  if (current.trim().length > 0) chunks.push(current.trim());
  return chunks;
}

export function vectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

export function vectorToSqlLiteral(vec: number[]): string {
  return vectorLiteral(vec);
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = await openai.embeddings.create({
    model: EMBED_MODEL,
    input: texts,
    dimensions: EMBED_DIMS,
  });
  return res.data.map((d) => d.embedding as unknown as number[]);
}

export interface EntityFieldUpdate {
  field: EntityChunkSourceField;
  body: string | null | undefined;
}

export interface PreparedChunk {
  field: EntityChunkSourceField;
  body: string;
  hash: string;
}

export function prepareChunks(fields: EntityFieldUpdate[]): PreparedChunk[] {
  const out: PreparedChunk[] = [];
  for (const { field, body } of fields) {
    for (const piece of chunkText(body ?? "")) {
      out.push({ field, body: piece, hash: contentHash(piece) });
    }
  }
  return out;
}

async function insertChunks(
  entityId: number,
  campaignId: number,
  fresh: PreparedChunk[],
  embeddings: number[][],
): Promise<void> {
  await db.transaction(async (tx) => {
    for (let i = 0; i < fresh.length; i += 1) {
      const c = fresh[i];
      const vec = embeddings[i];
      await tx.execute(sql`
        INSERT INTO campaign_entity_chunks
          (entity_id, campaign_id, source_field, body_md, content_hash, embedding)
        VALUES (
          ${entityId},
          ${campaignId},
          ${c.field},
          ${c.body},
          ${c.hash},
          ${vec ? sql`${vectorLiteral(vec)}::halfvec(${sql.raw(String(EMBED_DIMS))})` : sql`NULL`}
        )
        ON CONFLICT (entity_id, source_field, content_hash) DO NOTHING
      `);
    }
  });
}

export interface SyncOptions {
  /**
   * Optional logger used for non-fatal failures. Defaults to `console`.
   * Embedding failures should never break the underlying CRUD operation,
   * so they are caught and reported instead of thrown.
   */
  logger?: { error: (...args: unknown[]) => void };
  /**
   * Optional callback invoked on embedding failure with the error, entity ID,
   * and campaign ID. Use for metric counters or dead-letter queues.
   */
  onFailure?: (err: Error, entityId: number, campaignId: number) => void;
}

/**
 * Re-chunks and re-embeds the given fields for an entity. Deletes stale chunks
 * for any field whose body is empty/null, and upserts new chunks for non-empty
 * bodies. Idempotent via the (entity_id, source_field, content_hash) unique key.
 *
 * Errors are caught and logged via `options.logger` (default: `console`) — they
 * are never thrown, since failing to embed must not break the underlying entity
 * CRUD operation in the API.
 */
export async function syncEntityChunks(
  entityId: number,
  campaignId: number,
  fields: EntityFieldUpdate[],
  options: SyncOptions = {},
): Promise<void> {
  const log = options.logger ?? console;
  try {
    const chunksToInsert = prepareChunks(fields);
    const fieldsBeingUpdated = new Set<EntityChunkSourceField>(
      fields.map((f) => f.field),
    );

    if (fieldsBeingUpdated.size > 0) {
      const keepHashesByField = new Map<EntityChunkSourceField, string[]>();
      for (const f of fieldsBeingUpdated) keepHashesByField.set(f, []);
      for (const c of chunksToInsert) {
        keepHashesByField.get(c.field)!.push(c.hash);
      }
      for (const [field, keepHashes] of keepHashesByField) {
        if (keepHashes.length === 0) {
          await db
            .delete(campaignEntityChunksTable)
            .where(
              and(
                eq(campaignEntityChunksTable.entityId, entityId),
                eq(campaignEntityChunksTable.sourceField, field),
              ),
            );
        } else {
          await db
            .delete(campaignEntityChunksTable)
            .where(
              and(
                eq(campaignEntityChunksTable.entityId, entityId),
                eq(campaignEntityChunksTable.sourceField, field),
                sql`${campaignEntityChunksTable.contentHash} NOT IN (${sql.join(
                  keepHashes.map((h) => sql`${h}`),
                  sql`, `,
                )})`,
              ),
            );
        }
      }
    }

    if (chunksToInsert.length === 0) return;

    const fresh = await filterFreshChunks(entityId, chunksToInsert);
    if (fresh.length === 0) return;

    const embeddings = await embedTexts(fresh.map((c) => c.body));
    await insertChunks(entityId, campaignId, fresh, embeddings);
  } catch (err) {
    log.error({ err, entityId, campaignId }, "[entity-embeddings] sync failed");
    options.onFailure?.(err instanceof Error ? err : new Error(String(err)), entityId, campaignId);
  }
}

/**
 * Returns the subset of `candidates` that are not already present in
 * `campaign_entity_chunks` for the given entity. Used by both the live sync
 * path (idempotent re-runs) and the offline backfill (skip-already-embedded).
 */
export async function filterFreshChunks(
  entityId: number,
  candidates: PreparedChunk[],
): Promise<PreparedChunk[]> {
  if (candidates.length === 0) return [];
  const fields = Array.from(new Set(candidates.map((c) => c.field)));
  const existing = await db
    .select({
      field: campaignEntityChunksTable.sourceField,
      hash: campaignEntityChunksTable.contentHash,
    })
    .from(campaignEntityChunksTable)
    .where(
      and(
        eq(campaignEntityChunksTable.entityId, entityId),
        inArray(campaignEntityChunksTable.sourceField, fields),
      ),
    );
  const existingKeys = new Set(existing.map((r) => `${r.field}:${r.hash}`));
  return candidates.filter((c) => !existingKeys.has(`${c.field}:${c.hash}`));
}

export interface BackfillResult {
  inserted: number;
  skipped: number;
}

/**
 * Insert-only variant of {@link syncEntityChunks} suitable for offline
 * backfills. Does not delete stale chunks (callers asserting their stored
 * fields are authoritative), only inserts chunks that don't already exist.
 *
 * Unlike `syncEntityChunks`, errors propagate so the caller can decide
 * whether to abort or continue.
 */
export async function backfillEntityChunks(
  entityId: number,
  campaignId: number,
  fields: EntityFieldUpdate[],
): Promise<BackfillResult> {
  const candidates = prepareChunks(fields);
  if (candidates.length === 0) return { inserted: 0, skipped: 0 };

  const fresh = await filterFreshChunks(entityId, candidates);
  const skipped = candidates.length - fresh.length;
  if (fresh.length === 0) return { inserted: 0, skipped };

  const embeddings = await embedTexts(fresh.map((c) => c.body));
  await insertChunks(entityId, campaignId, fresh, embeddings);
  return { inserted: fresh.length, skipped };
}

export async function embedQuery(
  query: string,
  options: SyncOptions = {},
): Promise<number[] | null> {
  const log = options.logger ?? console;
  try {
    const [vec] = await embedTexts([query]);
    return vec ?? null;
  } catch (err) {
    log.error({ err }, "[entity-embeddings] query embed failed");
    return null;
  }
}
