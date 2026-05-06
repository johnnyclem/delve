import { Router, type IRouter } from "express";
import { requireAuth, getUserId, getUserDisplayName, getUserAvatarUrl } from "../middlewares/requireAuth";
import { getOrCreateCampaign, claimDmWithToken } from "../lib/campaign";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.post("/admin/claim-dm", requireAuth, async (req, res): Promise<void> => {
  const expected = process.env.ADMIN_RESET_TOKEN;
  if (!expected) {
    res.status(503).json({ error: "Admin token is not configured" });
    return;
  }

  const provided = req.header("x-admin-token") ?? (typeof req.body?.token === "string" ? req.body.token : undefined);
  if (provided !== expected) {
    res.status(403).json({ error: "Invalid admin token" });
    return;
  }

  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();

  const member = await claimDmWithToken(campaignId, userId, getUserDisplayName(req), getUserAvatarUrl(req));

  logger.info({ userId, campaignId }, "Admin DM claim succeeded");
  res.json({ success: true, member });
});

export default router;
