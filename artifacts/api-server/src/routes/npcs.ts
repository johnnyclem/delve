import { Router, type IRouter } from "express";
import { db, npcsTable, npcDialogueLinesTable, type Npc } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { requireAuth, requireCampaignMember, getUserId } from "../middlewares/requireAuth";
import { getOrCreateCampaign, isDm } from "../lib/campaign";
import { CreateNpcBody, UpdateNpcBody } from "@workspace/api-zod";
import {
  listArchetypes,
  getArchetype,
  rollName,
  rollBackstory,
  rollPublicMotive,
  rollSecretMotive,
  buildStarterDialogue,
  buildPortraitPrompt,
} from "@workspace/npc-archetypes";
import { generateImageBuffer } from "@workspace/integrations-openai-ai-server";
import { ObjectStorageService } from "../lib/objectStorage";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const storage = new ObjectStorageService();

// ─── Helpers ────────────────────────────────────────────────────────

// Strip DM-only data when responding to a non-DM. Players never see the
// secret motive nor any dialogue line marked dmOnly.
function redactNpcForRole<T extends Partial<Npc>>(npc: T, viewerIsDm: boolean): T {
  if (viewerIsDm) return npc;
  return { ...npc, secretMotive: null };
}

async function uploadPortraitPng(bytes: Buffer): Promise<string> {
  const uploadURL = await storage.getObjectEntityUploadURL();
  const putRes = await fetch(uploadURL, {
    method: "PUT",
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(bytes.length),
    },
    body: bytes,
  });
  if (!putRes.ok) {
    throw new Error(
      `Object storage PUT failed: ${putRes.status} ${putRes.statusText}`,
    );
  }
  return storage.normalizeObjectEntityPath(uploadURL);
}

// ─── Archetype catalog ──────────────────────────────────────────────

// Lite archetype list — DMs (and players, harmless) use this for the
// FE picker. Returns curated catalog metadata only; rich templates
// stay server-side.
router.get("/npcs/archetypes", requireAuth, requireCampaignMember, (_req, res): void => {
  res.json(listArchetypes());
});

// Generates a prefilled NPC draft from an archetype. Does NOT persist —
// the FE shows it in the form and lets the DM tweak before saving.
//
// Body:
//   { archetypeKey: string, only?: string[] }
//
// When `only` is omitted, every field is rolled (including the portrait
// and starter dialogue lines, which are the slow / costly steps). When
// `only` is provided, only the listed keys are rolled. This is what
// powers the per-field "↻" reroll buttons without re-generating the
// portrait every time the DM clicks "new name".
router.post(
  "/npcs/from-archetype",
  requireAuth,
  requireCampaignMember,
  async (req, res): Promise<void> => {
    const userId = getUserId(req);
    const campaignId = await getOrCreateCampaign();
    if (!(await isDm(campaignId, userId))) {
      res.status(403).json({ error: "Only the DM can roll NPC archetypes" });
      return;
    }

    const archetypeKey = typeof req.body?.archetypeKey === "string" ? req.body.archetypeKey : "";
    const only: string[] | undefined = Array.isArray(req.body?.only)
      ? (req.body.only as unknown[]).filter((v): v is string => typeof v === "string")
      : undefined;
    // Optional current draft name from the FE — used so that per-field
    // re-rolls of name-dependent fields (backstory / motives) substitute
    // the NPC's actual name, not a fresh random one. Only honored when
    // the caller is NOT also rerolling `name`.
    const callerName =
      typeof req.body?.currentName === "string" ? req.body.currentName.trim() : "";

    const archetype = getArchetype(archetypeKey);
    if (!archetype) {
      res.status(400).json({ error: `Unknown archetype: ${archetypeKey}` });
      return;
    }

    const want = (field: string): boolean =>
      only === undefined || only.includes(field);

    // Resolve the name used for {name} template substitution:
    //   - If the caller is rolling `name`, use the freshly rolled value.
    //   - Otherwise, use the caller-supplied current draft name when
    //     present, so per-field rerolls stay consistent.
    //   - As a last resort, roll a throwaway name so substitution still
    //     produces non-broken text.
    const namedField = want("backstory") || want("publicMotive") || want("secretMotive");
    let name: string | undefined;
    if (want("name")) {
      name = rollName(archetype.nameTable);
    } else if (namedField) {
      name = callerName || rollName(archetype.nameTable);
    }

    const out: Record<string, unknown> = { archetypeKey };
    if (want("name")) out.name = name;
    if (want("occupation")) out.occupation = archetype.occupation;
    if (want("suggestedClass")) out.suggestedClass = archetype.suggestedClass;
    if (want("backstory")) out.backstoryMd = rollBackstory(archetype, name ?? "");
    if (want("publicMotive")) out.publicMotive = rollPublicMotive(archetype, name ?? "");
    if (want("secretMotive")) out.secretMotive = rollSecretMotive(archetype, name ?? "");
    if (want("dialogueLines")) out.dialogueLines = buildStarterDialogue(archetype);

    if (want("portrait")) {
      try {
        const prompt = buildPortraitPrompt(archetype);
        const bytes = await generateImageBuffer(prompt, "1024x1024");
        const objectPath = await uploadPortraitPng(bytes);
        out.avatarUrl = objectPath;
      } catch (err) {
        // Don't fail the whole prefill if image generation hiccups —
        // text fields are still useful and the DM can re-roll the
        // portrait via the per-field button.
        logger.error({ err, archetypeKey }, "[npcs] portrait generation failed");
        out.avatarUrl = null;
      }
    }

    res.json(out);
  },
);

