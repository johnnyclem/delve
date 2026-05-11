import { pgTable, text, serial, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { campaignsTable } from "./campaigns";

export const npcsTable = pgTable("npcs", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => campaignsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  shortNote: text("short_note"),
  avatarUrl: text("avatar_url"),
  relationshipTags: text("relationship_tags").array().notNull().default([]),
  // --- archetype prefill fields (all nullable so the Custom path
  // and pre-existing rows keep working unchanged). ---
  archetypeKey: text("archetype_key"),
  occupation: text("occupation"),
  suggestedClass: text("suggested_class"),
  backstoryMd: text("backstory_md"),
  publicMotive: text("public_motive"),
  // DM-only. Server-side filtered out for non-DM responses.
  secretMotive: text("secret_motive"),
  createdByUserId: text("created_by_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertNpcSchema = createInsertSchema(npcsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertNpc = z.infer<typeof insertNpcSchema>;
export type Npc = typeof npcsTable.$inferSelect;

// Pre-generated dialogue lines attached to an NPC, grouped by topic.
// `dmOnly` lines are server-filtered for player responses.
export const npcDialogueLinesTable = pgTable(
  "npc_dialogue_lines",
  {
    id: serial("id").primaryKey(),
    npcId: integer("npc_id")
      .notNull()
      .references(() => npcsTable.id, { onDelete: "cascade" }),
    topic: text("topic").notNull(),
    line: text("line").notNull(),
    dmOnly: boolean("dm_only").notNull().default(false),
    orderIndex: integer("order_index").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("idx_npc_dialogue_lines_npc").on(table.npcId)],
);

export type NpcDialogueLine = typeof npcDialogueLinesTable.$inferSelect;
export type InsertNpcDialogueLine = typeof npcDialogueLinesTable.$inferInsert;
