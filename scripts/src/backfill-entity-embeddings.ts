// Backfill embeddings for campaign entities that exist in the database but
// have no chunks in `campaign_entity_chunks` yet. The embedding worker only
// runs when an entity is created or edited, so any entity created before that
// worker existed is invisible to the Ask feature until someone touches it.
//
// This walks every row in `campaign_entities` and calls
// `backfillEntityChunks` from `@workspace/entity-embeddings` — the same
// chunking + embedding + insert pipeline that powers `syncEntityChunks` in
// the API server. It is idempotent because it filters against the existing
// (entity_id, source_field, content_hash) tuples and the table has a
// matching unique constraint.
//
// Usage:
//   pnpm --filter @workspace/scripts run backfill:entity-embeddings
//
// Optional env:
//   BACKFILL_CAMPAIGN_ID — restrict the run to a single campaign id.
//   BACKFILL_DRY_RUN=1   — chunk only, skip embedding + DB writes.
//   BACKFILL_CONCURRENCY — entity-level parallelism (default 4).
import pLimit from "p-limit";
import { sql, eq } from "drizzle-orm";
import { db, pool, campaignEntitiesTable } from "@workspace/db";
import {
  backfillEntityChunks,
  prepareChunks,
  filterFreshChunks,
  type EntityFieldUpdate,
} from "@workspace/entity-embeddings";

const DRY_RUN = process.env.BACKFILL_DRY_RUN === "1";

function parsePositiveInt(value: string | undefined, label: string): number | null {
  if (value === undefined || value === "") return null;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0 || String(n) !== value.trim()) {
    throw new Error(`${label} must be a positive integer, got ${JSON.stringify(value)}`);
  }
  return n;
}

const ONLY_CAMPAIGN = parsePositiveInt(
  process.env.BACKFILL_CAMPAIGN_ID,
  "BACKFILL_CAMPAIGN_ID",
);
const CONCURRENCY = parsePositiveInt(
  process.env.BACKFILL_CONCURRENCY,
  "BACKFILL_CONCURRENCY",
) ?? 4;

interface Stats {
  entitiesScanned: number;
  entitiesWithNewChunks: number;
  chunksInserted: number;
  chunksSkipped: number;
  failures: number;
}

async function processEntity(
  entity: {
    id: number;
    campaignId: number;
    publicMd: string | null;
    secretMd: string | null;
    dmNotes: string | null;
  },
  stats: Stats,
): Promise<void> {
  const fields: EntityFieldUpdate[] = [
    { field: "public_md", body: entity.publicMd },
    { field: "secret_md", body: entity.secretMd },
    { field: "dm_notes", body: entity.dmNotes },
  ];

  if (DRY_RUN) {
    const candidates = prepareChunks(fields);
    if (candidates.length === 0) return;
    const fresh = await filterFreshChunks(entity.id, candidates);
    const skipped = candidates.length - fresh.length;
    stats.chunksSkipped += skipped;
    if (fresh.length === 0) return;
    stats.entitiesWithNewChunks += 1;
    stats.chunksInserted += fresh.length;
    console.log(
      `[dry-run] entity ${entity.id} (campaign ${entity.campaignId}): would insert ${fresh.length} chunks (skipped ${skipped} already-embedded)`,
    );
    return;
  }

  const result = await backfillEntityChunks(entity.id, entity.campaignId, fields);
  stats.chunksInserted += result.inserted;
  stats.chunksSkipped += result.skipped;
  if (result.inserted > 0) {
    stats.entitiesWithNewChunks += 1;
    console.log(
      `entity ${entity.id} (campaign ${entity.campaignId}): inserted ${result.inserted} chunks (skipped ${result.skipped} already-embedded)`,
    );
  }
}

async function main(): Promise<void> {
  const where = ONLY_CAMPAIGN != null
    ? eq(campaignEntitiesTable.campaignId, ONLY_CAMPAIGN)
    : sql`true`;

  const entities = await db
    .select({
      id: campaignEntitiesTable.id,
      campaignId: campaignEntitiesTable.campaignId,
      publicMd: campaignEntitiesTable.publicMd,
      secretMd: campaignEntitiesTable.secretMd,
      dmNotes: campaignEntitiesTable.dmNotes,
    })
    .from(campaignEntitiesTable)
    .where(where);

  console.log(
    `Backfilling embeddings for ${entities.length} entit${entities.length === 1 ? "y" : "ies"}` +
      (ONLY_CAMPAIGN != null ? ` in campaign ${ONLY_CAMPAIGN}` : "") +
      (DRY_RUN ? " (dry run)" : "") +
      ` with concurrency=${CONCURRENCY}`,
  );

  const stats: Stats = {
    entitiesScanned: 0,
    entitiesWithNewChunks: 0,
    chunksInserted: 0,
    chunksSkipped: 0,
    failures: 0,
  };

  const limit = pLimit(CONCURRENCY);
  await Promise.all(
    entities.map((e) =>
      limit(async () => {
        stats.entitiesScanned += 1;
        try {
          await processEntity(e, stats);
        } catch (err) {
          stats.failures += 1;
          console.error(
            `entity ${e.id} (campaign ${e.campaignId}): backfill failed`,
            err,
          );
        }
      }),
    ),
  );

  console.log("Backfill complete:", stats);
  if (stats.failures > 0) {
    // Surface partial failures to cron/CI: log loudly and exit non-zero.
    console.error(`Backfill finished with ${stats.failures} entity failure(s)`);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error("Backfill aborted:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
