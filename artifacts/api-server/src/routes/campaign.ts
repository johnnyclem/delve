import { Router, type IRouter } from "express";
import { db, campaignsTable, campaignMembersTable, charactersTable, sessionLogsTable, calendarEventsTable, rsvpsTable, diceRollsTable } from "@workspace/db";
import { eq, desc, and, gte, asc, isNotNull } from "drizzle-orm";
import { requireAuth, getUserId, getUserDisplayName, getUserAvatarUrl } from "../middlewares/requireAuth";
import { getOrCreateCampaign, ensureMember } from "../lib/campaign";

const router: IRouter = Router();

router.get("/campaign", requireAuth, async (req, res): Promise<void> => {
  const campaignId = await getOrCreateCampaign();
  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, campaignId));
  res.json(campaign);
});

router.get("/campaign/dashboard", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();
  await ensureMember(campaignId, userId, getUserDisplayName(req), getUserAvatarUrl(req));

  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, campaignId));

  const members = await db.select().from(campaignMembersTable).where(eq(campaignMembersTable.campaignId, campaignId));

  const characters = await db.select().from(charactersTable).where(and(eq(charactersTable.campaignId, campaignId), eq(charactersTable.isActive, true)));

  const partyMembers = members.map((m) => {
    const char = characters.find((c) => c.ownerUserId === m.userId);
    return {
      memberId: m.id,
      userId: m.userId,
      displayName: m.displayName,
      avatarUrl: m.avatarUrl,
      role: m.role,
      characterName: char?.name ?? null,
      characterClass: char?.class ?? null,
      characterLevel: char?.level ?? null,
      characterRace: char?.race ?? null,
    };
  });

  const sessions = await db.select().from(sessionLogsTable).where(eq(sessionLogsTable.campaignId, campaignId));

  const [latestRecap] = await db
    .select()
    .from(sessionLogsTable)
    .where(and(eq(sessionLogsTable.campaignId, campaignId), isNotNull(sessionLogsTable.recapMd)))
    .orderBy(desc(sessionLogsTable.sessionNumber))
    .limit(1);

  const now = new Date();
  const [nextEvent] = await db
    .select()
    .from(calendarEventsTable)
    .where(and(eq(calendarEventsTable.campaignId, campaignId), gte(calendarEventsTable.proposedAt, now)))
    .orderBy(asc(calendarEventsTable.proposedAt))
    .limit(1);

  let nextEventWithRsvps = null;
  if (nextEvent) {
    const eventRsvps = await db.select().from(rsvpsTable).where(eq(rsvpsTable.calendarEventId, nextEvent.id));
    const rsvpsWithMembers = eventRsvps.map((r) => {
      const member = members.find((m) => m.userId === r.userId);
      return {
        ...r,
        displayName: member?.displayName ?? "Unknown",
        avatarUrl: member?.avatarUrl ?? null,
      };
    });
    nextEventWithRsvps = { ...nextEvent, rsvps: rsvpsWithMembers };
  }

  const recentRolls = await db
    .select()
    .from(diceRollsTable)
    .where(eq(diceRollsTable.campaignId, campaignId))
    .orderBy(desc(diceRollsTable.rolledAt))
    .limit(5);

  res.json({
    campaign,
    nextEvent: nextEventWithRsvps,
    latestRecap: latestRecap ?? null,
    partyMembers,
    totalSessions: sessions.length,
    recentRolls,
  });
});

export default router;
