import { Router, type IRouter } from "express";
import { db, charactersTable, campaignMembersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireCampaignMember, getUserId } from "../middlewares/requireAuth";
import { getOrCreateCampaign, isDm } from "../lib/campaign";
import { UpdateCharacterBody, CreateCharacterBody } from "@workspace/api-zod";
import { fillCharacterSheetPdf } from "../lib/character-pdf";

const router: IRouter = Router();

router.post("/characters", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const parsed = CreateCharacterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const campaignId = await getOrCreateCampaign();

  const [created] = await db
    .insert(charactersTable)
    .values({
      campaignId,
      ownerUserId: userId,
      name: parsed.data.name,
      race: parsed.data.race,
      class: parsed.data.class,
      level: parsed.data.level ?? 1,
      sheetJson: {
        strength: 10, dexterity: 10, constitution: 10,
        intelligence: 10, wisdom: 10, charisma: 10,
        maxHp: 10, currentHp: 10, armorClass: 10,
        speed: 30, proficiencyBonus: 2,
        ...(parsed.data.sheetJson ?? {}),
      },
      portraitUrl: parsed.data.portraitUrl ?? null,
    })
    .returning();

  const members = await db.select().from(campaignMembersTable).where(eq(campaignMembersTable.campaignId, campaignId));
  const owner = members.find((m) => m.userId === created.ownerUserId);

  res.status(201).json({ ...created, ownerDisplayName: owner?.displayName ?? "Unknown" });
});

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

router.get("/characters/:id/pdf", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
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

  const userIsDm = await isDm(campaignId, userId);
  if (char.ownerUserId !== userId && !userIsDm) {
    res.status(403).json({ error: "Not your character" });
    return;
  }

  const members = await db.select().from(campaignMembersTable).where(eq(campaignMembersTable.campaignId, campaignId));
  const owner = members.find((m) => m.userId === char.ownerUserId);

  let pdfBytes: Uint8Array;
  try {
    pdfBytes = await fillCharacterSheetPdf({ ...char, ownerDisplayName: owner?.displayName ?? "Unknown" });
  } catch (err) {
    console.error("PDF generation failed", err);
    res.status(500).json({ error: "Failed to generate PDF" });
    return;
  }

  const safeName = char.name.replace(/[^a-z0-9-_ ]/gi, "_").replace(/\s+/g, "_") || `character-${char.id}`;
  const filename = `${safeName}-character-sheet.pdf`;
  const disposition = req.query.download === "1" ? "attachment" : "inline";

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `${disposition}; filename="${filename}"`);
  res.setHeader("Content-Length", String(pdfBytes.length));
  res.setHeader("Cache-Control", "private, no-store");
  res.end(Buffer.from(pdfBytes));
});

export default router;
