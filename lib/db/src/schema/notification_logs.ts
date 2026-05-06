import { pgTable, text, serial, timestamp, integer, index } from "drizzle-orm/pg-core";
import { sessionLogsTable } from "./session_logs";
import { calendarEventsTable } from "./calendar_events";
import { campaignsTable } from "./campaigns";

export const notificationLogsTable = pgTable("notification_logs", {
  id: serial("id").primaryKey(),
  sessionLogId: integer("session_log_id").references(() => sessionLogsTable.id),
  calendarEventId: integer("calendar_event_id").references(() => calendarEventsTable.id),
  campaignId: integer("campaign_id").notNull().references(() => campaignsTable.id),
  userId: text("user_id").notNull(),
  recipientName: text("recipient_name").notNull(),
  email: text("email"),
  channel: text("channel").notNull().default("email"),
  kind: text("kind").notNull().default("recap"),
  status: text("status").notNull(),
  reason: text("reason"),
  errorMessage: text("error_message"),
  providerMessageId: text("provider_message_id"),
  attemptCount: integer("attempt_count").notNull().default(1),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_notification_logs_session").on(table.sessionLogId),
  index("idx_notification_logs_campaign").on(table.campaignId),
  index("idx_notification_logs_event").on(table.calendarEventId),
]);

export type NotificationLog = typeof notificationLogsTable.$inferSelect;
export type InsertNotificationLog = typeof notificationLogsTable.$inferInsert;
