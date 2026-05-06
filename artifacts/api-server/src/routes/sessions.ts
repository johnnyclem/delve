import { Router, type IRouter } from "express";
import { db, sessionLogsTable, recapViewsTable, notificationLogsTable } from "@workspace/db";
import { eq, desc, and, isNotNull, inArray, sql } from "drizzle-orm";
import { requireAuth, requireCampaignMember, getUserId, getCampaignMember } from "../middlewares/requireAuth";
import { getOrCreateCampaign, isDm } from "../lib/campaign";
import { CreateSessionBody, UpdateSessionBody } from "@workspace/api-zod";
import { sendRecapNotifications, buildRecipientContext, sendRecapEmailToRecipient } from "../lib/email";

const router: IRouter = Router();

function stripDmFields(session: typeof sessionLogsTable.$inferSelect): Record<string, unknown> {
  const { rawNotesMd: _raw, ...safe } = session;
  return safe;
}

router.get("/sessions", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const campaignId = await getOrCreateCampaign();
  const member = getCampaignMember(req);
  const userId = getUserId(req);
  const sessions = await db
    .select()
    .from(sessionLogsTable)
    .where(eq(sessionLogsTable.campaignId, campaignId))
    .orderBy(desc(sessionLogsTable.sessionNumber));

  const withWordCount = sessions.map(s => ({
    ...s,
    recapWordCount: s.recapMd ? s.recapMd.trim().split(/\s+/).filter(Boolean).length : 0,
  }));

  if (member.role === "dm") {
    res.json(withWordCount);
  } else {
    const sessionIds = withWordCount.filter(s => s.recapMd).map(s => s.id);
    let viewedIds: Set<number> = new Set();
    if (sessionIds.length > 0) {
      const views = await db
        .select({ sessionLogId: recapViewsTable.sessionLogId })
        .from(recapViewsTable)
        .where(and(
          eq(recapViewsTable.userId, userId),
          inArray(recapViewsTable.sessionLogId, sessionIds)
        ));
      viewedIds = new Set(views.map(v => v.sessionLogId));
    }
    res.json(withWordCount.map(s => ({
      ...stripDmFields(s),
      recapWordCount: s.recapWordCount,
      hasNewRecap: !!(s.recapMd && !viewedIds.has(s.id)),
    })));
  }
});

router.post("/sessions", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();

  if (!(await isDm(campaignId, userId))) {
    res.status(403).json({ error: "Only the DM can create sessions" });
    return;
  }

  const parsed = CreateSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [session] = await db
    .insert(sessionLogsTable)
    .values({
      campaignId,
      sessionNumber: parsed.data.sessionNumber,
      title: parsed.data.title,
      playedAt: parsed.data.playedAt ? new Date(parsed.data.playedAt) : null,
      rawNotesMd: parsed.data.rawNotesMd ?? null,
    })
    .returning();

  res.status(201).json(session);
});

router.get("/sessions/latest-recap", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const campaignId = await getOrCreateCampaign();
  const [latest] = await db
    .select()
    .from(sessionLogsTable)
    .where(and(eq(sessionLogsTable.campaignId, campaignId), isNotNull(sessionLogsTable.recapMd)))
    .orderBy(desc(sessionLogsTable.sessionNumber))
    .limit(1);

  if (!latest) {
    res.status(404).json({ error: "No recaps found" });
    return;
  }

  res.json(stripDmFields(latest));
});

router.get("/sessions/:id", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid session ID" });
    return;
  }

  const campaignId = await getOrCreateCampaign();
  const member = getCampaignMember(req);
  const [session] = await db
    .select()
    .from(sessionLogsTable)
    .where(and(eq(sessionLogsTable.id, id), eq(sessionLogsTable.campaignId, campaignId)));

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  if (member.role === "dm") {
    res.json(session);
  } else {
    res.json(stripDmFields(session));
  }
});

