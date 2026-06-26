// RLS DISABLED: global seed config table — no organization_id.
import { boolean, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const marketAiBudgetPolicies = pgTable(
  "market_ai_budget_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketCode: text("market_code").notNull(),
    segment: text("segment").notNull(),
    useCase: text("use_case").notNull(),
    maxPromptsPerAudit: integer("max_prompts_per_audit").notNull().default(50),
    maxModelsPerAudit: integer("max_models_per_audit").notNull().default(4),
    maxRepeatedSamples: integer("max_repeated_samples").notNull().default(5),
    maxEstimatedCostCents: integer("max_estimated_cost_cents").notNull().default(500),
    maxFanOutSubQueries: integer("max_fan_out_sub_queries").notNull().default(12),
    hardStopOnBudget: boolean("hard_stop_on_budget").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueMarketSegmentUseCase: uniqueIndex("budget_policy_unique").on(
      table.marketCode,
      table.segment,
      table.useCase,
    ),
  }),
);
