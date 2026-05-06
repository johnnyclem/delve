import { Router, type IRouter } from "express";
import { db, calendarEventsTable, rsvpsTable, campaignMembersTable, notificationLogsTable, campaignsTable } from "@workspace/db";
import { eq, and, inArray, desc, asc, gt } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { requireAuth, requireCampaignMember, getUserId } from "../middlewares/requireAuth";
import { getOrCreateCampaign, isDm } from "../lib/campaign";
import { CreateEventBody, UpdateEventBody, UpsertRsvpBody } from "@workspace/api-zod";
import { sendEventInvitesForEvents, sendEventInviteForOne } from "../lib/email";
import { logger } from "../lib/logger";
import { getZonedParts, zonedTimeToUtc } from "../lib/timezone";

const router: IRouter = Router();

const MAX_OCCURRENCES = 26;
const DAY_MS = 24 * 60 * 60 * 1000;
// Minimum gap between successful invite resends to the same recipient on the same event.
// Keeps a fast-clicking DM (or a flaky network hammering Retry) from blasting the same player.
export const INVITE_RESEND_COOLDOWN_MS = 30_000;

export function generateOccurrenceDates(
  start: Date,
  freq: "weekly" | "biweekly" | "monthly",
  until: Date,
  tz: string = "UTC",
): Date[] {
  // Recurrence is anchored on the local wall-clock time in `tz` so the session
  // always starts at e.g. "Tuesday 7pm" regardless of DST transitions. For UTC
  // (the default) this is equivalent to fixed-offset stepping. For monthly we
  // step in calendar months and clamp to the last valid day of the target
  // month so Jan 31 → Feb 28/29 instead of overflowing into March.
  const dates: Date[] = [new Date(start.getTime())];
  const startLocal = getZonedParts(start, tz);
  for (let i = 1; dates.length < MAX_OCCURRENCES; i++) {
    let next: Date;
    if (freq === "weekly" || freq === "biweekly") {
      const stepDays = freq === "weekly" ? 7 : 14;
      // Walk i*stepDays in the local calendar by treating local Y/M/D as a
      // naive UTC date, advancing in days, then re-zoning back to UTC.
      const naive = new Date(Date.UTC(
        startLocal.year,
        startLocal.month - 1,
        startLocal.day,
      ) + i * stepDays * DAY_MS);
      next = zonedTimeToUtc(
        naive.getUTCFullYear(),
        naive.getUTCMonth() + 1,
        naive.getUTCDate(),
        startLocal.hour,
        startLocal.minute,
        startLocal.second,
        tz,
      );
    } else {
      const m = startLocal.month - 1 + i;
      const targetYear = startLocal.year + Math.floor(m / 12);
      const targetMonth = ((m % 12) + 12) % 12;
      const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
      const day = Math.min(startLocal.day, lastDay);
      next = zonedTimeToUtc(
        targetYear,
        targetMonth + 1,
        day,
        startLocal.hour,
        startLocal.minute,
        startLocal.second,
        tz,
      );
    }
    if (next.getTime() > until.getTime()) break;
    dates.push(next);
  }
  return dates;
}

export type EventDeliveryStatus = {
  hasFailures: boolean;
  failedCount: number;
  // Highest attempt count seen across the failing recipients. Lets the UI
  // distinguish "failed once, retry pending" from "still failing after retries".
  maxAttempts: number;
};

/**
 * For each event id, compute whether the latest invite attempt per recipient
 * resulted in a `failed` status. Older attempts that have since been retried
 * successfully are not counted.
 */
