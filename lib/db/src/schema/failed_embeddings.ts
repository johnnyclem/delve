import {
  pgTable,
  serial,
  integer,
  text,
  timestamp,
  index,
} from "drizzle-orm/pg-core";

export const failedEmbeddingsTable = pgTable(
  "failed_embeddings",
  {
    id: serial("id").primaryKey(),
    entityId: integer("entity_id").notNull(),
    campaignId: integer("campaign_id").notNull(),
    error: text("error").notNull(),
    retryCount: integer("retry_count").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_failed_embeddings_entity").on(table.entityId),
    index("idx_failed_embeddings_campaign").on(table.campaignId),
  ],
);

export type FailedEmbedding = typeof failedEmbeddingsTable.$inferSelect;
export type InsertFailedEmbedding = typeof failedEmbeddingsTable.$inferInsert;
