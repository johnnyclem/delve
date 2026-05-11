import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

// One row per SRD monster slug (shared across the 2014 and 2024 editions).
// Image bytes live in object storage; this table stores only the
// normalized object path (`/objects/<id>`) plus provenance so we can
// re-generate when the prompt or model changes.
export const monsterImagesTable = pgTable("monster_images", {
  slug: text("slug").primaryKey(),
  objectPath: text("object_path").notNull(),
  prompt: text("prompt").notNull(),
  model: text("model").notNull(),
  generatedAt: timestamp("generated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type MonsterImage = typeof monsterImagesTable.$inferSelect;
export type InsertMonsterImage = typeof monsterImagesTable.$inferInsert;