router.patch("/sessions/:id", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();

  if (!(await isDm(campaignId, userId))) {
    res.status(403).json({ error: "Only the DM can update sessions" });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid session ID" });
    return;
  }

  const parsed = UpdateSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.sessionNumber !== undefined) updateData.sessionNumber = parsed.data.sessionNumber;
  if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
  if (parsed.data.playedAt !== undefined) updateData.playedAt = parsed.data.playedAt ? new Date(parsed.data.playedAt) : null;
  if (parsed.data.rawNotesMd !== undefined) updateData.rawNotesMd = parsed.data.rawNotesMd;
  if (parsed.data.recapMd !== undefined) updateData.recapMd = parsed.data.recapMd;

  const whereConditions = [eq(sessionLogsTable.id, id), eq(sessionLogsTable.campaignId, campaignId)];

  if (parsed.data.expectedVersion !== undefined) {
    whereConditions.push(eq(sessionLogsTable.version, parsed.data.expectedVersion));
  }
  updateData.version = sql`${sessionLogsTable.version} + 1`;

  const [updated] = await db
    .update(sessionLogsTable)
    .set(updateData)
    .where(and(...whereConditions))
    .returning();

  if (!updated) {
    if (parsed.data.expectedVersion !== undefined) {
      const [serverSession] = await db
        .select()
        .from(sessionLogsTable)
        .where(and(eq(sessionLogsTable.id, id), eq(sessionLogsTable.campaignId, campaignId)));
      if (serverSession) {
        res.status(409).json({
          error: "Session was modified by another client",
          serverSession,
        });
        return;
      }
    }
    res.status(404).json({ error: "Session not found" });
    return;
  }

  res.json(updated);
});

router.post("/sessions/:id/generate-recap", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();

  if (!(await isDm(campaignId, userId))) {
    res.status(403).json({ error: "Only the DM can generate recaps" });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid session ID" });
    return;
  }

  const [session] = await db
    .select()
    .from(sessionLogsTable)
    .where(and(eq(sessionLogsTable.id, id), eq(sessionLogsTable.campaignId, campaignId)));

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  if (!session.rawNotesMd) {
    res.status(400).json({ error: "No raw notes to generate recap from" });
    return;
  }

  let openai;
  try {
    openai = (await import("@workspace/integrations-openai-ai-server")).openai;
  } catch {
    res.status(503).json({ error: "AI service is not configured" });
    return;
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    max_completion_tokens: 8192,
    messages: [
      {
        role: "system",
        content: `You are the narrator of an epic D&D campaign. Given the DM's raw session notes, write a vivid, engaging narrative recap in markdown format. Use atmospheric prose, dramatic pacing, and occasional dialogue. Keep it to 3-6 paragraphs. Include a "## Key Events" section with bullet points at the end. Write in past tense, third person.`,
      },
      {
        role: "user",
        content: `Session ${session.sessionNumber}: "${session.title}"\n\nDM Notes:\n${session.rawNotesMd}`,
      },
    ],
  });

  const recap = completion.choices[0]?.message?.content ?? "";

  await db
    .update(sessionLogsTable)
    .set({ recapMd: recap, generatedAt: new Date(), notifiedAt: null })
    .where(and(eq(sessionLogsTable.id, id), eq(sessionLogsTable.campaignId, campaignId)));

  await db
    .delete(recapViewsTable)
    .where(eq(recapViewsTable.sessionLogId, id));

  res.json({ recap, model: "gpt-4o" });
});

router.post("/sessions/:id/notify-recap", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();

  if (!(await isDm(campaignId, userId))) {
    res.status(403).json({ error: "Only the DM can send recap notifications" });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid session ID" });
    return;
  }

  const [session] = await db
    .select()
    .from(sessionLogsTable)
    .where(and(eq(sessionLogsTable.id, id), eq(sessionLogsTable.campaignId, campaignId)));

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  if (!session.recapMd) {
    res.status(400).json({ error: "No recap available to notify about" });
    return;
  }

  await sendRecapNotifications({
    campaignId,
    sessionNumber: session.sessionNumber,
    sessionTitle: session.title,
    sessionId: id,
  });

  const notifiedAt = new Date();
  await db
    .update(sessionLogsTable)
    .set({ notifiedAt })
    .where(and(eq(sessionLogsTable.id, id), eq(sessionLogsTable.campaignId, campaignId)));

  res.json({ success: true, notifiedAt: notifiedAt.toISOString() });
});

router.get("/sessions/:id/notifications", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();

  if (!(await isDm(campaignId, userId))) {
    res.status(403).json({ error: "Only the DM can view notification logs" });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid session ID" });
    return;
  }

  const [session] = await db
    .select({ id: sessionLogsTable.id })
    .from(sessionLogsTable)
    .where(and(eq(sessionLogsTable.id, id), eq(sessionLogsTable.campaignId, campaignId)));

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  const logs = await db
    .select()
    .from(notificationLogsTable)
    .where(eq(notificationLogsTable.sessionLogId, id))
    .orderBy(desc(notificationLogsTable.attemptedAt));

  res.json(logs);
});

