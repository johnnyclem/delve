import { Router, type IRouter, type Request, type Response, type NextFunction, type ErrorRequestHandler } from "express";
import multer from "multer";
import { toFile } from "openai";
import { db, sessionLogsTable, recapViewsTable, notificationLogsTable, charactersTable, npcsTable, type SessionAttendees } from "@workspace/db";
import { eq, desc, and, isNotNull, inArray, sql } from "drizzle-orm";
import { requireAuth, requireCampaignMember, getUserId, getCampaignMember } from "../middlewares/requireAuth";
import { getOrCreateCampaign, isDm } from "../lib/campaign";
import { CreateSessionBody, UpdateSessionBody } from "@workspace/api-zod";
import { sendRecapNotifications, buildRecipientContext, sendRecapEmailToRecipient } from "../lib/email";
import { logger } from "../lib/logger";
import { RECAP_MODEL } from "../lib/recap-prompt";
import { runRecapNow, scheduleRecap, shouldScheduleRecap } from "../lib/recap-runner";

const router: IRouter = Router();

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const ALLOWED_AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/x-m4a",
  "audio/m4a",
]);
const EXT_BY_TYPE: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
};

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_BYTES, files: 1 },
});

router.post(
  "/sessions/transcribe",
  requireAuth,
  requireCampaignMember,
  audioUpload.single("audio"),
  ((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const e = err as { code?: string; message?: string } | null;
    if (e && (e.code === "LIMIT_FILE_SIZE")) {
      res.status(413).json({ error: `Audio too large (max ${Math.round(MAX_AUDIO_BYTES / 1024 / 1024)}MB)` });
      return;
    }
    if (e && e.code && typeof e.code === "string" && e.code.startsWith("LIMIT_")) {
      res.status(400).json({ error: e.message ?? "Invalid upload" });
      return;
    }
    next(err);
  }) as ErrorRequestHandler,
  async (req: Request, res: Response): Promise<void> => {
    const userId = getUserId(req);
    const campaignId = await getOrCreateCampaign();

    if (!(await isDm(campaignId, userId))) {
      res.status(403).json({ error: "Only the DM can transcribe audio" });
      return;
    }

    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file || !file.buffer || file.buffer.length === 0) {
      res.status(400).json({ error: "No audio file received (expected multipart field 'audio')" });
      return;
    }

    const contentType = (file.mimetype ?? "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_AUDIO_TYPES.has(contentType)) {
      res.status(415).json({ error: `Unsupported audio type: ${contentType || "(missing)"}` });
      return;
    }

    let openai;
    try {
      openai = (await import("@workspace/integrations-openai-ai-server")).openai;
    } catch {
      res.status(503).json({ error: "AI service is not configured" });
      return;
    }

    const ext = EXT_BY_TYPE[contentType] ?? "webm";
    try {
      const oaFile = await toFile(file.buffer, `recording.${ext}`, { type: contentType });
      const result = await openai.audio.transcriptions.create({
        file: oaFile,
        model: "gpt-4o-transcribe",
        response_format: "json",
      });
      const text = (result as { text?: string }).text ?? "";
      res.json({ text });
    } catch (err) {
      logger.error({ err, bytes: file.buffer.length, contentType }, "Transcription failed");
      res.status(502).json({ error: "Transcription failed" });
    }
  },
);

function stripDmFields(session: typeof sessionLogsTable.$inferSelect): Record<string, unknown> {
  const { rawNotesMd: _raw, ...safe } = session;
  return safe;
}

/**
 * Validate every characterId and npcId in `attendees` belongs to the given
 * campaign. Returns null on success or an error message string on failure.
 * Quick-tag NPCs (no npcId) are accepted unconditionally — they're loose
 * names the DM typed at the table.
 */
async function validateAttendees(
  attendees: SessionAttendees,
  campaignId: number,
): Promise<string | null> {
  if (attendees.characterIds.length > 0) {
    const found = await db
      .select({ id: charactersTable.id })
      .from(charactersTable)
      .where(
        and(
          eq(charactersTable.campaignId, campaignId),
          inArray(charactersTable.id, attendees.characterIds),
        ),
      );
    const foundIds = new Set(found.map((c) => c.id));
    const missing = attendees.characterIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      return `Unknown character id(s): ${missing.join(", ")}`;
    }
  }
  const npcIds = attendees.npcs
    .map((n) => n.npcId)
    .filter((id): id is number => typeof id === "number");
  if (npcIds.length > 0) {
    const found = await db
      .select({ id: npcsTable.id })
      .from(npcsTable)
      .where(and(eq(npcsTable.campaignId, campaignId), inArray(npcsTable.id, npcIds)));
    const foundIds = new Set(found.map((n) => n.id));
    const missing = npcIds.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
      return `Unknown NPC id(s): ${missing.join(", ")}`;
    }
  }
  for (const npc of attendees.npcs) {
    if (typeof npc.name !== "string" || npc.name.trim() === "") {
      return "Every attending NPC must have a non-empty name";
    }
  }
  return null;
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

  const attendees = (parsed.data.attendees ?? null) as SessionAttendees | null;
  if (attendees) {
    const err = await validateAttendees(attendees, campaignId);
    if (err) {
      res.status(400).json({ error: err });
      return;
    }
  }

  const [session] = await db
    .insert(sessionLogsTable)
    .values({
      campaignId,
      sessionNumber: parsed.data.sessionNumber,
      title: parsed.data.title,
      playedAt: parsed.data.playedAt ? new Date(parsed.data.playedAt) : null,
      rawNotesMd: parsed.data.rawNotesMd ?? null,
      attendees,
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
  if (parsed.data.attendees !== undefined) {
    const attendees = parsed.data.attendees as SessionAttendees | null;
    if (attendees !== null) {
      const err = await validateAttendees(attendees, campaignId);
      if (err) {
        res.status(400).json({ error: err });
        return;
      }
    }
    updateData.attendees = attendees;
  }

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

  // Auto-schedule a debounced recap regeneration when the DM's notes have
  // meaningfully changed since the last recap. Empty notes never trigger.
  if (
    parsed.data.rawNotesMd !== undefined &&
    shouldScheduleRecap(updated.rawNotesMd, updated.recapNotesHash)
  ) {
    scheduleRecap(id, campaignId);
    // Reflect "pending" immediately in the response so the FE can render the
    // status without waiting for the next poll.
    const [stamped] = await db
      .update(sessionLogsTable)
      .set({ recapStatus: "pending", recapError: null })
      .where(and(eq(sessionLogsTable.id, id), eq(sessionLogsTable.campaignId, campaignId)))
      .returning();
    res.json(stamped ?? updated);
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

  try {
    const recap = await runRecapNow(id, campaignId);
    res.json({ recap, model: RECAP_MODEL });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate recap";
    if (message === "Session not found") {
      res.status(404).json({ error: message });
    } else if (message === "No raw notes to generate recap from") {
      res.status(400).json({ error: message });
    } else if (message === "AI service is not configured") {
      res.status(503).json({ error: message });
    } else {
      logger.error({ err, id, campaignId }, "Manual recap generation failed");
      res.status(502).json({ error: "Failed to generate recap" });
    }
  }
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
