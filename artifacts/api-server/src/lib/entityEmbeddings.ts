import crypto from "node:crypto";
import { sql, eq, and, inArray } from "drizzle-orm";
import {
  db,
  campaignEntityChunksTable,
  type EntityChunkSourceField,
} from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";

const EMBED_MODEL = "text-embedding-3-small";
const EMBED_DIMS = 1536;
// Most entries are short, but split very long ones into ~1500-char chunks
// at paragraph boundaries to keep embeddings focused.
const MAX_CHUNK_CHARS = 1500;

export const ENTITY_TEXT_FIELDS: EntityChunkSourceField[] = [
  "public_md",
  "secret_md",
  "dm_notes",
];

function contentHash(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 32);
}

function chunkText(body: string): string[] {
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

function vectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = await openai.embeddings.create({
    model: EMBED_MODEL,
    input: texts,
    dimensions: EMBED_DIMS,
  });
  return res.data.map((d) => d.embedding as unknown as number[]);
}

interface FieldUpdate {
  field: EntityChunkSourceField;
  body: string | null | undefined;
}

/**
 * Re-chunks and re-embeds the given fields for an entity. Deletes stale chunks
 * for any field whose body is empty/null, and upserts new chunks for non-empty
 * bodies. Idempotent via (entity_id, source_field, content_hash) unique key.
 *
 * Errors are logged but not thrown — embedding failure should never break
 * the underlying entity CRUD operation.
 */
export async function syncEntityChunks(
  entityId: number,
  campaignId: number,
  fields: FieldUpdate[],
): Promise<void> {
  try {
    const chunksToInsert: Array<{
      field: EntityChunkSourceField;
      body: string;
      hash: string;
    }> = [];
    const fieldsBeingUpdated = new Set<EntityChunkSourceField>();

    for (const { field, body } of fields) {
      fieldsBeingUpdated.add(field);
      const pieces = chunkText(body ?? "");
      for (const piece of pieces) {
        chunksToInsert.push({ field, body: piece, hash: contentHash(piece) });
      }
    }

    // Delete stale chunks for the updated fields whose hash isn't in the
    // new set.
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

    // Skip chunks that already exist (idempotency on hash).
    const existing = await db
      .select({
        field: campaignEntityChunksTable.sourceField,
        hash: campaignEntityChunksTable.contentHash,
      })
      .from(campaignEntityChunksTable)
      .where(
        and(
          eq(campaignEntityChunksTable.entityId, entityId),
          inArray(
            campaignEntityChunksTable.sourceField,
            Array.from(fieldsBeingUpdated),
          ),
        ),
      );
    const existingKeys = new Set(existing.map((r) => `${r.field}:${r.hash}`));
    const fresh = chunksToInsert.filter(
      (c) => !existingKeys.has(`${c.field}:${c.hash}`),
    );
    if (fresh.length === 0) return;

    const embeddings = await embedTexts(fresh.map((c) => c.body));

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
            ${vec ? sql`${vectorLiteral(vec)}::halfvec(1536)` : sql`NULL`}
          )
          ON CONFLICT (entity_id, source_field, content_hash) DO NOTHING
        `);
      }
    });
  } catch (err) {
    logger.error({ err, entityId, campaignId }, "[entityEmbeddings] sync failed");
  }
}

export async function embedQuery(query: string): Promise<number[] | null> {
  try {
    const [vec] = await embedTexts([query]);
    return vec ?? null;
  } catch (err) {
    logger.error({ err }, "[entityEmbeddings] query embed failed");
    return null;
  }
}

export function vectorToSqlLiteral(vec: number[]): string {
  return vectorLiteral(vec);
}
