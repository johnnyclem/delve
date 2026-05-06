import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const campaignsTable = pgTable("campaigns", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  worldName: text("world_name"),
  dmUserId: text("dm_user_id").notNull(),
  inviteCode: text("invite_code").notNull().default("CHANGEME"),
  // IANA time-zone identifier (e.g. "America/New_York"). Used to keep
  // recurring-session wall-clock times stable across DST transitions and
  // to format invite emails in the campaign's local time.
  timezone: text("timezone").notNull().default("UTC"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCampaignSchema = createInsertSchema(campaignsTable).omit({ id: true, createdAt: true });
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof campaignsTable.$inferSelect;
