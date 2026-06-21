import {
  boolean,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const webhookEndpoints = pgTable("webhook_endpoints", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .references(() => organizations.id)
    .notNull(),
  url: text("url").notNull(),
  channel: text("channel").notNull(),
  events: text("events").array().notNull(),
  signingSecret: text("signing_secret").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  lastDeliveryAt: timestamp("last_delivery_at", { withTimezone: true }),
  lastDeliveryStatus: text("last_delivery_status"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
