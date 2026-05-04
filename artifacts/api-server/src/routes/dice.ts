import { Router, type IRouter } from "express";
import { db, diceRollsTable, campaignMembersTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { requireAuth, requireCampaignMember, getUserId } from "../middlewares/requireAuth";
import { getOrCreateCampaign } from "../lib/campaign";
import { RollDiceBody } from "@workspace/api-zod";
import { parseDiceExpression } from "../lib/dice";

const router: IRouter = Router();

router.post("/dice/roll", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();

  const parsed = RollDiceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let result;
  try {
    result = parseDiceExpression(parsed.data.expression);
  } catch {
    res.status(400).json({ error: "Invalid dice expression" });
    return;
  }

  const [member] = await db
    .select()
    .from(campaignMembersTable)
    .where(and(eq(campaignMembersTable.campaignId, campaignId), eq(campaignMembersTable.userId, userId)));

  const [roll] = await db
    .insert(diceRollsTable)
    .values({
      campaignId,
      characterId: parsed.data.characterId ?? null,
      userId,
      expression: parsed.data.expression,
      result: result.total,
      breakdown: result.breakdown,
      label: parsed.data.label ?? null,
      displayName: member?.displayName ?? "Unknown",
    })
    .returning();

  res.status(201).json(roll);
});

router.get("/dice/recent", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const campaignId = await getOrCreateCampaign();
  const rolls = await db
    .select()
    .from(diceRollsTable)
    .where(eq(diceRollsTable.campaignId, campaignId))
    .orderBy(desc(diceRollsTable.rolledAt))
    .limit(20);
  res.json(rolls);
});

export default router;
