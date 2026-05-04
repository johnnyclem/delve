import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { calendarEventsTable } from "./calendar_events";

export const rsvpsTable = pgTable("rsvps", {
  id: serial("id").primaryKey(),
  calendarEventId: integer("calendar_event_id").notNull().references(() => calendarEventsTable.id),
  userId: text("user_id").notNull(),
  status: text("status").notNull().default("maybe"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertRsvpSchema = createInsertSchema(rsvpsTable).omit({ id: true, createdAt: true });
export type InsertRsvp = z.infer<typeof insertRsvpSchema>;
export type Rsvp = typeof rsvpsTable.$inferSelect;
