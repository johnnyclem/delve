import { Router, type IRouter } from "express";
import { db, charactersTable, campaignMembersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireCampaignMember, getUserId } from "../middlewares/requireAuth";
import { getOrCreateCampaign } from "../lib/campaign";
import { UpdateCharacterBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/characters", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const campaignId = await getOrCreateCampaign();
  const chars = await db
    .select()
    .from(charactersTable)
    .where(and(eq(charactersTable.campaignId, campaignId), eq(charactersTable.isActive, true)));

  const members = await db.select().from(campaignMembersTable).where(eq(campaignMembersTable.campaignId, campaignId));

  const result = chars.map((c) => {
    const owner = members.find((m) => m.userId === c.ownerUserId);
    return { ...c, ownerDisplayName: owner?.displayName ?? "Unknown" };
  });

  res.json(result);
});

router.get("/characters/:id", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid character ID" });
    return;
  }

  const campaignId = await getOrCreateCampaign();
  const [char] = await db
    .select()
    .from(charactersTable)
    .where(and(eq(charactersTable.id, id), eq(charactersTable.campaignId, campaignId)));

  if (!char) {
    res.status(404).json({ error: "Character not found" });
    return;
  }

  const members = await db.select().from(campaignMembersTable).where(eq(campaignMembersTable.campaignId, campaignId));
  const owner = members.find((m) => m.userId === char.ownerUserId);

  res.json({ ...char, ownerDisplayName: owner?.displayName ?? "Unknown" });
});

router.patch("/characters/:id", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid character ID" });
    return;
  }

  const parsed = UpdateCharacterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const campaignId = await getOrCreateCampaign();
  const [existing] = await db
    .select()
    .from(charactersTable)
    .where(and(eq(charactersTable.id, id), eq(charactersTable.campaignId, campaignId)));

  if (!existing) {
    res.status(404).json({ error: "Character not found" });
    return;
  }

  if (existing.ownerUserId !== userId) {
    res.status(403).json({ error: "Not your character" });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.race !== undefined) updateData.race = parsed.data.race;
  if (parsed.data.class !== undefined) updateData.class = parsed.data.class;
  if (parsed.data.level !== undefined) updateData.level = parsed.data.level;
  if (parsed.data.sheetJson !== undefined) updateData.sheetJson = parsed.data.sheetJson;
  if (parsed.data.portraitUrl !== undefined) updateData.portraitUrl = parsed.data.portraitUrl;

  const [updated] = await db
    .update(charactersTable)
    .set(updateData)
    .where(and(eq(charactersTable.id, id), eq(charactersTable.campaignId, campaignId)))
    .returning();

  const members = await db.select().from(campaignMembersTable).where(eq(campaignMembersTable.campaignId, updated.campaignId));
  const owner = members.find((m) => m.userId === updated.ownerUserId);

  res.json({ ...updated, ownerDisplayName: owner?.displayName ?? "Unknown" });
});

export default router;