export async function getDeliveryStatusForEvents(
  campaignId: number,
  eventIds: number[],
): Promise<Map<number, EventDeliveryStatus>> {
  const result = new Map<number, EventDeliveryStatus>();
  if (eventIds.length === 0) return result;

  const logs = await db
    .select({
      calendarEventId: notificationLogsTable.calendarEventId,
      userId: notificationLogsTable.userId,
      status: notificationLogsTable.status,
      attemptCount: notificationLogsTable.attemptCount,
      attemptedAt: notificationLogsTable.attemptedAt,
    })
    .from(notificationLogsTable)
    .where(
      and(
        eq(notificationLogsTable.campaignId, campaignId),
        eq(notificationLogsTable.kind, "event_invite"),
        inArray(notificationLogsTable.calendarEventId, eventIds),
      ),
    );

  // Group: pick latest log per (eventId, userId)
  const latest = new Map<string, { eventId: number; status: string; attemptCount: number; attemptedAt: Date }>();
  for (const log of logs) {
    if (log.calendarEventId == null) continue;
    const key = `${log.calendarEventId}:${log.userId}`;
    const prev = latest.get(key);
    const at = new Date(log.attemptedAt);
    if (!prev || at.getTime() > prev.attemptedAt.getTime()) {
      latest.set(key, {
        eventId: log.calendarEventId,
        status: log.status,
        attemptCount: log.attemptCount,
        attemptedAt: at,
      });
    }
  }

  for (const { eventId, status, attemptCount } of latest.values()) {
    const cur = result.get(eventId) ?? { hasFailures: false, failedCount: 0, maxAttempts: 0 };
    if (status === "failed") {
      cur.hasFailures = true;
      cur.failedCount += 1;
      if (attemptCount > cur.maxAttempts) cur.maxAttempts = attemptCount;
    }
    result.set(eventId, cur);
  }
  return result;
}

export interface ReanchorResult {
  seriesId: string;
  campaignId: number;
  timezone: string;
  deletedFutureCount: number;
  insertedFutureCount: number;
  preservedPastCount: number;
}

/**
 * Re-anchor an existing recurring series to the campaign's current timezone so
 * that its future occurrences stay on the original local wall-clock time across
 * DST boundaries. Past occurrences (and their RSVPs / notification logs) are
 * preserved untouched; only events whose `proposedAt` is strictly after `now`
 * are rewritten.
 */
export async function reanchorSeries(params: {
  campaignId: number;
  seriesId: string;
  timezone: string;
  now?: Date;
}): Promise<ReanchorResult> {
  const { campaignId, seriesId, timezone } = params;
  const now = params.now ?? new Date();

  const events = await db
    .select()
    .from(calendarEventsTable)
    .where(
      and(
        eq(calendarEventsTable.campaignId, campaignId),
        eq(calendarEventsTable.seriesId, seriesId),
      ),
    )
    .orderBy(asc(calendarEventsTable.proposedAt));

  if (events.length === 0) {
    return {
      seriesId,
      campaignId,
      timezone,
      deletedFutureCount: 0,
      insertedFutureCount: 0,
      preservedPastCount: 0,
    };
  }

  const anchor = events[0];
  const rule = anchor.recurrenceRule;
  if (!rule) {
    return {
      seriesId,
      campaignId,
      timezone,
      deletedFutureCount: 0,
      insertedFutureCount: 0,
      preservedPastCount: events.length,
    };
  }

  const until = new Date(rule.until);
  const regenerated = generateOccurrenceDates(anchor.proposedAt, rule.freq, until, timezone);

  const futureExisting = events.filter((e) => e.proposedAt.getTime() > now.getTime());
  const pastExisting = events.filter((e) => e.proposedAt.getTime() <= now.getTime());
  const futureExistingIds = futureExisting.map((e) => e.id);

  if (futureExistingIds.length > 0) {
    await db.delete(rsvpsTable).where(inArray(rsvpsTable.calendarEventId, futureExistingIds));
    await db
      .update(notificationLogsTable)
      .set({ calendarEventId: null })
      .where(inArray(notificationLogsTable.calendarEventId, futureExistingIds));
    await db.delete(calendarEventsTable).where(inArray(calendarEventsTable.id, futureExistingIds));
  }

  const ruleSerialized = { freq: rule.freq, until: until.toISOString() };
  const newFutureDates = regenerated.filter((d) => d.getTime() > now.getTime());

  let insertedCount = 0;
  if (newFutureDates.length > 0) {
    const inserted = await db
      .insert(calendarEventsTable)
      .values(
        newFutureDates.map((d) => ({
          campaignId,
          title: anchor.title,
          proposedAt: d,
          location: anchor.location ?? null,
          seriesId,
          recurrenceRule: ruleSerialized,
        })),
      )
      .returning({ id: calendarEventsTable.id });
    insertedCount = inserted.length;
  }

  return {
    seriesId,
    campaignId,
    timezone,
    deletedFutureCount: futureExistingIds.length,
    insertedFutureCount: insertedCount,
    preservedPastCount: pastExisting.length,
  };
}

