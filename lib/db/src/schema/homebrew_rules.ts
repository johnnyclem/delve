import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  boolean,
  index,
  customType,
} from "drizzle-orm/pg-core";
import { halfvec } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { campaignsTable } from "./campaigns";

const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return "tsvector";
  },
});

export const homebrewRulesTable = pgTable(
  "homebrew_rules",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id")
      .notNull()
      .references(() => campaignsTable.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    bodyMd: text("body_md").notNull(),
    embedding: halfvec("embedding", { dimensions: 1536 }),
    tsv: tsvector("tsv"),
    active: boolean("active").notNull().default(true),
    createdByUserId: text("created_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("idx_homebrew_rules_campaign_active").on(
      table.campaignId,
      table.active,
    ),
  ],
);

export type HomebrewRule = typeof homebrewRulesTable.$inferSelect;
export type InsertHomebrewRule = typeof homebrewRulesTable.$inferInsert;

export const homebrewRulesRawSetupSql = sql`
  ALTER TABLE homebrew_rules DROP COLUMN IF EXISTS tsv;
  ALTER TABLE homebrew_rules
    ADD COLUMN tsv tsvector
      GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(body_md, '')), 'B')
      ) STORED;

  CREATE INDEX IF NOT EXISTS homebrew_rules_tsv_gin_idx
    ON homebrew_rules USING gin (tsv);

  CREATE INDEX IF NOT EXISTS homebrew_rules_embedding_hnsw_idx
    ON homebrew_rules USING hnsw (embedding halfvec_cosine_ops);
`;
