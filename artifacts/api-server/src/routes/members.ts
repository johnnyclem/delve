import { Router, type IRouter } from "express";
import { db, campaignMembersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireCampaignMember, getUserId, getUserDisplayName, getUserAvatarUrl } from "../middlewares/requireAuth";
import { getOrCreateCampaign, getMember, syncMemberProfile, joinWithInviteCode } from "../lib/campaign";
import { isValidTimeZone } from "../lib/timezone";

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

router.patch("/members/me/notifications", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();

  const member = await getMember(campaignId, userId);
  if (!member) {
    res.status(404).json({ error: "Not a campaign member" });
    return;
  }

  const { emailNotifications, timezone } = req.body ?? {};
  const updates: { emailNotifications?: boolean; timezone?: string | null } = {};

  if (emailNotifications !== undefined) {
    if (typeof emailNotifications !== "boolean") {
      res.status(400).json({ error: "emailNotifications must be a boolean" });
      return;
    }
    updates.emailNotifications = emailNotifications;
  }

  if (timezone !== undefined) {
    if (timezone === null) {
      updates.timezone = null;
    } else if (typeof timezone !== "string" || !isValidTimeZone(timezone)) {
      res.status(400).json({ error: "timezone must be a valid IANA timezone or null" });
      return;
    } else {
      updates.timezone = timezone;
    }
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  const [updated] = await db
    .update(campaignMembersTable)
    .set(updates)
    .where(
      and(
        eq(campaignMembersTable.campaignId, campaignId),
        eq(campaignMembersTable.userId, userId),
      ),
    )
    .returning();

  res.json(updated);
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
