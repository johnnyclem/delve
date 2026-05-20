import { Router, type IRouter } from "express";
import {
  db,
  campaignEntitiesTable,
  entityRevealAuditTable,
  ENTITY_KINDS,
  type EntityKind,
  type CampaignEntity,
  type EntityRevealAudit,
} from "@workspace/db";
import { eq, and, asc, desc } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireCampaignMember, getUserId } from "../middlewares/requireAuth";
import { userRateLimit } from "../middlewares/userRateLimit";
import { getOrCreateCampaign, isDm } from "../lib/campaign";
import { syncEntityChunks } from "../lib/entityEmbeddings";
import { seedCampaignWorldFromSrd } from "../lib/seedWorld";

const router: IRouter = Router();

const entitiesRateLimit = userRateLimit(120, 60 * 1000);
router.use(entitiesRateLimit);

// ---------- Per-kind data validators ----------

// SRD provenance fields are populated by the world seeder so DMs can jump
// from a starter entity back to the source bestiary stat block. They are
// allowed (but not required) on any seeded kind.
const srdRefFields = {
  srdSlug: z.string().max(120).optional(),
  srdEdition: z.enum(["2014", "2024"]).optional(),
  srdChunkId: z.number().int().positive().optional(),
} as const;

const npcData = z
  .object({
    race: z.string().max(80).optional(),
    occupation: z.string().max(120).optional(),
    location: z.string().max(120).optional(),
    faction: z.string().max(120).optional(),
    disposition: z.enum(["friendly", "neutral", "hostile", "unknown"]).optional(),
    ...srdRefFields,
  })
  .strict();

const questData = z
  .object({
    status: z.enum(["hook", "active", "completed", "failed"]),
    reward: z.string().max(240).optional(),
    giver: z.string().max(120).optional(),
  })
  .strict();

const locationData = z
  .object({
    region: z.string().max(120).optional(),
    size: z.enum(["hamlet", "village", "town", "city", "metropolis", "wilderness", "other"]).optional(),
  })
  .strict();

const storyBeatData = z
  .object({
    act: z.number().int().min(1).max(20).optional(),
    order: z.number().int().min(0).optional(),
  })
  .strict();

const mobEncounterData = z
  .object({
    cr: z.string().max(20).optional(),
    count: z.number().int().min(1).max(99).optional(),
    creatureType: z.string().max(80).optional(),
    ...srdRefFields,
  })
  .strict();

const plotTwistData = z
  .object({
    triggeredBy: z.string().max(120).optional(),
  })
  .strict();

const factionData = z
  .object({
    alignment: z.string().max(40).optional(),
    leader: z.string().max(120).optional(),
    headquarters: z.string().max(120).optional(),
  })
  .strict();

const itemUniqueData = z
  .object({
    rarity: z.enum(["common", "uncommon", "rare", "very_rare", "legendary", "artifact"]).optional(),
    attunement: z.boolean().optional(),
    owner: z.string().max(120).optional(),
  })
  .strict();

const DATA_VALIDATORS: Record<EntityKind, z.ZodType<Record<string, unknown>>> = {
  npc: npcData,
  quest: questData,
  location: locationData,
  story_beat: storyBeatData,
  mob_encounter: mobEncounterData,
  plot_twist: plotTwistData,
  faction: factionData,
  item_unique: itemUniqueData,
};

function validateData(kind: EntityKind, data: unknown): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  const validator = DATA_VALIDATORS[kind];
  const parsed = validator.safeParse(data ?? {});
  if (!parsed.success) {
    return { ok: false, error: `Invalid data for ${kind}: ${parsed.error.message}` };
  }
  return { ok: true, data: parsed.data };
}

// ---------- Body schemas ----------

const entityKindSchema = z.enum(ENTITY_KINDS);

const createEntityBody = z.object({
  kind: entityKindSchema,
  name: z.string().min(1).max(160),
  publicMd: z.string().max(20000).nullish(),
  dmNotes: z.string().max(20000).nullish(),
  secretMd: z.string().max(20000).nullish(),
  trueMotivation: z.string().max(4000).nullish(),
  data: z.record(z.string(), z.unknown()).optional(),
});

