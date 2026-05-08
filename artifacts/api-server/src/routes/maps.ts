import { Router, type IRouter } from "express";
import { db, mapsTable, type MapRow, type MapTile, type MapToken, type MapType } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { requireAuth, requireCampaignMember, getUserId } from "../middlewares/requireAuth";
import { getOrCreateCampaign, isDm } from "../lib/campaign";
import { CreateMapBody, UpdateMapBody } from "@workspace/api-zod";

const router: IRouter = Router();

const MAX_PATCH_BYTES = 50 * 1024;
const MAX_TOKENS = 50;
const VALID_TYPES: ReadonlySet<MapType> = new Set(["dungeon", "town", "world"]);

const DEFAULT_TILE_BY_TYPE: Record<MapType, string> = {
  dungeon: "stone",
  town: "wood",
  world: "grass",
};

function summarize(map: MapRow) {
  const { tilesJson: _t, tokensJson, ...rest } = map;
  return { ...rest, tokenCount: Array.isArray(tokensJson) ? tokensJson.length : 0 };
}

function toApiShape(map: MapRow) {
  const { tilesJson, tokensJson, ...rest } = map;
  return { ...rest, tiles: tilesJson ?? [], tokens: tokensJson ?? [] };
}

export function applyFogFilter(
  map: { tiles: MapTile[]; tokens: MapToken[] },
  isDmRequester: boolean,
): { tiles: MapTile[]; tokens: MapToken[] } {
  if (isDmRequester) return map;
  // For non-DMs, normalize unrevealed tiles so the client cannot infer fog
  // state from server data: strip the type AND force revealed=true. The
  // client treats `type === null` as a black/fog square.
  const tiles = map.tiles.map((t) =>
    t.revealed ? t : { ...t, type: null, revealed: true },
  );
  return { tiles, tokens: map.tokens };
}

router.get("/maps", requireAuth, requireCampaignMember, async (_req, res): Promise<void> => {
  const campaignId = await getOrCreateCampaign();
  const rows = await db
    .select()
    .from(mapsTable)
    .where(eq(mapsTable.campaignId, campaignId))
    .orderBy(desc(mapsTable.updatedAt));
  res.json(rows.map(summarize));
});

router.post("/maps", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();

  if (!(await isDm(campaignId, userId))) {
    res.status(403).json({ error: "Only the DM can create maps" });
    return;
  }

  const parsed = CreateMapBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { name, type, rows, cols } = parsed.data;
  if (!VALID_TYPES.has(type as MapType)) {
    res.status(400).json({ error: "Invalid map type" });
    return;
  }

  const defaultTile = DEFAULT_TILE_BY_TYPE[type as MapType];
  const total = rows * cols;
  const tiles: MapTile[] = Array.from({ length: total }, (_, i) => ({
    index: i,
    type: defaultTile,
    revealed: false,
  }));

  const [created] = await db
    .insert(mapsTable)
    .values({
      campaignId,
      name,
      type: type as MapType,
      rows,
      cols,
      tilesJson: tiles,
      tokensJson: [],
      createdByUserId: userId,
    })
    .returning();

  res.status(201).json(toApiShape(created));
});

router.get("/maps/:id", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const campaignId = await getOrCreateCampaign();
  const userId = getUserId(req);
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid map ID" });
    return;
  }

  const [row] = await db
    .select()
    .from(mapsTable)
    .where(and(eq(mapsTable.id, id), eq(mapsTable.campaignId, campaignId)));

  if (!row) {
    res.status(404).json({ error: "Map not found" });
    return;
  }

  const dmRequester = await isDm(campaignId, userId);
  const shape = toApiShape(row);
  const filtered = applyFogFilter(shape, dmRequester);
  res.json({ ...shape, tiles: filtered.tiles, tokens: filtered.tokens });
});

router.patch("/maps/:id", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();

  if (!(await isDm(campaignId, userId))) {
    res.status(403).json({ error: "Only the DM can edit maps" });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid map ID" });
    return;
  }

  // Body-size sanity cap so a runaway client can't push multi-MB tiles arrays.
  const bodyBytes = Buffer.byteLength(JSON.stringify(req.body ?? {}), "utf8");
  if (bodyBytes > MAX_PATCH_BYTES) {
    res.status(413).json({ error: "Map patch too large" });
    return;
  }

  const parsed = UpdateMapBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select()
    .from(mapsTable)
    .where(and(eq(mapsTable.id, id), eq(mapsTable.campaignId, campaignId)));
  if (!existing) {
    res.status(404).json({ error: "Map not found" });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;

  if (parsed.data.tiles !== undefined) {
    const tiles = parsed.data.tiles as MapTile[];
    const expectedLen = existing.rows * existing.cols;
    if (tiles.length !== expectedLen) {
      res.status(400).json({ error: `Tiles length must equal rows*cols (${expectedLen})` });
      return;
    }
    for (const t of tiles) {
      if (
        typeof t.index !== "number" ||
        t.index < 0 ||
        t.index >= expectedLen ||
        typeof t.revealed !== "boolean" ||
        (t.type !== null && typeof t.type !== "string")
      ) {
        res.status(400).json({ error: "Invalid tile entry" });
        return;
      }
    }
    updateData.tilesJson = tiles;
  }

  if (parsed.data.tokens !== undefined) {
    const tokens = parsed.data.tokens as MapToken[];
    if (tokens.length > MAX_TOKENS) {
      res.status(400).json({ error: `Too many tokens (max ${MAX_TOKENS})` });
      return;
    }
    const expectedLen = existing.rows * existing.cols;
    for (const t of tokens) {
      if (
        typeof t.id !== "string" ||
        typeof t.index !== "number" ||
        t.index < 0 ||
        t.index >= expectedLen ||
        !["player", "monster", "npc"].includes(t.type)
      ) {
        res.status(400).json({ error: "Invalid token entry" });
        return;
      }
    }
    updateData.tokensJson = tokens;
  }

  if (Object.keys(updateData).length === 0) {
    res.json(toApiShape(existing));
    return;
  }

  const [updated] = await db
    .update(mapsTable)
    .set(updateData)
    .where(and(eq(mapsTable.id, id), eq(mapsTable.campaignId, campaignId)))
    .returning();

  res.json(toApiShape(updated));
});

router.delete("/maps/:id", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();

  if (!(await isDm(campaignId, userId))) {
    res.status(403).json({ error: "Only the DM can delete maps" });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid map ID" });
    return;
  }

  const deleted = await db
    .delete(mapsTable)
    .where(and(eq(mapsTable.id, id), eq(mapsTable.campaignId, campaignId)))
    .returning({ id: mapsTable.id });

  if (deleted.length === 0) {
    res.status(404).json({ error: "Map not found" });
    return;
  }

  res.status(204).end();
});

export default router;
