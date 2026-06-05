import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { brands } from "./brands";
import { organizations } from "./organizations";

export const audits = pgTable(
  "audits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .references(() => brands.id)
      .notNull(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    auditNumber: integer("audit_number").notNull(),
    status: text("status").notNull().default("pending"),
    triggeredBy: text("triggered_by").notNull().default("manual"),
    engines: text("engines").array().default([]).notNull(),
    promptsCount: integer("prompts_count"),
    runsPerPrompt: integer("runs_per_prompt"),
    totalCalls: integer("total_calls"),
    scoreComposite: numeric("score_composite", { precision: 5, scale: 2 }),
    scoreFrequency: numeric("score_frequency", { precision: 5, scale: 2 }),
    scorePosition: numeric("score_position", { precision: 5, scale: 2 }),
    scoreSentiment: text("score_sentiment"),
    scoreSentimentNumeric: numeric("score_sentiment_numeric", { precision: 5, scale: 2 }),
    scoreContext: text("score_context"),
    scoreContextNumeric: numeric("score_context_numeric", { precision: 5, scale: 2 }),
    scoreAccuracy: numeric("score_accuracy", { precision: 5, scale: 2 }),
    scoreConfidenceLow: numeric("score_confidence_low", { precision: 5, scale: 2 }),
    scoreConfidenceHigh: numeric("score_confidence_high", { precision: 5, scale: 2 }),
    confidenceIntervals: jsonb("confidence_intervals").default(sql`'{}'::jsonb`).notNull(),
    engineCount: integer("engine_count"),
    totalCostUsd: numeric("total_cost_usd", { precision: 10, scale: 4 }),
    metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueOrgAuditNumber: uniqueIndex("audits_org_audit_number_idx").on(
      table.organizationId,
      table.auditNumber,
    ),
    orgCompletedIdx: index("audits_org_completed_idx").on(table.organizationId, table.completedAt),
  }),
);