const updateEntityBody = z.object({
  name: z.string().min(1).max(160).optional(),
  publicMd: z.string().max(20000).nullish(),
  dmNotes: z.string().max(20000).nullish(),
  secretMd: z.string().max(20000).nullish(),
  trueMotivation: z.string().max(4000).nullish(),
  data: z.record(z.string(), z.unknown()).optional(),
});

// ---------- Helpers ----------

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "entity";
}

async function ensureUniqueSlug(campaignId: number, kind: EntityKind, base: string): Promise<string> {
  let slug = base;
  let suffix = 1;
  // Naive uniqueness loop — entities are small in volume per campaign.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const [existing] = await db
      .select({ id: campaignEntitiesTable.id })
      .from(campaignEntitiesTable)
      .where(
        and(
          eq(campaignEntitiesTable.campaignId, campaignId),
          eq(campaignEntitiesTable.kind, kind),
          eq(campaignEntitiesTable.slug, slug),
        ),
      );
    if (!existing) return slug;
    suffix += 1;
    slug = `${base}-${suffix}`;
    if (suffix > 1000) return `${base}-${Date.now()}`;
  }
}

type EntityResponse = {
  id: number;
  campaignId: number;
  kind: EntityKind;
  slug: string;
  name: string;
  publicMd: string | null;
  data: Record<string, unknown>;
  revealed: boolean;
  revealedAt: string | null;
  revealedBy: string | null;
  createdAt: string;
  updatedAt: string;
  // DM-only fields
  dmNotes?: string | null;
  secretMd?: string | null;
  trueMotivation?: string | null;
};

function toResponse(row: CampaignEntity, isDmRequester: boolean): EntityResponse {
  const base: EntityResponse = {
    id: row.id,
    campaignId: row.campaignId,
    kind: row.kind as EntityKind,
    slug: row.slug,
    name: row.name,
    publicMd: row.publicMd,
    data: (row.data ?? {}) as Record<string, unknown>,
    revealed: row.revealed,
    revealedAt: row.revealedAt ? new Date(row.revealedAt).toISOString() : null,
    revealedBy: row.revealedBy,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
  if (isDmRequester) {
    base.dmNotes = row.dmNotes;
    base.secretMd = row.secretMd;
    base.trueMotivation = row.trueMotivation;
  }
  return base;
}

function parseId(raw: string | string[] | undefined): number | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (!v) return null;
  const id = parseInt(v, 10);
  return Number.isNaN(id) ? null : id;
}

async function loadEntity(campaignId: number, id: number): Promise<CampaignEntity | null> {
  const [row] = await db
    .select()
    .from(campaignEntitiesTable)
    .where(and(eq(campaignEntitiesTable.id, id), eq(campaignEntitiesTable.campaignId, campaignId)));
  return row ?? null;
}

// ---------- Routes ----------

router.get("/entities", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();
  const dmRequester = await isDm(campaignId, userId);

  const kindRaw = typeof req.query.kind === "string" ? req.query.kind : undefined;
  let kindFilter: EntityKind | undefined;
  if (kindRaw) {
    const parsed = entityKindSchema.safeParse(kindRaw);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid kind filter" });
      return;
    }
    kindFilter = parsed.data;
  }

  const conditions = [eq(campaignEntitiesTable.campaignId, campaignId)];
  if (kindFilter) conditions.push(eq(campaignEntitiesTable.kind, kindFilter));
  if (!dmRequester) conditions.push(eq(campaignEntitiesTable.revealed, true));

  const rows = await db
    .select()
    .from(campaignEntitiesTable)
    .where(and(...conditions))
    .orderBy(asc(campaignEntitiesTable.kind), asc(campaignEntitiesTable.name));

  res.json(rows.map((r) => toResponse(r, dmRequester)));
});

router.get("/entities/:id", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();
  const id = parseId(req.params.id);
  if (id == null) {
    res.status(400).json({ error: "Invalid entity ID" });
    return;
  }
  const row = await loadEntity(campaignId, id);
  if (!row) {
    res.status(404).json({ error: "Entity not found" });
    return;
  }
  const dmRequester = await isDm(campaignId, userId);
  if (!row.revealed && !dmRequester) {
    res.status(404).json({ error: "Entity not found" });
    return;
  }
  res.json(toResponse(row, dmRequester));
});

