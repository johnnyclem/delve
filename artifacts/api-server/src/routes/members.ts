import { Router, type IRouter } from "express";
import { db, campaignMembersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, getUserId, getUserDisplayName, getUserAvatarUrl } from "../middlewares/requireAuth";
import { getOrCreateCampaign, ensureMember } from "../lib/campaign";

const router: IRouter = Router();

router.get("/members", requireAuth, async (req, res): Promise<void> => {
  const campaignId = await getOrCreateCampaign();
  const members = await db
    .select()
    .from(campaignMembersTable)
    .where(eq(campaignMembersTable.campaignId, campaignId));
  res.json(members);
});

router.get("/members/me", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();
  const member = await ensureMember(campaignId, userId, getUserDisplayName(req), getUserAvatarUrl(req));
  res.json(member);
});

export default router;
