import { pgTable, text, serial, timestamp, integer, jsonb, index } from "drizzle-orm/pg-core";
import { campaignsTable } from "./campaigns";

export type MapType = "dungeon" | "town" | "world";

export type MapTile = {
  index: number;
  type: string;
  revealed: boolean;
};

export type MapToken = {
  id: string;
  index: number;
  type: "player" | "monster" | "npc";
  emoji: string;
  color: string;
  label: string;
  name: string;
};

export const mapsTable = pgTable("maps", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => campaignsTable.id),
  name: text("name").notNull(),
  type: text("type").notNull().$type<MapType>(),
  rows: integer("rows").notNull(),
  cols: integer("cols").notNull(),
  tilesJson: jsonb("tiles_json").notNull().$type<MapTile[]>().default([]),
  tokensJson: jsonb("tokens_json").notNull().$type<MapToken[]>().default([]),
  createdByUserId: text("created_by_user_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (table) => ({
  byCampaign: index("idx_maps_campaign").on(table.campaignId),
}));

export type MapRow = typeof mapsTable.$inferSelect;
