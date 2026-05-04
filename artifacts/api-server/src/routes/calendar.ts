import { Router, type IRouter } from "express";
import { db, calendarEventsTable, rsvpsTable, campaignMembersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireCampaignMember, getUserId } from "../middlewares/requireAuth";
import { getOrCreateCampaign, isDm } from "../lib/campaign";
import { CreateEventBody, UpdateEventBody, UpsertRsvpBody } from "@workspace/api-zod";

const router: IRouter = Router();

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

  const [event] = await db
    .insert(calendarEventsTable)
    .values({
      campaignId,
      title: parsed.data.title,
      proposedAt: new Date(parsed.data.proposedAt),
      location: parsed.data.location ?? null,
    })
    .returning();

  res.status(201).json(event);
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

  const [existing] = await db
    .select()
    .from(rsvpsTable)
    .where(and(eq(rsvpsTable.calendarEventId, eventId), eq(rsvpsTable.userId, userId)));

  if (existing) {
    const [updated] = await db
      .update(rsvpsTable)
      .set({ status: parsed.data.status, note: parsed.data.note ?? null })
      .where(eq(rsvpsTable.id, existing.id))
      .returning();
    res.json(updated);
  } else {
    const [created] = await db
      .insert(rsvpsTable)
      .values({
        calendarEventId: eventId,
        userId,
        status: parsed.data.status,
        note: parsed.data.note ?? null,
      })
      .returning();
    res.json(created);
  }
});

export default router;
