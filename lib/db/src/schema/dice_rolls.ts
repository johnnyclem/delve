import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { campaignsTable } from "./campaigns";

export const diceRollsTable = pgTable("dice_rolls", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => campaignsTable.id),
  characterId: integer("character_id"),
  userId: text("user_id").notNull(),
  expression: text("expression").notNull(),
  result: integer("result").notNull(),
  breakdown: jsonb("breakdown").notNull().default({}),
  label: text("label"),
  displayName: text("display_name").notNull(),
  rolledAt: timestamp("rolled_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertDiceRollSchema = createInsertSchema(diceRollsTable).omit({ id: true, rolledAt: true });
export type InsertDiceRoll = z.infer<typeof insertDiceRollSchema>;
export type DiceRoll = typeof diceRollsTable.$inferSelect;
