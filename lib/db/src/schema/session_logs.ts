import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { campaignsTable } from "./campaigns";

export type SessionAttendees = {
  characterIds: number[];
  npcs: Array<{ name: string; npcId?: number }>;
};

export const sessionLogsTable = pgTable("session_logs", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => campaignsTable.id),
  sessionNumber: integer("session_number").notNull(),
  title: text("title").notNull(),
  playedAt: timestamp("played_at", { withTimezone: true }),
  rawNotesMd: text("raw_notes_md"),
  recapMd: text("recap_md"),
  generatedAt: timestamp("generated_at", { withTimezone: true }),
  notifiedAt: timestamp("notified_at", { withTimezone: true }),
  attendees: jsonb("attendees").$type<SessionAttendees>(),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSessionLogSchema = createInsertSchema(sessionLogsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSessionLog = z.infer<typeof insertSessionLogSchema>;
export type SessionLog = typeof sessionLogsTable.$inferSelect;