// ─── List ───────────────────────────────────────────────────────────

router.get("/npcs", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();
  const viewerIsDm = await isDm(campaignId, userId);
  const npcs = await db
    .select()
    .from(npcsTable)
    .where(eq(npcsTable.campaignId, campaignId))
    .orderBy(asc(npcsTable.name));
  res.json(npcs.map((n) => redactNpcForRole(n, viewerIsDm)));
});

// ─── Detail (with dialogue) ─────────────────────────────────────────

router.get("/npcs/:id", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();
  const viewerIsDm = await isDm(campaignId, userId);

  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid NPC ID" });
    return;
  }

  const [npc] = await db
    .select()
    .from(npcsTable)
    .where(and(eq(npcsTable.id, id), eq(npcsTable.campaignId, campaignId)))
    .limit(1);
  if (!npc) {
    res.status(404).json({ error: "NPC not found" });
    return;
  }

  const lines = await db
    .select()
    .from(npcDialogueLinesTable)
    .where(eq(npcDialogueLinesTable.npcId, npc.id))
    .orderBy(asc(npcDialogueLinesTable.orderIndex), asc(npcDialogueLinesTable.id));

  // Players never see DM-only lines.
  const visibleLines = viewerIsDm ? lines : lines.filter((l) => !l.dmOnly);

  res.json({
    ...redactNpcForRole(npc, viewerIsDm),
    dialogueLines: visibleLines,
  });
});

// ─── Create ─────────────────────────────────────────────────────────

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

  const dialogueLines = Array.isArray(req.body?.dialogueLines)
    ? (req.body.dialogueLines as Array<{
        topic?: unknown;
        line?: unknown;
        dmOnly?: unknown;
        orderIndex?: unknown;
      }>)
    : [];

  // Insert NPC + any starter dialogue lines together. Drizzle doesn't
  // expose a multi-statement transaction here as a single op, but the
  // FK CASCADE means dialogue rows die with the NPC — and we rollback
  // the NPC row by hand if dialogue insertion fails so we don't leave
  // half-built rows around.
  const [created] = await db
    .insert(npcsTable)
    .values({
      campaignId,
      name,
      shortNote: parsed.data.shortNote ?? null,
      avatarUrl: parsed.data.avatarUrl ?? null,
      relationshipTags: parsed.data.relationshipTags ?? [],
      archetypeKey: (req.body?.archetypeKey as string | null | undefined) ?? null,
      occupation: (req.body?.occupation as string | null | undefined) ?? null,
      suggestedClass: (req.body?.suggestedClass as string | null | undefined) ?? null,
      backstoryMd: (req.body?.backstoryMd as string | null | undefined) ?? null,
      publicMotive: (req.body?.publicMotive as string | null | undefined) ?? null,
      secretMotive: (req.body?.secretMotive as string | null | undefined) ?? null,
      createdByUserId: userId,
    })
    .returning();

  if (dialogueLines.length > 0) {
    try {
      const rows = dialogueLines
        .filter(
          (d) =>
            typeof d.topic === "string" &&
            typeof d.line === "string" &&
            (d.topic as string).trim() &&
            (d.line as string).trim(),
        )
        .map((d, idx) => ({
          npcId: created.id,
          topic: (d.topic as string).trim(),
          line: (d.line as string).trim(),
          dmOnly: d.dmOnly === true,
          orderIndex:
            typeof d.orderIndex === "number" && Number.isFinite(d.orderIndex)
              ? d.orderIndex
              : idx,
        }));
      if (rows.length > 0) {
        await db.insert(npcDialogueLinesTable).values(rows);
      }
    } catch (err) {
      logger.error({ err, npcId: created.id }, "[npcs] starter dialogue insert failed; rolling back NPC");
      await db.delete(npcsTable).where(eq(npcsTable.id, created.id));
      res.status(500).json({ error: "Failed to attach starter dialogue" });
      return;
    }
  }

  res.status(201).json(created);
});

