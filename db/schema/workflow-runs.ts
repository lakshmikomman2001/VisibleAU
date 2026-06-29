// RLS ENABLED: tenant data — organization_id scoped.
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { brands } from "./brands";
import { organizations } from "./organizations";

export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    brandId: uuid("brand_id")
      .references(() => brands.id)
      .notNull(),
    workflowType: text("workflow_type").notNull(),
    // 'completed' with -ed — deliberately different from audits 'complete'
    status: text("status").notNull().default("scheduled"),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    resultSummary: jsonb("result_summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orgStatusIdx: index("workflow_runs_org_status_idx").on(table.organizationId, table.status),
    brandScheduledIdx: index("workflow_runs_brand_scheduled_idx").on(table.brandId, table.scheduledFor),
  }),
);