async function loadSessionForResend(campaignId: number, sessionId: number) {
  const [session] = await db
    .select()
    .from(sessionLogsTable)
    .where(and(eq(sessionLogsTable.id, sessionId), eq(sessionLogsTable.campaignId, campaignId)));
  return session;
}

router.post("/sessions/:id/notifications/:logId/resend", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();

  if (!(await isDm(campaignId, userId))) {
    res.status(403).json({ error: "Only the DM can resend notifications" });
    return;
  }

  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const rawLogId = Array.isArray(req.params.logId) ? req.params.logId[0] : req.params.logId;
  const id = parseInt(rawId, 10);
  const logId = parseInt(rawLogId, 10);
  if (isNaN(id) || isNaN(logId)) {
    res.status(400).json({ error: "Invalid session or log ID" });
    return;
  }

  const session = await loadSessionForResend(campaignId, id);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  if (!session.recapMd) {
    res.status(400).json({ error: "No recap available to notify about" });
    return;
  }

  const [originalLog] = await db
    .select()
    .from(notificationLogsTable)
    .where(and(
      eq(notificationLogsTable.id, logId),
      eq(notificationLogsTable.sessionLogId, id),
      eq(notificationLogsTable.campaignId, campaignId),
    ));

  if (!originalLog) {
    res.status(404).json({ error: "Notification log not found" });
    return;
  }

  if (originalLog.status !== "failed") {
    res.status(400).json({ error: "Only failed notifications can be resent" });
    return;
  }

  const ctx = await buildRecipientContext();
  const newLog = await sendRecapEmailToRecipient(ctx, {
    sessionLogId: id,
    campaignId,
    userId: originalLog.userId,
    displayName: originalLog.recipientName,
    sessionNumber: session.sessionNumber,
    sessionTitle: session.title,
  });

  res.json({ success: true, log: newLog });
});

router.post("/sessions/:id/notifications/resend-failed", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();

  if (!(await isDm(campaignId, userId))) {
    res.status(403).json({ error: "Only the DM can resend notifications" });
    return;
  }

  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid session ID" });
    return;
  }

  const session = await loadSessionForResend(campaignId, id);
  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  if (!session.recapMd) {
    res.status(400).json({ error: "No recap available to notify about" });
    return;
  }

  const allLogs = await db
    .select()
    .from(notificationLogsTable)
    .where(and(
      eq(notificationLogsTable.sessionLogId, id),
      eq(notificationLogsTable.campaignId, campaignId),
    ))
    .orderBy(desc(notificationLogsTable.attemptedAt));

  const seenUsers = new Set<string>();
  const latestPerUser: typeof allLogs = [];
  for (const log of allLogs) {
    if (seenUsers.has(log.userId)) continue;
    seenUsers.add(log.userId);
    latestPerUser.push(log);
  }
  const failedLogs = latestPerUser.filter((l) => l.status === "failed");

  if (failedLogs.length === 0) {
    res.json({ success: true, resentCount: 0, logs: [] });
    return;
  }

  const ctx = await buildRecipientContext();
  const newLogs = [];
  for (const failedLog of failedLogs) {
    const newLog = await sendRecapEmailToRecipient(ctx, {
      sessionLogId: id,
      campaignId,
      userId: failedLog.userId,
      displayName: failedLog.recipientName,
      sessionNumber: session.sessionNumber,
      sessionTitle: session.title,
    });
    if (newLog) newLogs.push(newLog);
  }

  res.json({ success: true, resentCount: newLogs.length, logs: newLogs });
});

router.post("/sessions/:id/mark-recap-viewed", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid session ID" });
    return;
  }

  const [session] = await db
    .select({ id: sessionLogsTable.id, recapMd: sessionLogsTable.recapMd })
    .from(sessionLogsTable)
    .where(and(eq(sessionLogsTable.id, id), eq(sessionLogsTable.campaignId, campaignId)));

  if (!session) {
    res.status(404).json({ error: "Session not found" });
    return;
  }

  if (!session.recapMd) {
    res.status(400).json({ error: "No recap to mark as viewed" });
    return;
  }

  await db
    .insert(recapViewsTable)
    .values({ sessionLogId: id, userId })
    .onConflictDoUpdate({
      target: [recapViewsTable.sessionLogId, recapViewsTable.userId],
      set: { viewedAt: new Date() },
    });

  res.json({ success: true });
});

export default router;
