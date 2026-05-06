import { Router, type IRouter } from "express";
import { requireAuth, getUserId, getUserDisplayName, getUserAvatarUrl } from "../middlewares/requireAuth";
import { getOrCreateCampaign, claimDmWithToken } from "../lib/campaign";
import { logger } from "../lib/logger";
import { reanchorAllSeries } from "./calendar";

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

export default router;
