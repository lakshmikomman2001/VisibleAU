import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const bulkOperations = pgTable("bulk_operations", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .references(() => organizations.id)
    .notNull(),
  operationType: text("operation_type").notNull(),
  status: text("status").default("pending").notNull(),
  totalBrands: integer("total_brands").default(0).notNull(),
  completedBrands: integer("completed_brands").default(0).notNull(),
  failedBrands: integer("failed_brands").default(0).notNull(),
  inputParams: jsonb("input_params").default("{}").notNull(),
  outputUrl: text("output_url"),
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
