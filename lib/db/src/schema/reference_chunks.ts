import {
  pgTable,
  text,
  serial,
  timestamp,
  uniqueIndex,
  index,
  customType,
} from "drizzle-orm/pg-core";
import { halfvec } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export type SrdEdition = "2014" | "2024";

export const REFERENCE_ENTITY_KINDS = [
  "spell",
  "monster",
  "class",
  "subclass",
  "feat",
  "item",
  "rule",
  "background",
  "race",
  "subrace",
  "condition",
  "magicitem",
  "other",
] as const;
export type ReferenceEntityKind = (typeof REFERENCE_ENTITY_KINDS)[number];

const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return "tsvector";
  },
});

export const referenceChunksTable = pgTable(
  "reference_chunks",
  {
    id: serial("id").primaryKey(),
    edition: text("edition").notNull().$type<SrdEdition>(),
    entitySlug: text("entity_slug").notNull(),
    entityKind: text("entity_kind").notNull().$type<ReferenceEntityKind>(),
    section: text("section"),
    title: text("title").notNull(),
    bodyMd: text("body_md").notNull(),
    sourceUrl: text("source_url"),
    contentHash: text("content_hash").notNull(),
    embedding: halfvec("embedding", { dimensions: 1536 }),
    // Generated tsvector column populated via raw SQL in the setup script
    // (Drizzle does not natively support generated columns yet).
    tsv: tsvector("tsv"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    uniqByEditionSlugKindHash: uniqueIndex(
      "reference_chunks_edition_slug_kind_hash_unique",
    ).on(table.edition, table.entitySlug, table.entityKind, table.contentHash),
    byEditionKindSlug: index("reference_chunks_edition_kind_slug_idx").on(
      table.edition,
      table.entityKind,
      table.entitySlug,
    ),
  }),
);

export type ReferenceChunk = typeof referenceChunksTable.$inferSelect;
export type InsertReferenceChunk = typeof referenceChunksTable.$inferInsert;

// Raw SQL fragments executed by `scripts/src/srd/setup.ts` to set up parts of
// the schema that Drizzle does not natively support (the vector extension,
// the generated tsvector column, the GIN index on tsv, and the partial HNSW
// indexes per edition).
export const referenceChunksRawSetupSql = sql`
  CREATE EXTENSION IF NOT EXISTS vector;

  ALTER TABLE reference_chunks
    DROP COLUMN IF EXISTS tsv;
  ALTER TABLE reference_chunks
    ADD COLUMN tsv tsvector
      GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(body_md, '')), 'B')
      ) STORED;

  CREATE INDEX IF NOT EXISTS reference_chunks_tsv_gin_idx
    ON reference_chunks USING gin (tsv);

  ALTER TABLE reference_chunks
    DROP CONSTRAINT IF EXISTS reference_chunks_edition_check;
  ALTER TABLE reference_chunks
    ADD CONSTRAINT reference_chunks_edition_check
      CHECK (edition IN ('2014', '2024'));

  CREATE INDEX IF NOT EXISTS reference_chunks_embedding_2014_hnsw_idx
    ON reference_chunks USING hnsw (embedding halfvec_cosine_ops)
    WHERE edition = '2014';

  CREATE INDEX IF NOT EXISTS reference_chunks_embedding_2024_hnsw_idx
    ON reference_chunks USING hnsw (embedding halfvec_cosine_ops)
    WHERE edition = '2024';

  ALTER TABLE campaigns
    DROP CONSTRAINT IF EXISTS campaigns_default_edition_check;
  ALTER TABLE campaigns
    ADD CONSTRAINT campaigns_default_edition_check
      CHECK (default_edition IN ('2014', '2024'));
`;
