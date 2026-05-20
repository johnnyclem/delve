import { db, campaignEntitiesTable, failedEmbeddingsTable } from "@workspace/db";
import { eq, and, lte, asc, sql } from "drizzle-orm";
import { logger } from "./logger";
import { syncEntityChunks } from "./entityEmbeddings";

const RETRY_INTERVAL_MS = Number(process.env.EMBEDDING_RETRY_INTERVAL_MS ?? 300_000);
const RETRY_BATCH_SIZE = parseInt(process.env.EMBEDDING_RETRY_BATCH_SIZE ?? "10", 10);
const MAX_RETRIES = parseInt(process.env.EMBEDDING_RETRY_MAX_RETRIES ?? "5", 10);
const RETRY_WINDOW_MS = Number(process.env.EMBEDDING_RETRY_WINDOW_MS ?? 3_600_000);

async function retryFailedEmbeddings(): Promise<void> {
  const cutoff = new Date(Date.now() - RETRY_WINDOW_MS);

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
    .limit(RETRY_BATCH_SIZE);

  if (failed.length === 0) return;

  logger.info({ count: failed.length }, "[embedding-retry] retrying failed embeddings");

  for (const row of failed) {
    try {
      const entity = await db
        .select()
        .from(campaignEntitiesTable)
        .where(eq(campaignEntitiesTable.id, row.entityId));

      if (entity.length === 0) {
        await db
          .delete(failedEmbeddingsTable)
          .where(
            and(
              eq(failedEmbeddingsTable.entityId, row.entityId),
              eq(failedEmbeddingsTable.campaignId, row.campaignId),
            ),
          );
        logger.info({ entityId: row.entityId }, "[embedding-retry] entity gone, removing dead-letter entry");
        continue;
      }

      const e = entity[0];
      const fields: { field: "public_md" | "secret_md" | "dm_notes"; body: string | null | undefined }[] = [
        { field: "public_md", body: e.publicMd },
        { field: "secret_md", body: e.secretMd },
        { field: "dm_notes", body: e.dmNotes },
      ];

      await syncEntityChunks(row.entityId, row.campaignId, fields);

      await db
        .delete(failedEmbeddingsTable)
        .where(
          and(
            eq(failedEmbeddingsTable.entityId, row.entityId),
            eq(failedEmbeddingsTable.campaignId, row.campaignId),
          ),
        );
      logger.info({ entityId: row.entityId }, "[embedding-retry] retry succeeded");
    } catch (err) {
      await db
        .update(failedEmbeddingsTable)
        .set({
          retryCount: sql`${failedEmbeddingsTable.retryCount} + 1`,
          lastAttemptAt: new Date(),
        })
        .where(
          and(
            eq(failedEmbeddingsTable.entityId, row.entityId),
            eq(failedEmbeddingsTable.campaignId, row.campaignId),
          ),
        );
      logger.error({ err, entityId: row.entityId }, "[embedding-retry] retry failed");
    }
  }
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

export function startEmbeddingRetryScheduler(): void {
  if (intervalHandle) return;
  intervalHandle = setInterval(() => {
    retryFailedEmbeddings().catch((err) => {
      logger.error({ err }, "[embedding-retry] scheduler error");
    });
  }, RETRY_INTERVAL_MS);
  logger.info({ intervalMs: RETRY_INTERVAL_MS }, "[embedding-retry] scheduler started");
}

export function stopEmbeddingRetryScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