router.post("/entities", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();

  if (!(await isDm(campaignId, userId))) {
    res.status(403).json({ error: "Only the DM can create entities" });
    return;
  }

  const parsed = createEntityBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const dataResult = validateData(parsed.data.kind, parsed.data.data ?? {});
  if (!dataResult.ok) {
    res.status(400).json({ error: dataResult.error });
    return;
  }

  const name = parsed.data.name.trim();
  const slug = await ensureUniqueSlug(campaignId, parsed.data.kind, slugify(name));

  const [created] = await db
    .insert(campaignEntitiesTable)
    .values({
      campaignId,
      kind: parsed.data.kind,
      slug,
      name,
      publicMd: parsed.data.publicMd ?? null,
      dmNotes: parsed.data.dmNotes ?? null,
      secretMd: parsed.data.secretMd ?? null,
      trueMotivation: parsed.data.trueMotivation ?? null,
      data: dataResult.data,
    })
    .returning();

  await syncEntityChunks(created.id, campaignId, [
    { field: "public_md", body: created.publicMd },
    { field: "secret_md", body: created.secretMd },
    { field: "dm_notes", body: created.dmNotes },
  ]);

  res.status(201).json(toResponse(created, true));
});

router.patch("/entities/:id", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();

  if (!(await isDm(campaignId, userId))) {
    res.status(403).json({ error: "Only the DM can edit entities" });
    return;
  }

  const id = parseId(req.params.id);
  if (id == null) {
    res.status(400).json({ error: "Invalid entity ID" });
    return;
  }

  const existing = await loadEntity(campaignId, id);
  if (!existing) {
    res.status(404).json({ error: "Entity not found" });
    return;
  }

  const parsed = updateEntityBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Partial<typeof campaignEntitiesTable.$inferInsert> = {};
  let publicChanged = false;
  let secretChanged = false;

  if (parsed.data.name !== undefined) updateData.name = parsed.data.name.trim();

  if (parsed.data.publicMd !== undefined) {
    updateData.publicMd = parsed.data.publicMd ?? null;
    publicChanged = (existing.publicMd ?? null) !== (parsed.data.publicMd ?? null);
  }

  if (parsed.data.dmNotes !== undefined) {
    updateData.dmNotes = parsed.data.dmNotes ?? null;
    if ((existing.dmNotes ?? null) !== (parsed.data.dmNotes ?? null)) secretChanged = true;
  }
  if (parsed.data.secretMd !== undefined) {
    updateData.secretMd = parsed.data.secretMd ?? null;
    if ((existing.secretMd ?? null) !== (parsed.data.secretMd ?? null)) secretChanged = true;
  }
  if (parsed.data.trueMotivation !== undefined) {
    updateData.trueMotivation = parsed.data.trueMotivation ?? null;
    if ((existing.trueMotivation ?? null) !== (parsed.data.trueMotivation ?? null)) secretChanged = true;
  }

  if (parsed.data.data !== undefined) {
    const dataResult = validateData(existing.kind as EntityKind, parsed.data.data);
    if (!dataResult.ok) {
      res.status(400).json({ error: dataResult.error });
      return;
    }
    updateData.data = dataResult.data;
  }

  if (Object.keys(updateData).length === 0) {
    res.json(toResponse(existing, true));
    return;
  }

  const [updated] = await db
    .update(campaignEntitiesTable)
    .set(updateData)
    .where(and(eq(campaignEntitiesTable.id, id), eq(campaignEntitiesTable.campaignId, campaignId)))
    .returning();

  if (publicChanged) {
    await db.insert(entityRevealAuditTable).values({
      entityId: id,
      campaignId,
      action: "edit_public",
      actor: userId,
      diff: null,
    });
  }
  if (secretChanged) {
    await db.insert(entityRevealAuditTable).values({
      entityId: id,
      campaignId,
      action: "edit_secret",
      actor: userId,
      diff: null,
    });
  }

  // Re-embed only the fields that actually changed.
  const fieldUpdates: Array<{ field: "public_md" | "secret_md" | "dm_notes"; body: string | null }> = [];
  if (parsed.data.publicMd !== undefined) {
    fieldUpdates.push({ field: "public_md", body: updated.publicMd });
  }
  if (parsed.data.secretMd !== undefined) {
    fieldUpdates.push({ field: "secret_md", body: updated.secretMd });
  }
  if (parsed.data.dmNotes !== undefined) {
    fieldUpdates.push({ field: "dm_notes", body: updated.dmNotes });
  }
  if (fieldUpdates.length > 0) {
    await syncEntityChunks(id, campaignId, fieldUpdates);
  }

  res.json(toResponse(updated, true));
});

