import { pgTable, text, serial, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { sessionLogsTable } from "./session_logs";

export const recapViewsTable = pgTable("recap_views", {
  id: serial("id").primaryKey(),
  sessionLogId: integer("session_log_id").notNull().references(() => sessionLogsTable.id),
  userId: text("user_id").notNull(),
  viewedAt: timestamp("viewed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("uq_recap_view").on(table.sessionLogId, table.userId),
]);

export type RecapView = typeof recapViewsTable.$inferSelect;
