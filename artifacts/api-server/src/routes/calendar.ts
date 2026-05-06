import { Router, type IRouter } from "express";
import { db, calendarEventsTable, rsvpsTable, campaignMembersTable, notificationLogsTable, campaignsTable } from "@workspace/db";
import { eq, and, inArray, desc } from "drizzle-orm";
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

export type EventDeliveryStatus = { hasFailures: boolean; failedCount: number };

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
  const latest = new Map<string, { eventId: number; status: string; attemptedAt: Date }>();
  for (const log of logs) {
    if (log.calendarEventId == null) continue;
    const key = `${log.calendarEventId}:${log.userId}`;
    const prev = latest.get(key);
    const at = new Date(log.attemptedAt);
    if (!prev || at.getTime() > prev.attemptedAt.getTime()) {
      latest.set(key, { eventId: log.calendarEventId, status: log.status, attemptedAt: at });
    }
  }

  for (const { eventId, status } of latest.values()) {
    const cur = result.get(eventId) ?? { hasFailures: false, failedCount: 0 };
    if (status === "failed") {
      cur.hasFailures = true;
      cur.failedCount += 1;
    }
    result.set(eventId, cur);
  }
  return result;
}

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
