import { Router, type IRouter } from "express";
import { db, calendarEventsTable, rsvpsTable, campaignMembersTable, notificationLogsTable } from "@workspace/db";
import { eq, and, inArray, desc } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { requireAuth, requireCampaignMember, getUserId } from "../middlewares/requireAuth";
import { getOrCreateCampaign, isDm } from "../lib/campaign";
import { CreateEventBody, UpdateEventBody, UpsertRsvpBody } from "@workspace/api-zod";
import { sendEventInvitesForEvents } from "../lib/email";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const MAX_OCCURRENCES = 26;
const DAY_MS = 24 * 60 * 60 * 1000;

function generateOccurrenceDates(start: Date, freq: "weekly" | "biweekly" | "monthly", until: Date): Date[] {
  // For weekly/biweekly use fixed millisecond offsets from `start` so we don't accumulate
  // drift; this preserves the UTC instant exactly (local wall-clock may shift ±1h across DST,
  // an accepted trade-off without per-user timezone storage).
  // For monthly we step in calendar months and clamp to the last valid day of the target month
  // so e.g. Jan 31 → Feb 28/29 instead of overflowing into March.
  const dates: Date[] = [new Date(start.getTime())];
  for (let i = 1; dates.length < MAX_OCCURRENCES; i++) {
    let next: Date;
    if (freq === "weekly") {
      next = new Date(start.getTime() + i * 7 * DAY_MS);
    } else if (freq === "biweekly") {
      next = new Date(start.getTime() + i * 14 * DAY_MS);
    } else {
      const y = start.getUTCFullYear();
      const m = start.getUTCMonth() + i;
      const targetYear = y + Math.floor(m / 12);
      const targetMonth = ((m % 12) + 12) % 12;
      const desiredDay = start.getUTCDate();
      // Last day of target month
      const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
      const day = Math.min(desiredDay, lastDay);
      next = new Date(Date.UTC(
        targetYear,
        targetMonth,
        day,
        start.getUTCHours(),
        start.getUTCMinutes(),
        start.getUTCSeconds(),
        start.getUTCMilliseconds(),
      ));
    }
    if (next.getTime() > until.getTime()) break;
    dates.push(next);
  }
  return dates;
}

router.get("/calendar", requireAuth, requireCampaignMember, async (req, res): Promise<void> => {
  const campaignId = await getOrCreateCampaign();
  const events = await db
    .select()
    .from(calendarEventsTable)
    .where(eq(calendarEventsTable.campaignId, campaignId));
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
    const dates = generateOccurrenceDates(startDate, recurrence.freq, until);
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

  // Send invites in the background; cap at first 8 occurrences to avoid email blast for long series.
  const inviteIds = inserted.slice(0, 8).map((e) => e.id);
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