/**
 * Re-anchor every recurring series in every campaign to the campaign's current
 * timezone. Used by the admin one-shot backfill route.
 */
export async function reanchorAllSeries(now: Date = new Date()): Promise<ReanchorResult[]> {
  const rows = await db
    .selectDistinct({
      seriesId: calendarEventsTable.seriesId,
      campaignId: calendarEventsTable.campaignId,
    })
    .from(calendarEventsTable)
    .where(gt(calendarEventsTable.proposedAt, now));

  const campaignIds = Array.from(new Set(rows.map((r) => r.campaignId)));
  const campaigns = campaignIds.length === 0
    ? []
    : await db
        .select({ id: campaignsTable.id, timezone: campaignsTable.timezone })
        .from(campaignsTable)
        .where(inArray(campaignsTable.id, campaignIds));
  const tzByCampaign = new Map(campaigns.map((c) => [c.id, c.timezone ?? "UTC"]));

  const results: ReanchorResult[] = [];
  for (const r of rows) {
    if (!r.seriesId) continue;
    const tz = tzByCampaign.get(r.campaignId) ?? "UTC";
    const result = await reanchorSeries({
      campaignId: r.campaignId,
      seriesId: r.seriesId,
      timezone: tz,
      now,
    });
    results.push(result);
  }
  return results;
}

router.post("/calendar/series/:seriesId/reanchor", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();

  if (!(await isDm(campaignId, userId))) {
    res.status(403).json({ error: "Only the DM can re-anchor a series" });
    return;
  }

  const raw = Array.isArray(req.params.seriesId) ? req.params.seriesId[0] : req.params.seriesId;
  const seriesId = typeof raw === "string" ? raw : "";
  if (!seriesId) {
    res.status(400).json({ error: "Invalid series ID" });
    return;
  }

  const [existing] = await db
    .select({ id: calendarEventsTable.id })
    .from(calendarEventsTable)
    .where(
      and(
        eq(calendarEventsTable.campaignId, campaignId),
        eq(calendarEventsTable.seriesId, seriesId),
      ),
    )
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "Series not found" });
    return;
  }

  const [campaignRow] = await db
    .select({ timezone: campaignsTable.timezone })
    .from(campaignsTable)
    .where(eq(campaignsTable.id, campaignId));
  const tz = campaignRow?.timezone ?? "UTC";

  const result = await reanchorSeries({ campaignId, seriesId, timezone: tz });
  res.json(result);
});

router.get("/calendar", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();
  const events = await db
    .select()
    .from(calendarEventsTable)
    .where(eq(calendarEventsTable.campaignId, campaignId));

  // Only DMs see invite delivery status, and only for upcoming events (past sessions
  // can't be acted on, so noise from old failures is unhelpful).
  if (await isDm(campaignId, userId)) {
    const now = Date.now();
    const upcomingIds = events
      .filter((e) => new Date(e.proposedAt).getTime() >= now)
      .map((e) => e.id);
    const statusMap = await getDeliveryStatusForEvents(campaignId, upcomingIds);
    const enriched = events.map((e) => {
      const ds = statusMap.get(e.id);
      return ds ? { ...e, deliveryStatus: ds } : e;
    });
    res.json(enriched);
    return;
  }

  res.json(events);
});

