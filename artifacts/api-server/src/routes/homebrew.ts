import crypto from "node:crypto";
import { Router, type IRouter } from "express";
import { db, homebrewRulesTable, campaignsTable, type HomebrewRule } from "@workspace/db";
import { eq, and, asc, desc } from "drizzle-orm";
import { z } from "zod";
import {
  requireAuth,
  requireCampaignMember,
  getUserId,
} from "../middlewares/requireAuth";
import { publicIpJsonRateLimit } from "../middlewares/publicRateLimit";
import { getOrCreateCampaign, isDm } from "../lib/campaign";
import { syncHomebrewEmbedding } from "../lib/homebrewEmbeddings";

function generateShareToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

const router: IRouter = Router();

const createBody = z.object({
  title: z.string().min(1).max(160),
  bodyMd: z.string().min(1).max(20000),
  active: z.boolean().optional(),
});

const updateBody = z.object({
  title: z.string().min(1).max(160).optional(),
  bodyMd: z.string().min(1).max(20000).optional(),
  active: z.boolean().optional(),
});

interface HomebrewResponse {
  id: number;
  campaignId: number;
  title: string;
  bodyMd: string;
  active: boolean;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

function toResponse(row: HomebrewRule): HomebrewResponse {
  return {
    id: row.id,
    campaignId: row.campaignId,
    title: row.title,
    bodyMd: row.bodyMd,
    active: row.active,
    createdByUserId: row.createdByUserId,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

function parseId(raw: string | string[] | undefined): number | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v) return null;
  const id = parseInt(v, 10);
  return Number.isNaN(id) ? null : id;
}

router.get("/homebrew", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();
  const dmRequester = await isDm(campaignId, userId);

  const conditions = [eq(homebrewRulesTable.campaignId, campaignId)];
  if (!dmRequester) conditions.push(eq(homebrewRulesTable.active, true));

  const rows = await db
    .select()
    .from(homebrewRulesTable)
    .where(and(...conditions))
    .orderBy(desc(homebrewRulesTable.active), asc(homebrewRulesTable.title));

  res.json(rows.map(toResponse));
});

router.get("/homebrew/:id", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();
  const id = parseId(req.params.id);
  if (id == null) {
    res.status(400).json({ error: "Invalid rule ID" });
    return;
  }
  const [row] = await db
    .select()
    .from(homebrewRulesTable)
    .where(and(eq(homebrewRulesTable.id, id), eq(homebrewRulesTable.campaignId, campaignId)));
  if (!row) {
    res.status(404).json({ error: "House rule not found" });
    return;
  }
  const dmRequester = await isDm(campaignId, userId);
  if (!row.active && !dmRequester) {
    res.status(404).json({ error: "House rule not found" });
    return;
  }
  res.json(toResponse(row));
});

router.post("/homebrew", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();

  if (!(await isDm(campaignId, userId))) {
    res.status(403).json({ error: "Only the DM can create house rules" });
    return;
  }

  const parsed = createBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [created] = await db
    .insert(homebrewRulesTable)
    .values({
      campaignId,
      title: parsed.data.title.trim(),
      bodyMd: parsed.data.bodyMd,
      active: parsed.data.active ?? true,
      createdByUserId: userId,
    })
    .returning();

  await syncHomebrewEmbedding(created.id, created.title, created.bodyMd);

  res.status(201).json(toResponse(created));
});

