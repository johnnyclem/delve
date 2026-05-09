import {
  pgTable,
  text,
  serial,
  timestamp,
  integer,
  uniqueIndex,
  index,
  customType,
} from "drizzle-orm/pg-core";
import { halfvec } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { campaignEntitiesTable } from "./campaign_entities";

export const ENTITY_CHUNK_SOURCE_FIELDS = ["public_md", "secret_md", "dm_notes"] as const;
export type EntityChunkSourceField = (typeof ENTITY_CHUNK_SOURCE_FIELDS)[number];

const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return "tsvector";
  },
});

export const campaignEntityChunksTable = pgTable(
  "campaign_entity_chunks",
  {
    id: serial("id").primaryKey(),
    entityId: integer("entity_id")
      .notNull()
      .references(() => campaignEntitiesTable.id, { onDelete: "cascade" }),
    campaignId: integer("campaign_id").notNull(),
    sourceField: text("source_field").notNull().$type<EntityChunkSourceField>(),
    bodyMd: text("body_md").notNull(),
    contentHash: text("content_hash").notNull(),
    embedding: halfvec("embedding", { dimensions: 1536 }),
    tsv: tsvector("tsv"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_campaign_entity_chunks_eid_field_hash").on(
      table.entityId,
      table.sourceField,
      table.contentHash,
    ),
    index("idx_campaign_entity_chunks_campaign_field").on(
      table.campaignId,
      table.sourceField,
    ),
    index("idx_campaign_entity_chunks_entity").on(table.entityId),
  ],
);

export type CampaignEntityChunk = typeof campaignEntityChunksTable.$inferSelect;
export type InsertCampaignEntityChunk = typeof campaignEntityChunksTable.$inferInsert;

// Raw SQL for parts Drizzle doesn't natively support: the generated tsvector
// column, the GIN index, and the HNSW index on embedding.
export const campaignEntityChunksRawSetupSql = sql`
  ALTER TABLE campaign_entity_chunks DROP COLUMN IF EXISTS tsv;
  ALTER TABLE campaign_entity_chunks
    ADD COLUMN tsv tsvector
      GENERATED ALWAYS AS (
        to_tsvector('english', coalesce(body_md, ''))
      ) STORED;

  CREATE INDEX IF NOT EXISTS campaign_entity_chunks_tsv_gin_idx
    ON campaign_entity_chunks USING gin (tsv);

  CREATE INDEX IF NOT EXISTS campaign_entity_chunks_embedding_hnsw_idx
    ON campaign_entity_chunks USING hnsw (embedding halfvec_cosine_ops);

  ALTER TABLE campaign_entity_chunks
    DROP CONSTRAINT IF EXISTS campaign_entity_chunks_source_field_check;
  ALTER TABLE campaign_entity_chunks
    ADD CONSTRAINT campaign_entity_chunks_source_field_check
      CHECK (source_field IN ('public_md', 'secret_md', 'dm_notes'));
`;
