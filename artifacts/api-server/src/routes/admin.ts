import { Router, type IRouter } from "express";
import pLimit from "p-limit";
import { eq } from "drizzle-orm";
import { db, campaignEntitiesTable } from "@workspace/db";
import {
  backfillEntityChunks,
  type EntityFieldUpdate,
} from "@workspace/entity-embeddings";
import {
  requireAuth,
  requireCampaignMember,
  getUserId,
  getUserDisplayName,
  getUserAvatarUrl,
} from "../middlewares/requireAuth";
import { getOrCreateCampaign, claimDmWithToken, isDm } from "../lib/campaign";
import { logger } from "../lib/logger";
import {
  getLastSchemaHealthResult,
  runSchemaHealthCheck,
} from "../lib/schemaHealthCheck";
import { reanchorAllSeries } from "./calendar";

const EMBEDDING_BACKFILL_CONCURRENCY = 4;

const router: IRouter = Router();

function checkAdminToken(req: import("express").Request): { ok: true } | { ok: false; status: number; error: string } {
  const expected = process.env.ADMIN_RESET_TOKEN;
  if (!expected) return { ok: false, status: 503, error: "Admin token is not configured" };
  const provided = req.header("x-admin-token") ?? (typeof req.body?.token === "string" ? req.body.token : undefined);
  if (provided !== expected) return { ok: false, status: 403, error: "Invalid admin token" };
  return { ok: true };
}

router.post("/admin/claim-dm", requireAuth, async (req, res): Promise<void> => {
  const check = checkAdminToken(req);
  if (!check.ok) {
    res.status(check.status).json({ error: check.error });
    return;
  }

  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();

  const member = await claimDmWithToken(campaignId, userId, getUserDisplayName(req), getUserAvatarUrl(req));

  logger.info({ userId, campaignId }, "Admin DM claim succeeded");
  res.json({ success: true, member });
});

/**
 * One-shot backfill: re-anchor every recurring series across all campaigns to
 * the campaign's current timezone so future occurrences honour DST rules.
 * Past occurrences (and their RSVPs) are left untouched.
 */
router.post("/admin/reanchor-series", async (req, res): Promise<void> => {
  const check = checkAdminToken(req);
  if (!check.ok) {
    res.status(check.status).json({ error: check.error });
    return;
  }

  const results = await reanchorAllSeries();
  const totals = results.reduce(
    (acc, r) => {
      acc.deletedFutureCount += r.deletedFutureCount;
      acc.insertedFutureCount += r.insertedFutureCount;
      acc.preservedPastCount += r.preservedPastCount;
      return acc;
    },
    { deletedFutureCount: 0, insertedFutureCount: 0, preservedPastCount: 0 },
  );

  logger.info({ seriesCount: results.length, ...totals }, "Admin series re-anchor backfill complete");
  res.json({ success: true, seriesCount: results.length, totals, results });
});

/**
 * DM-triggered re-run of the entity embedding pipeline. Re-chunks and embeds
 * any entity rows that have no chunks yet (e.g. created before the embedding
 * worker existed, or imported in bulk). Idempotent via the same
 * (entity_id, source_field, content_hash) unique key the live sync uses, so
 * re-running is safe and cheap.
 */
router.post(
  "/admin/embeddings/backfill",
  requireAuth,
  requireCampaignMember,
  async (req, res): Promise<void> => {
    const userId = getUserId(req);
    const campaignId = await getOrCreateCampaign();

    if (!(await isDm(campaignId, userId))) {
      res.status(403).json({ error: "Only the DM can rebuild embeddings" });
      return;
    }

    const entities = await db
      .select({
        id: campaignEntitiesTable.id,
        campaignId: campaignEntitiesTable.campaignId,
        publicMd: campaignEntitiesTable.publicMd,
        secretMd: campaignEntitiesTable.secretMd,
        dmNotes: campaignEntitiesTable.dmNotes,
      })
      .from(campaignEntitiesTable)
      .where(eq(campaignEntitiesTable.campaignId, campaignId));

    const stats = {
      entitiesScanned: 0,
      entitiesWithNewChunks: 0,
      chunksInserted: 0,
      chunksSkipped: 0,
      failures: 0,
    };

    const limit = pLimit(EMBEDDING_BACKFILL_CONCURRENCY);
    await Promise.all(
      entities.map((entity) =>
        limit(async () => {
          stats.entitiesScanned += 1;
          const fields: EntityFieldUpdate[] = [
            { field: "public_md", body: entity.publicMd },
            { field: "secret_md", body: entity.secretMd },
            { field: "dm_notes", body: entity.dmNotes },
          ];
          try {
            const result = await backfillEntityChunks(entity.id, entity.campaignId, fields);
            stats.chunksInserted += result.inserted;
            stats.chunksSkipped += result.skipped;
            if (result.inserted > 0) stats.entitiesWithNewChunks += 1;
          } catch (err) {
            stats.failures += 1;
            logger.error(
              { err, entityId: entity.id, campaignId: entity.campaignId },
              "Embedding backfill failed for entity",
            );
          }
        }),
      ),
    );

    logger.info({ userId, campaignId, ...stats }, "DM-triggered embedding backfill complete");
    res.json({ success: stats.failures === 0, ...stats });
  },
);

/**
 * Admin-only schema health endpoint. Returns the cached result from the
 * most recent schema drift check (run on startup). Pass `?refresh=1` to
 * trigger a fresh read-only check on demand. Never executes DDL.
 */
router.get("/admin/schema-health", async (req, res): Promise<void> => {
  const check = checkAdminToken(req);
  if (!check.ok) {
    res.status(check.status).json({ error: check.error });
    return;
  }

  const refresh = req.query.refresh === "1" || req.query.refresh === "true";
  let result = getLastSchemaHealthResult();

  if (refresh || !result) {
    result = await runSchemaHealthCheck();
  }

  res.json(result);
});

export default router;