router.patch("/homebrew/:id", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();

  if (!(await isDm(campaignId, userId))) {
    res.status(403).json({ error: "Only the DM can edit house rules" });
    return;
  }

  const id = parseId(req.params.id);
  if (id == null) {
    res.status(400).json({ error: "Invalid rule ID" });
    return;
  }

  const [existing] = await db
    .select()
    .from(homebrewRulesTable)
    .where(and(eq(homebrewRulesTable.id, id), eq(homebrewRulesTable.campaignId, campaignId)));
  if (!existing) {
    res.status(404).json({ error: "House rule not found" });
    return;
  }

  const parsed = updateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Partial<typeof homebrewRulesTable.$inferInsert> = {};
  let textChanged = false;
  if (parsed.data.title !== undefined) {
    updateData.title = parsed.data.title.trim();
    if (updateData.title !== existing.title) textChanged = true;
  }
  if (parsed.data.bodyMd !== undefined) {
    updateData.bodyMd = parsed.data.bodyMd;
    if (parsed.data.bodyMd !== existing.bodyMd) textChanged = true;
  }
  if (parsed.data.active !== undefined) updateData.active = parsed.data.active;

  if (Object.keys(updateData).length === 0) {
    res.json(toResponse(existing));
    return;
  }

  const [updated] = await db
    .update(homebrewRulesTable)
    .set(updateData)
    .where(and(eq(homebrewRulesTable.id, id), eq(homebrewRulesTable.campaignId, campaignId)))
    .returning();

  if (textChanged) {
    await syncHomebrewEmbedding(updated.id, updated.title, updated.bodyMd);
  }

  res.json(toResponse(updated));
});

router.delete("/homebrew/:id", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();

  if (!(await isDm(campaignId, userId))) {
    res.status(403).json({ error: "Only the DM can delete house rules" });
    return;
  }

  const id = parseId(req.params.id);
  if (id == null) {
    res.status(400).json({ error: "Invalid rule ID" });
    return;
  }

  // Soft-delete: deactivate so retrieval ignores it but history is preserved.
  const [updated] = await db
    .update(homebrewRulesTable)
    .set({ active: false })
    .where(and(eq(homebrewRulesTable.id, id), eq(homebrewRulesTable.campaignId, campaignId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "House rule not found" });
    return;
  }

  res.json({ success: true });
});

router.get("/homebrew/share-token", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();
  if (!(await isDm(campaignId, userId))) {
    res.status(403).json({ error: "Only the DM can manage the share token" });
    return;
  }
  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, campaignId));
  res.json({ token: campaign?.houseRulesShareToken ?? null });
});

const shareTokenBody = z.object({ rotate: z.boolean().optional() });

router.post("/homebrew/share-token", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();
  if (!(await isDm(campaignId, userId))) {
    res.status(403).json({ error: "Only the DM can manage the share token" });
    return;
  }
  const parsed = shareTokenBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [existing] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, campaignId));
  let token = existing?.houseRulesShareToken ?? null;
  if (!token || parsed.data.rotate) {
    token = generateShareToken();
    await db.update(campaignsTable).set({ houseRulesShareToken: token }).where(eq(campaignsTable.id, campaignId));
  }
  res.json({ token });
});

router.get("/public/house-rules/:token", publicIpJsonRateLimit, async (req, res): Promise<void> => {
  const tokenRaw = req.params.token;
  const token = Array.isArray(tokenRaw) ? tokenRaw[0] : tokenRaw;
  if (!token || typeof token !== "string" || token.length < 8) {
    res.status(404).json({ error: "House rules not found" });
    return;
  }
  const [campaign] = await db
    .select()
    .from(campaignsTable)
    .where(eq(campaignsTable.houseRulesShareToken, token));
  if (!campaign) {
    res.status(404).json({ error: "House rules not found" });
    return;
  }
  const rules = await db
    .select({
      id: homebrewRulesTable.id,
      title: homebrewRulesTable.title,
      bodyMd: homebrewRulesTable.bodyMd,
      updatedAt: homebrewRulesTable.updatedAt,
    })
    .from(homebrewRulesTable)
    .where(and(eq(homebrewRulesTable.campaignId, campaign.id), eq(homebrewRulesTable.active, true)))
    .orderBy(asc(homebrewRulesTable.title));

  res.json({
    campaignName: campaign.name,
    worldName: campaign.worldName ?? null,
    generatedAt: new Date().toISOString(),
    rules: rules.map((r) => ({
      id: r.id,
      title: r.title,
      bodyMd: r.bodyMd,
      updatedAt: new Date(r.updatedAt).toISOString(),
    })),
  });
});

export default router;
