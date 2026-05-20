import { eq, lte, and, asc, sql } from "drizzle-orm";
import { db, pool, campaignEntitiesTable, failedEmbeddingsTable } from "@workspace/db";
import {
  prepareChunks,
  filterFreshChunks,
  backfillEntityChunks,
  type EntityFieldUpdate,
} from "@workspace/entity-embeddings";

const MAX_RETRIES = parseInt(process.env.RETRY_FAILED_MAX_RETRIES ?? "5", 10);
const BATCH_SIZE = parseInt(process.env.RETRY_FAILED_BATCH_SIZE ?? "25", 10);
const RETRY_WINDOW_HOURS = parseInt(process.env.RETRY_FAILED_WINDOW_HOURS ?? "1", 10);

interface Stats {
  processed: number;
  succeeded: number;
  exhausted: number;
  failed: number;
}

async function retryEntity(
  entityId: number,
  campaignId: number,
  stats: Stats,
): Promise<void> {
  try {
    const entity = await db
      .select({
        publicMd: campaignEntitiesTable.publicMd,
        secretMd: campaignEntitiesTable.secretMd,
        dmNotes: campaignEntitiesTable.dmNotes,
      })
      .from(campaignEntitiesTable)
      .where(eq(campaignEntitiesTable.id, entityId));

    if (entity.length === 0) {
      await db
        .delete(failedEmbeddingsTable)
        .where(
          and(
            eq(failedEmbeddingsTable.entityId, entityId),
            eq(failedEmbeddingsTable.campaignId, campaignId),
          ),
        );
      stats.processed++;
      return;
    }

    const e = entity[0];
    const fields: EntityFieldUpdate[] = [
      { field: "public_md", body: e.publicMd },
      { field: "secret_md", body: e.secretMd },
      { field: "dm_notes", body: e.dmNotes },
    ];

    const candidates = prepareChunks(fields);
    const fresh = await filterFreshChunks(entityId, candidates);
    if (fresh.length === 0) {
      await db
        .delete(failedEmbeddingsTable)
        .where(
          and(
            eq(failedEmbeddingsTable.entityId, entityId),
            eq(failedEmbeddingsTable.campaignId, campaignId),
          ),
        );
      stats.succeeded++;
      stats.processed++;
      return;
    }

    await backfillEntityChunks(entityId, campaignId, fields);

    await db
      .delete(failedEmbeddingsTable)
      .where(
        and(
          eq(failedEmbeddingsTable.entityId, entityId),
          eq(failedEmbeddingsTable.campaignId, campaignId),
        ),
      );
    stats.succeeded++;
  } catch {
    await db
      .update(failedEmbeddingsTable)
      .set({
        retryCount: sql`${failedEmbeddingsTable.retryCount} + 1`,
        lastAttemptAt: new Date(),
      })
      .where(
        and(
          eq(failedEmbeddingsTable.entityId, entityId),
          eq(failedEmbeddingsTable.campaignId, campaignId),
        ),
      );
    stats.failed++;
  }
  stats.processed++;
}

async function main(): Promise<void> {
  const cutoff = new Date(Date.now() - RETRY_WINDOW_HOURS * 60 * 60 * 1000);

  const failed = await db
    .select()
    .from(failedEmbeddingsTable)
    .where(
      and(
        lte(failedEmbeddingsTable.lastAttemptAt, cutoff),
        lte(failedEmbeddingsTable.retryCount, MAX_RETRIES),
      ),
    )
    .orderBy(asc(failedEmbeddingsTable.lastAttemptAt))
    .limit(BATCH_SIZE);

  if (failed.length === 0) {
    console.log("No failed embeddings to retry.");
    return;
  }

  console.log(`Retrying ${failed.length} failed embedding job(s)...`);

  const stats: Stats = { processed: 0, succeeded: 0, exhausted: 0, failed: 0 };

  for (const row of failed) {
    if (row.retryCount >= MAX_RETRIES) {
      stats.exhausted++;
      stats.processed++;
      continue;
    }
    await retryEntity(row.entityId, row.campaignId, stats);
  }

  console.log("Retry complete:", stats);
}

main()
  .catch((err) => {
    console.error("Retry aborted:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
