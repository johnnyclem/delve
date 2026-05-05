import { pgTable, text, serial, timestamp, integer, uniqueIndex, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { campaignsTable } from "./campaigns";

export const campaignMembersTable = pgTable("campaign_members", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => campaignsTable.id),
  userId: text("user_id").notNull(),
  role: text("role").notNull().default("player"),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  emailNotifications: boolean("email_notifications").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("uq_campaign_member").on(table.campaignId, table.userId),
]);

export const insertCampaignMemberSchema = createInsertSchema(campaignMembersTable).omit({ id: true, createdAt: true });
export type InsertCampaignMember = z.infer<typeof insertCampaignMemberSchema>;
export type CampaignMember = typeof campaignMembersTable.$inferSelect;
