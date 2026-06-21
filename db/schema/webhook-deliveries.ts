import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";
import { webhookEndpoints } from "./webhook-endpoints";

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    endpointId: uuid("endpoint_id")
      .references(() => webhookEndpoints.id)
      .notNull(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    event: text("event").notNull(),
    payload: jsonb("payload").notNull(),
    attemptNumber: integer("attempt_number").default(1).notNull(),
    responseStatus: integer("response_status"),
    responseBody: text("response_body"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    endpointCreatedIdx: index("webhook_deliveries_endpoint_created_idx").on(
      table.endpointId,
      table.createdAt,
    ),
  }),
);
