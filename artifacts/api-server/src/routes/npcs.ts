import { Router, type IRouter } from "express";
import { db, npcsTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { requireAuth, requireCampaignMember, getUserId } from "../middlewares/requireAuth";
import { getOrCreateCampaign, isDm } from "../lib/campaign";
import { CreateNpcBody, UpdateNpcBody } from "@workspace/api-zod";

const router: IRouter = Router();

// Read-open to all campaign members so players can see who's been tagged,
// but writes (POST/DELETE) stay DM-only.
router.get("/npcs", requireAuth, requireCampaignMember, async (_req, res): Promise<void> => {
  const campaignId = await getOrCreateCampaign();
  const npcs = await db
    .select()
    .from(npcsTable)
    .where(eq(npcsTable.campaignId, campaignId))
    .orderBy(asc(npcsTable.name));
  res.json(npcs);
});

router.post("/npcs", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();

  if (!(await isDm(campaignId, userId))) {
    res.status(403).json({ error: "Only the DM can create NPCs" });
    return;
  }

  const parsed = CreateNpcBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const name = parsed.data.name.trim();
  if (!name) {
    res.status(400).json({ error: "Name is required" });
    return;
  }

  const [created] = await db
    .insert(npcsTable)
    .values({
      campaignId,
      name,
      shortNote: parsed.data.shortNote ?? null,
      avatarUrl: parsed.data.avatarUrl ?? null,
      relationshipTags: parsed.data.relationshipTags ?? [],
      createdByUserId: userId,
    })
    .returning();

  res.status(201).json(created);
});

router.patch("/npcs/:id", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();

  if (!(await isDm(campaignId, userId))) {
    res.status(403).json({ error: "Only the DM can update NPCs" });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid NPC ID" });
    return;
  }

  const parsed = UpdateNpcBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) {
    const trimmed = parsed.data.name.trim();
    if (!trimmed) {
      res.status(400).json({ error: "Name is required" });
      return;
    }
    updateData.name = trimmed;
  }
  if (parsed.data.shortNote !== undefined) updateData.shortNote = parsed.data.shortNote;
  if (parsed.data.avatarUrl !== undefined) updateData.avatarUrl = parsed.data.avatarUrl;
  if (parsed.data.relationshipTags !== undefined) updateData.relationshipTags = parsed.data.relationshipTags;

  if (Object.keys(updateData).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const [updated] = await db
    .update(npcsTable)
    .set(updateData)
    .where(and(eq(npcsTable.id, id), eq(npcsTable.campaignId, campaignId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "NPC not found" });
    return;
  }

  res.json(updated);
});

router.delete("/npcs/:id", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();

  if (!(await isDm(campaignId, userId))) {
    res.status(403).json({ error: "Only the DM can delete NPCs" });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid NPC ID" });
    return;
  }

  const [deleted] = await db
    .delete(npcsTable)
    .where(and(eq(npcsTable.id, id), eq(npcsTable.campaignId, campaignId)))
    .returning({ id: npcsTable.id });

  if (!deleted) {
    res.status(404).json({ error: "NPC not found" });
    return;
  }

  res.json({ success: true });
});

export default router;
