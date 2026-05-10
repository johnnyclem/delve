import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { campaignsTable } from "./campaigns";
import { charactersTable } from "./characters";

export const chatThreadsTable = pgTable("chat_threads", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => campaignsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  title: text("title").notNull().default("New conversation"),
  summary: text("summary"),
  speakingAsCharacterId: integer("speaking_as_character_id").references(() => charactersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  index("idx_chat_threads_campaign_user").on(table.campaignId, table.userId),
]);

export const chatMessagesTable = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  threadId: integer("thread_id").notNull().references(() => chatThreadsTable.id, { onDelete: "cascade" }),
  role: text("role").notNull().$type<"user" | "assistant">(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_chat_messages_thread").on(table.threadId, table.createdAt),
]);

export type ChatThread = typeof chatThreadsTable.$inferSelect;
export type ChatMessage = typeof chatMessagesTable.$inferSelect;
