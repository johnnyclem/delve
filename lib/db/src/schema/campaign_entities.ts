import {
  pgTable,
  pgEnum,
  text,
  serial,
  timestamp,
  integer,
  jsonb,
  boolean,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { campaignsTable } from "./campaigns";

export const ENTITY_KINDS = [
  "npc",
  "quest",
  "location",
  "story_beat",
  "mob_encounter",
  "plot_twist",
  "faction",
  "item_unique",
] as const;

export type EntityKind = (typeof ENTITY_KINDS)[number];

export const entityKindEnum = pgEnum("entity_kind", ENTITY_KINDS);

// Free-form per-kind data payload validated in the API layer via Zod.
export type CampaignEntityData = Record<string, unknown>;

export const campaignEntitiesTable = pgTable(
  "campaign_entities",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id")
      .notNull()
      .references(() => campaignsTable.id, { onDelete: "cascade" }),
    kind: entityKindEnum("kind").notNull(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    // Player-visible markdown description (only shown after `revealed`).
    publicMd: text("public_md"),
    // Always DM-only. Never returned to player requests.
    dmNotes: text("dm_notes"),
    secretMd: text("secret_md"),
    trueMotivation: text("true_motivation"),
    // Per-kind structured payload.
    data: jsonb("data").$type<CampaignEntityData>().notNull().default({}),
    revealed: boolean("revealed").notNull().default(false),
    revealedAt: timestamp("revealed_at", { withTimezone: true }),
    revealedBy: text("revealed_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("uq_campaign_entity_slug").on(table.campaignId, table.kind, table.slug),
    index("idx_campaign_entities_kind").on(table.campaignId, table.kind),
    index("idx_campaign_entities_revealed")
      .on(table.campaignId)
      .where(sql`${table.revealed} = true`),
  ],
);

export type CampaignEntity = typeof campaignEntitiesTable.$inferSelect;

export const ENTITY_AUDIT_ACTIONS = ["reveal", "unreveal", "edit_public", "edit_secret"] as const;
export type EntityAuditAction = (typeof ENTITY_AUDIT_ACTIONS)[number];

export const entityRevealAuditTable = pgTable(
  "entity_reveal_audit",
  {
    id: serial("id").primaryKey(),
    entityId: integer("entity_id")
      .notNull()
      .references(() => campaignEntitiesTable.id, { onDelete: "cascade" }),
    campaignId: integer("campaign_id").notNull(),
    action: text("action").notNull().$type<EntityAuditAction>(),
    actor: text("actor").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    diff: jsonb("diff").$type<Record<string, unknown> | null>(),
  },
  (table) => [index("idx_entity_audit_campaign").on(table.campaignId, sql`${table.at} DESC`)],
);

export type EntityRevealAudit = typeof entityRevealAuditTable.$inferSelect;