router.delete("/entities/:id", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();

  if (!(await isDm(campaignId, userId))) {
    res.status(403).json({ error: "Only the DM can delete entities" });
    return;
  }

  const id = parseId(req.params.id);
  if (id == null) {
    res.status(400).json({ error: "Invalid entity ID" });
    return;
  }

  const [deleted] = await db
    .delete(campaignEntitiesTable)
    .where(and(eq(campaignEntitiesTable.id, id), eq(campaignEntitiesTable.campaignId, campaignId)))
    .returning({ id: campaignEntitiesTable.id });

  if (!deleted) {
    res.status(404).json({ error: "Entity not found" });
    return;
  }

  res.json({ success: true });
});

router.post("/entities/:id/reveal", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();

  if (!(await isDm(campaignId, userId))) {
    res.status(403).json({ error: "Only the DM can reveal entities" });
    return;
  }

  const id = parseId(req.params.id);
  if (id == null) {
    res.status(400).json({ error: "Invalid entity ID" });
    return;
  }

  const existing = await loadEntity(campaignId, id);
  if (!existing) {
    res.status(404).json({ error: "Entity not found" });
    return;
  }

  const [updated] = await db
    .update(campaignEntitiesTable)
    .set({ revealed: true, revealedAt: new Date(), revealedBy: userId })
    .where(and(eq(campaignEntitiesTable.id, id), eq(campaignEntitiesTable.campaignId, campaignId)))
    .returning();

  await db.insert(entityRevealAuditTable).values({
    entityId: id,
    campaignId,
    action: "reveal",
    actor: userId,
    diff: null,
  });

  res.json(toResponse(updated, true));
});

router.post("/entities/:id/unreveal", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();

  if (!(await isDm(campaignId, userId))) {
    res.status(403).json({ error: "Only the DM can unreveal entities" });
    return;
  }

  const id = parseId(req.params.id);
  if (id == null) {
    res.status(400).json({ error: "Invalid entity ID" });
    return;
  }

  const existing = await loadEntity(campaignId, id);
  if (!existing) {
    res.status(404).json({ error: "Entity not found" });
    return;
  }

  const [updated] = await db
    .update(campaignEntitiesTable)
    .set({ revealed: false, revealedAt: null, revealedBy: null })
    .where(and(eq(campaignEntitiesTable.id, id), eq(campaignEntitiesTable.campaignId, campaignId)))
    .returning();

  await db.insert(entityRevealAuditTable).values({
    entityId: id,
    campaignId,
    action: "unreveal",
    actor: userId,
    diff: null,
  });

  res.json(toResponse(updated, true));
});

router.get("/entities/:id/audit", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();

  if (!(await isDm(campaignId, userId))) {
    res.status(403).json({ error: "Only the DM can view the audit trail" });
    return;
  }

  const id = parseId(req.params.id);
  if (id == null) {
    res.status(400).json({ error: "Invalid entity ID" });
    return;
  }

  const existing = await loadEntity(campaignId, id);
  if (!existing) {
    res.status(404).json({ error: "Entity not found" });
    return;
  }

  const rows = await db
    .select()
    .from(entityRevealAuditTable)
    .where(eq(entityRevealAuditTable.entityId, id))
    .orderBy(desc(entityRevealAuditTable.at));

  res.json(
    rows.map((r: EntityRevealAudit) => ({
      id: r.id,
      entityId: r.entityId,
      campaignId: r.campaignId,
      action: r.action,
      actor: r.actor,
      at: new Date(r.at).toISOString(),
    })),
  );
});

router.post("/entities/seed-srd", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();

  if (!(await isDm(campaignId, userId))) {
    res.status(403).json({ error: "Only the DM can seed starter content" });
    return;
  }

  const summary = await seedCampaignWorldFromSrd(campaignId);
  if (!summary.bestiaryAvailable) {
    res.status(409).json({
      error: "SRD bestiary has not been ingested yet. Run `pnpm --filter @workspace/scripts run srd:ingest-api` to populate it.",
      bestiaryAvailable: false,
    });
    return;
  }
  res.json(summary);
});

export default router;
