import { Router, type IRouter } from "express";
import { db, campaignMembersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireCampaignMember, getUserId, getUserDisplayName, getUserAvatarUrl } from "../middlewares/requireAuth";
import { getOrCreateCampaign, getMember, syncMemberProfile, joinWithInviteCode } from "../lib/campaign";

const router: IRouter = Router();

router.get("/members", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
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

  const member = await getMember(campaignId, userId);
  if (!member) {
    res.status(404).json({ error: "Not a campaign member" });
    return;
  }

  const synced = await syncMemberProfile(campaignId, userId, getUserDisplayName(req), getUserAvatarUrl(req));
  res.json(synced ?? member);
});

router.post("/members/join", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();

  const { inviteCode } = req.body ?? {};
  if (!inviteCode || typeof inviteCode !== "string") {
    res.status(400).json({ error: "Invite code is required" });
    return;
  }

  const result = await joinWithInviteCode(
    campaignId,
    inviteCode.trim().toUpperCase(),
    userId,
    getUserDisplayName(req),
    getUserAvatarUrl(req),
  );

  if (result.error) {
    res.status(403).json({ error: result.error });
    return;
  }

  res.status(201).json(result.member);
});

export default router;