// ─── Update ─────────────────────────────────────────────────────────

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
  // Archetype prefill fields — keep the simple `if defined, write` pattern
  // so a `null` clears the field but an absent key leaves it alone.
  for (const k of [
    "archetypeKey",
    "occupation",
    "suggestedClass",
    "backstoryMd",
    "publicMotive",
    "secretMotive",
  ] as const) {
    if ((parsed.data as Record<string, unknown>)[k] !== undefined) {
      updateData[k] = (parsed.data as Record<string, unknown>)[k];
    }
  }

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

// ─── Delete ─────────────────────────────────────────────────────────

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

// ─── Dialogue CRUD ──────────────────────────────────────────────────

async function loadOwnedNpc(
  id: number,
  campaignId: number,
): Promise<Npc | undefined> {
  const [npc] = await db
    .select()
    .from(npcsTable)
    .where(and(eq(npcsTable.id, id), eq(npcsTable.campaignId, campaignId)))
    .limit(1);
  return npc;
}

router.post(
  "/npcs/:id/dialogue",
  requireAuth,
  requireCampaignMember,
  async (req, res): Promise<void> => {
    const userId = getUserId(req);
    const campaignId = await getOrCreateCampaign();
    if (!(await isDm(campaignId, userId))) {
      res.status(403).json({ error: "Only the DM can add dialogue lines" });
      return;
    }
    const npcId = parseInt(String(req.params.id), 10);
    if (isNaN(npcId)) {
      res.status(400).json({ error: "Invalid NPC ID" });
      return;
    }
    const npc = await loadOwnedNpc(npcId, campaignId);
    if (!npc) {
      res.status(404).json({ error: "NPC not found" });
      return;
    }

    const topic = typeof req.body?.topic === "string" ? req.body.topic.trim() : "";
    const line = typeof req.body?.line === "string" ? req.body.line.trim() : "";
    if (!topic || !line) {
      res.status(400).json({ error: "topic and line are required" });
      return;
    }
    const dmOnly = req.body?.dmOnly === true;
    const orderIndex =
      typeof req.body?.orderIndex === "number" && Number.isFinite(req.body.orderIndex)
        ? (req.body.orderIndex as number)
        : 0;

    const [created] = await db
      .insert(npcDialogueLinesTable)
      .values({ npcId, topic, line, dmOnly, orderIndex })
      .returning();
    res.status(201).json(created);
  },
);

router.patch(
  "/npcs/:id/dialogue/:lineId",
  requireAuth,
  requireCampaignMember,
  async (req, res): Promise<void> => {
    const userId = getUserId(req);
    const campaignId = await getOrCreateCampaign();
    if (!(await isDm(campaignId, userId))) {
      res.status(403).json({ error: "Only the DM can edit dialogue lines" });
      return;
    }
    const npcId = parseInt(String(req.params.id), 10);
    const lineId = parseInt(String(req.params.lineId), 10);
    if (isNaN(npcId) || isNaN(lineId)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const npc = await loadOwnedNpc(npcId, campaignId);
    if (!npc) {
      res.status(404).json({ error: "NPC not found" });
      return;
    }

    const updateData: Record<string, unknown> = {};
    if (typeof req.body?.topic === "string") updateData.topic = req.body.topic.trim();
    if (typeof req.body?.line === "string") updateData.line = req.body.line.trim();
    if (typeof req.body?.dmOnly === "boolean") updateData.dmOnly = req.body.dmOnly;
    if (typeof req.body?.orderIndex === "number") updateData.orderIndex = req.body.orderIndex;
    if (Object.keys(updateData).length === 0) {
      res.status(400).json({ error: "No fields to update" });
      return;
    }

    const [updated] = await db
      .update(npcDialogueLinesTable)
      .set(updateData)
      .where(
        and(eq(npcDialogueLinesTable.id, lineId), eq(npcDialogueLinesTable.npcId, npcId)),
      )
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Dialogue line not found" });
      return;
    }
    res.json(updated);
  },
);

router.delete(
  "/npcs/:id/dialogue/:lineId",
  requireAuth,
  requireCampaignMember,
  async (req, res): Promise<void> => {
    const userId = getUserId(req);
    const campaignId = await getOrCreateCampaign();
    if (!(await isDm(campaignId, userId))) {
      res.status(403).json({ error: "Only the DM can delete dialogue lines" });
      return;
    }
    const npcId = parseInt(String(req.params.id), 10);
    const lineId = parseInt(String(req.params.lineId), 10);
    if (isNaN(npcId) || isNaN(lineId)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const npc = await loadOwnedNpc(npcId, campaignId);
    if (!npc) {
      res.status(404).json({ error: "NPC not found" });
      return;
    }
    const [deleted] = await db
      .delete(npcDialogueLinesTable)
      .where(
        and(eq(npcDialogueLinesTable.id, lineId), eq(npcDialogueLinesTable.npcId, npcId)),
      )
      .returning({ id: npcDialogueLinesTable.id });
    if (!deleted) {
      res.status(404).json({ error: "Dialogue line not found" });
      return;
    }
    res.json({ success: true });
  },
);

export default router;
