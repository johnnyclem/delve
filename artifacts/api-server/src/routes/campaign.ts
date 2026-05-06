import { Router, type IRouter } from "express";
import { db, campaignsTable, campaignMembersTable, charactersTable, sessionLogsTable, calendarEventsTable, rsvpsTable, diceRollsTable } from "@workspace/db";
import { eq, desc, and, gte, asc, isNotNull } from "drizzle-orm";
import { requireAuth, getUserId, getUserDisplayName, getUserAvatarUrl } from "../middlewares/requireAuth";
import { getOrCreateCampaign, getMember, syncMemberProfile, getCampaignInviteCode } from "../lib/campaign";

const router: IRouter = Router();

router.get("/campaign", requireAuth, async (req, res): Promise<void> => {
  const campaignId = await getOrCreateCampaign();
  const [campaign] = await db.select().from(campaignsTable).where(eq(campaignsTable.id, campaignId));
  const { inviteCode: _code, ...safeCampaign } = campaign;
  res.json(safeCampaign);
});

router.get("/campaign/dashboard", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();

  const existing = await getMember(campaignId, userId);
  if (!existing) {
    res.status(403).json({ error: "Not a campaign member", needsInvite: true });
    return;
  }
  const member = (await syncMemberProfile(campaignId, userId, getUserDisplayName(req), getUserAvatarUrl(req))) ?? existing;

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
  const recapsWithText = sessions.filter((s) => s.recapMd && s.recapMd.trim().length > 0);
  const recapCount = recapsWithText.length;
  const recapWordCounts = recapsWithText.map((s) => s.recapMd!.trim().split(/\s+/).length);
  const avgRecapWordCount = recapCount > 0
    ? Math.round(recapWordCounts.reduce((sum, n) => sum + n, 0) / recapCount)
    : 0;
  const recapLengthBreakdown = {
    short: recapWordCounts.filter((n) => n < 100).length,
    medium: recapWordCounts.filter((n) => n >= 100 && n < 300).length,
    long: recapWordCounts.filter((n) => n >= 300).length,
  };

  const [latestRecap] = await db
    .select()
    .from(sessionLogsTable)
    .where(and(eq(sessionLogsTable.campaignId, campaignId), isNotNull(sessionLogsTable.recapMd)))
    .orderBy(desc(sessionLogsTable.sessionNumber))
    .limit(1);

  const safeRecap = latestRecap ? {
    id: latestRecap.id,
    campaignId: latestRecap.campaignId,
    sessionNumber: latestRecap.sessionNumber,
    title: latestRecap.title,
    playedAt: latestRecap.playedAt,
    recapMd: latestRecap.recapMd,
    generatedAt: latestRecap.generatedAt,
    createdAt: latestRecap.createdAt,
    updatedAt: latestRecap.updatedAt,
  } : null;

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
      const m = members.find((mem) => mem.userId === r.userId);
      return {
        ...r,
        displayName: m?.displayName ?? "Unknown",
        avatarUrl: m?.avatarUrl ?? null,
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

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const now2 = new Date();
  const currentUtcYear = now2.getUTCFullYear();
  const currentUtcMonth = now2.getUTCMonth();

  const trendBuckets: { key: string; month: string; count: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    let y = currentUtcYear;
    let m = currentUtcMonth - i;
    if (m < 0) { m += 12; y -= 1; }
    trendBuckets.push({ key: `${y}-${String(m).padStart(2, "0")}`, month: `${monthNames[m]} ${y}`, count: 0 });
  }

  for (const s of sessions) {
    const dateVal = s.playedAt ?? s.createdAt;
    if (!dateVal) continue;
    const d = new Date(dateVal);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth()).padStart(2, "0")}`;
    const entry = trendBuckets.find((t) => t.key === key);
    if (entry) entry.count++;
  }

  const sessionTrend = trendBuckets.map(({ month, count }) => ({ month, count }));

  const { inviteCode: _code, ...safeCampaign } = campaign;

  const response: Record<string, unknown> = {
    campaign: safeCampaign,
    nextEvent: nextEventWithRsvps,
    latestRecap: safeRecap,
    partyMembers,
    totalSessions: sessions.length,
    recapCount,
    avgRecapWordCount,
    recapLengthBreakdown,
    recentRolls,
    sessionTrend,
  };

  if (member.role === "dm") {
    response.inviteCode = campaign.inviteCode;
  }

  res.json(response);
});

export default router;
