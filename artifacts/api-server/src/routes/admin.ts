import { Router, type IRouter } from "express";
import { db, campaignsTable, campaignMembersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, getUserId, getUserDisplayName, getUserAvatarUrl } from "../middlewares/requireAuth";
import { getOrCreateCampaign } from "../lib/campaign";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.post("/admin/claim-dm", requireAuth, async (req, res): Promise<void> => {
  const expected = process.env.ADMIN_RESET_TOKEN;
  if (!expected) {
    res.status(503).json({ error: "Admin reset is not configured" });
    return;
  }

  const provided = req.header("x-admin-token") ?? (typeof req.body?.token === "string" ? req.body.token : undefined);
  if (provided !== expected) {
    res.status(403).json({ error: "Invalid admin token" });
    return;
  }

  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();

  await db.delete(campaignMembersTable).where(eq(campaignMembersTable.campaignId, campaignId));

  const [member] = await db
    .insert(campaignMembersTable)
    .values({
      campaignId,
      userId,
      role: "dm",
      displayName: getUserDisplayName(req),
      avatarUrl: getUserAvatarUrl(req),
    })
    .returning();

  await db.update(campaignsTable).set({ dmUserId: userId }).where(eq(campaignsTable.id, campaignId));

  logger.info({ userId, campaignId }, "Admin DM claim succeeded");
  res.json({ success: true, member });
});

export default router;
