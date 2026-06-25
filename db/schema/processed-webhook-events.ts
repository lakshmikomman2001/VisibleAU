import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const processedWebhookEvents = pgTable("processed_webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  stripeEventId: text("stripe_event_id").unique().notNull(),
  type: text("type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).defaultNow().notNull(),
});
