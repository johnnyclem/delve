import { pgTable, text, serial, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Campaign-level homebrew rules that override standard 5e mechanics.
// Currently supports overriding the proficiency-bonus-by-level table.
// Either field is optional; when both are absent the standard 5e formula
// is used.
export interface CampaignHomebrewRules {
  // When true, character level changes do not auto-recalculate the
  // proficiency bonus — DMs/players manage it manually.
  disableProficiencyAutoProgression?: boolean;
  // Custom proficiency bonus per level. Must be a 20-element array indexed
  // by `level - 1`. Each entry must be a positive integer.
  proficiencyBonusByLevel?: number[];
}

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
  // DM-managed overrides for standard 5e mechanics. See
  // `CampaignHomebrewRules` for the supported shape.
  homebrewRules: jsonb("homebrew_rules").$type<CampaignHomebrewRules>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertCampaignSchema = createInsertSchema(campaignsTable).omit({ id: true, createdAt: true });
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof campaignsTable.$inferSelect;
