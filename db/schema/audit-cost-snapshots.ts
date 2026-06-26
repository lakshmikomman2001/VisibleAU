// RLS ENABLED: tenant data — organization_id scoped.
import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { audits } from "./audits";
import { marketAiBudgetPolicies } from "./market-ai-budget-policies";
import { organizations } from "./organizations";

export const auditCostSnapshots = pgTable(
  "audit_cost_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    auditId: uuid("audit_id")
      .references(() => audits.id, { onDelete: "cascade" })
      .notNull(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    marketCode: text("market_code").notNull(),
    locale: text("locale").notNull(),
    estimatedCostCents: integer("estimated_cost_cents").notNull().default(0),
    actualCostCents: integer("actual_cost_cents").notNull().default(0),
    promptCount: integer("prompt_count").notNull().default(0),
    providerCallCount: integer("provider_call_count").notNull().default(0),
    budgetPolicyId: uuid("budget_policy_id").references(() => marketAiBudgetPolicies.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orgCreatedIdx: index("audit_cost_org_created_idx").on(
      table.organizationId,
      table.createdAt,
    ),
    auditIdIdx: index("audit_cost_audit_id_idx").on(table.auditId),
  }),
);