router.post("/calendar", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();

  if (!(await isDm(campaignId, userId))) {
    res.status(403).json({ error: "Only the DM can create events" });
    return;
  }

  const parsed = CreateEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const startDate = new Date(parsed.data.proposedAt);
  const recurrence = parsed.data.recurrence ?? null;

  let inserted: typeof calendarEventsTable.$inferSelect[];

  if (recurrence) {
    let until = new Date(recurrence.until);
    // If the client sent a date-only "until" (midnight), treat the whole day as in-range
    // so an occurrence later that day is included.
    if (
      until.getUTCHours() === 0 &&
      until.getUTCMinutes() === 0 &&
      until.getUTCSeconds() === 0 &&
      until.getUTCMilliseconds() === 0
    ) {
      until = new Date(until.getTime() + DAY_MS - 1);
    }
    if (until.getTime() <= startDate.getTime()) {
      res.status(400).json({ error: "Recurrence 'until' must be after the first session date" });
      return;
    }
    const seriesId = randomUUID();
    const [campaignRow] = await db
      .select({ timezone: campaignsTable.timezone })
      .from(campaignsTable)
      .where(eq(campaignsTable.id, campaignId));
    const tz = campaignRow?.timezone ?? "UTC";
    const dates = generateOccurrenceDates(startDate, recurrence.freq, until, tz);
    const ruleSerialized = { freq: recurrence.freq, until: until.toISOString() };
    inserted = await db
      .insert(calendarEventsTable)
      .values(dates.map((d) => ({
        campaignId,
        title: parsed.data.title,
        proposedAt: d,
        location: parsed.data.location ?? null,
        seriesId,
        recurrenceRule: ruleSerialized,
      })))
      .returning();
  } else {
    inserted = await db
      .insert(calendarEventsTable)
      .values({
        campaignId,
        title: parsed.data.title,
        proposedAt: startDate,
        location: parsed.data.location ?? null,
      })
      .returning();
  }

  const first = inserted[0];

  // Send invites for every newly-scheduled occurrence. Dispatch is sequential per-recipient
  // inside sendEventInvitesForEvents (await between sends) so Resend rate limits aren't hit
  // even for 26-occurrence series.
  const inviteIds = inserted.map((e) => e.id);
  void sendEventInvitesForEvents({ campaignId, eventIds: inviteIds }).catch((err) => {
    logger.error({ err }, "Background event invite send failed");
  });

  res.status(201).json(first);
});

router.get("/calendar/:id", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid event ID" });
    return;
  }

  const campaignId = await getOrCreateCampaign();
  const [event] = await db
    .select()
    .from(calendarEventsTable)
    .where(and(eq(calendarEventsTable.id, id), eq(calendarEventsTable.campaignId, campaignId)));

  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  const eventRsvps = await db.select().from(rsvpsTable).where(eq(rsvpsTable.calendarEventId, id));
  const members = await db.select().from(campaignMembersTable).where(eq(campaignMembersTable.campaignId, campaignId));

  const rsvpsWithMembers = eventRsvps.map((r) => {
    const member = members.find((m) => m.userId === r.userId);
    return {
      ...r,
      displayName: member?.displayName ?? "Unknown",
      avatarUrl: member?.avatarUrl ?? null,
    };
  });

  res.json({ ...event, rsvps: rsvpsWithMembers });
});

router.patch("/calendar/:id", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();

  if (!(await isDm(campaignId, userId))) {
    res.status(403).json({ error: "Only the DM can update events" });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid event ID" });
    return;
  }

  const parsed = UpdateEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updateData: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
  if (parsed.data.proposedAt !== undefined) updateData.proposedAt = new Date(parsed.data.proposedAt);
  if (parsed.data.status !== undefined) {
    updateData.status = parsed.data.status;
    if (parsed.data.status === "confirmed") updateData.confirmedAt = new Date();
  }
  if (parsed.data.location !== undefined) updateData.location = parsed.data.location;

  const [updated] = await db
    .update(calendarEventsTable)
    .set(updateData)
    .where(and(eq(calendarEventsTable.id, id), eq(calendarEventsTable.campaignId, campaignId)))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  res.json(updated);
});

