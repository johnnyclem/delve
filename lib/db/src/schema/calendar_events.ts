import { pgTable, text, serial, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { campaignsTable } from "./campaigns";

export interface CalendarRecurrenceRule {
  freq: "weekly" | "biweekly" | "monthly";
  until: string;
}

export const calendarEventsTable = pgTable("calendar_events", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => campaignsTable.id),
  title: text("title").notNull(),
  proposedAt: timestamp("proposed_at", { withTimezone: true }).notNull(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  status: text("status").notNull().default("proposed"),
  location: text("location"),
  seriesId: text("series_id"),
  recurrenceRule: jsonb("recurrence_rule").$type<CalendarRecurrenceRule>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_calendar_events_series").on(table.seriesId),
]);

export const insertCalendarEventSchema = createInsertSchema(calendarEventsTable).omit({ id: true, createdAt: true });
export type InsertCalendarEvent = z.infer<typeof insertCalendarEventSchema>;
export type CalendarEvent = typeof calendarEventsTable.$inferSelect;