router.delete("/calendar/:id", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();

  if (!(await isDm(campaignId, userId))) {
    res.status(403).json({ error: "Only the DM can delete events" });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid event ID" });
    return;
  }

  const seriesScope = req.query.series === "true" || req.query.series === "1";

  const [event] = await db
    .select()
    .from(calendarEventsTable)
    .where(and(eq(calendarEventsTable.id, id), eq(calendarEventsTable.campaignId, campaignId)));
  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  let targetIds: number[] = [event.id];
  if (seriesScope && event.seriesId) {
    const siblings = await db
      .select({ id: calendarEventsTable.id })
      .from(calendarEventsTable)
      .where(
        and(
          eq(calendarEventsTable.campaignId, campaignId),
          eq(calendarEventsTable.seriesId, event.seriesId),
        ),
      );
    targetIds = siblings.map((s) => s.id);
  }

  // Delete dependent rows first (no cascade defined on FKs).
  await db.delete(rsvpsTable).where(inArray(rsvpsTable.calendarEventId, targetIds));
  // Detach notification_logs (FK is nullable) so we keep historical email logs.
  await db
    .update(notificationLogsTable)
    .set({ calendarEventId: null })
    .where(inArray(notificationLogsTable.calendarEventId, targetIds));
  const deleted = await db
    .delete(calendarEventsTable)
    .where(inArray(calendarEventsTable.id, targetIds))
    .returning({ id: calendarEventsTable.id });

  res.json({ deleted: deleted.length });
});

router.get("/calendar/:id/notifications", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();

  if (!(await isDm(campaignId, userId))) {
    res.status(403).json({ error: "Only the DM can view delivery logs" });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid event ID" });
    return;
  }

  const logs = await db
    .select({
      id: notificationLogsTable.id,
      userId: notificationLogsTable.userId,
      recipientName: notificationLogsTable.recipientName,
      email: notificationLogsTable.email,
      status: notificationLogsTable.status,
      reason: notificationLogsTable.reason,
      errorMessage: notificationLogsTable.errorMessage,
      attemptCount: notificationLogsTable.attemptCount,
      attemptedAt: notificationLogsTable.attemptedAt,
    })
    .from(notificationLogsTable)
    .where(
      and(
        eq(notificationLogsTable.calendarEventId, id),
        eq(notificationLogsTable.campaignId, campaignId),
        eq(notificationLogsTable.kind, "event_invite"),
      ),
    )
    .orderBy(desc(notificationLogsTable.attemptedAt));

  res.json(logs);
});

router.post("/calendar/:id/notifications/:logId/resend", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();

  if (!(await isDm(campaignId, userId))) {
    res.status(403).json({ error: "Only the DM can resend invites" });
    return;
  }

  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const rawLogId = Array.isArray(req.params.logId) ? req.params.logId[0] : req.params.logId;
  const id = parseInt(rawId, 10);
  const logId = parseInt(rawLogId, 10);
  if (isNaN(id) || isNaN(logId)) {
    res.status(400).json({ error: "Invalid event or log ID" });
    return;
  }

  const [event] = await db
    .select()
    .from(calendarEventsTable)
    .where(and(eq(calendarEventsTable.id, id), eq(calendarEventsTable.campaignId, campaignId)));
  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  const [originalLog] = await db
    .select()
    .from(notificationLogsTable)
    .where(and(
      eq(notificationLogsTable.id, logId),
      eq(notificationLogsTable.calendarEventId, id),
      eq(notificationLogsTable.campaignId, campaignId),
      eq(notificationLogsTable.kind, "event_invite"),
    ));

  if (!originalLog) {
    res.status(404).json({ error: "Invite log not found" });
    return;
  }

  // Per-recipient cooldown so a click-happy DM can't blast the same player.
  // Only successful sends count toward the gap — failed/skipped attempts can be retried immediately.
  const [recentSent] = await db
    .select({ attemptedAt: notificationLogsTable.attemptedAt })
    .from(notificationLogsTable)
    .where(and(
      eq(notificationLogsTable.calendarEventId, id),
      eq(notificationLogsTable.campaignId, campaignId),
      eq(notificationLogsTable.userId, originalLog.userId),
      eq(notificationLogsTable.kind, "event_invite"),
      eq(notificationLogsTable.status, "sent"),
    ))
    .orderBy(desc(notificationLogsTable.attemptedAt))
    .limit(1);

  if (recentSent) {
    const elapsedMs = Date.now() - new Date(recentSent.attemptedAt).getTime();
    if (elapsedMs < INVITE_RESEND_COOLDOWN_MS) {
      const remainingMs = INVITE_RESEND_COOLDOWN_MS - elapsedMs;
      const retryAfterSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
      res
        .status(429)
        .set("Retry-After", String(retryAfterSeconds))
        .json({
          error: `Just sent an invite to ${originalLog.recipientName}. Please wait ${retryAfterSeconds}s before retrying.`,
          retryAfterSeconds,
          retryAt: new Date(Date.now() + remainingMs).toISOString(),
        });
      return;
    }
  }

  const newLog = await sendEventInviteForOne({
    campaignId,
    eventId: id,
    userId: originalLog.userId,
    displayName: originalLog.recipientName,
  });

  res.json({ success: true, log: newLog });
});

router.post("/calendar/:id/resend-invites", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const campaignId = await getOrCreateCampaign();

  if (!(await isDm(campaignId, userId))) {
    res.status(403).json({ error: "Only the DM can resend invites" });
    return;
  }

  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid event ID" });
    return;
  }

  const [event] = await db
    .select()
    .from(calendarEventsTable)
    .where(and(eq(calendarEventsTable.id, id), eq(calendarEventsTable.campaignId, campaignId)));
  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  // Mark the watermark before send so we can return only the freshly-created log rows.
  const startedAt = new Date();
  await sendEventInvitesForEvents({ campaignId, eventIds: [id] });

  const newLogs = await db
    .select({
      id: notificationLogsTable.id,
      userId: notificationLogsTable.userId,
      recipientName: notificationLogsTable.recipientName,
      email: notificationLogsTable.email,
      status: notificationLogsTable.status,
      reason: notificationLogsTable.reason,
      errorMessage: notificationLogsTable.errorMessage,
      attemptCount: notificationLogsTable.attemptCount,
      attemptedAt: notificationLogsTable.attemptedAt,
    })
    .from(notificationLogsTable)
    .where(
      and(
        eq(notificationLogsTable.calendarEventId, id),
        eq(notificationLogsTable.campaignId, campaignId),
        eq(notificationLogsTable.kind, "event_invite"),
      ),
    )
    .orderBy(desc(notificationLogsTable.attemptedAt));

  const fresh = newLogs.filter((l) => new Date(l.attemptedAt).getTime() >= startedAt.getTime());

  res.json({ success: true, resentCount: fresh.length, logs: fresh });
});

export async function upsertRsvp(params: {
  eventId: number;
  userId: string;
  status: "yes" | "no" | "maybe";
  note: string | null;
}): Promise<typeof rsvpsTable.$inferSelect> {
  const { eventId, userId, status, note } = params;
  const [existing] = await db
    .select()
    .from(rsvpsTable)
    .where(and(eq(rsvpsTable.calendarEventId, eventId), eq(rsvpsTable.userId, userId)));

  if (existing) {
    const [updated] = await db
      .update(rsvpsTable)
      .set({ status, note })
      .where(eq(rsvpsTable.id, existing.id))
      .returning();
    return updated;
  }
  const [created] = await db
    .insert(rsvpsTable)
    .values({ calendarEventId: eventId, userId, status, note })
    .returning();
  return created;
}

router.put("/calendar/:eventId/rsvp", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const raw = Array.isArray(req.params.eventId) ? req.params.eventId[0] : req.params.eventId;
  const eventId = parseInt(raw, 10);
  if (isNaN(eventId)) {
    res.status(400).json({ error: "Invalid event ID" });
    return;
  }

  const campaignId = await getOrCreateCampaign();
  const [event] = await db
    .select()
    .from(calendarEventsTable)
    .where(and(eq(calendarEventsTable.id, eventId), eq(calendarEventsTable.campaignId, campaignId)));

  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  const parsed = UpsertRsvpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const result = await upsertRsvp({
    eventId,
    userId,
    status: parsed.data.status,
    note: parsed.data.note ?? null,
  });
  res.json(result);
});

export default router;
