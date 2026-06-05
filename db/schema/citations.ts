import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { audits } from "./audits";

export const citations = pgTable("citations", {
  id: uuid("id").primaryKey().defaultRandom(),
  auditId: uuid("audit_id")
    .references(() => audits.id)
    .notNull(),
  engine: text("engine").notNull(),
  prompt: text("prompt").notNull(),
  runNumber: integer("run_number").default(1).notNull(),
  brandMentioned: boolean("brand_mentioned").notNull(),
  position: integer("position"),
  sentimentLabel: text("sentiment_label"),
  sentimentScore: numeric("sentiment_score", { precision: 5, scale: 4 }),
  contextLabel: text("context_label"),
  responseSnippet: text("response_snippet"),
  contextSnippets: jsonb("context_snippets").default("[]").notNull(),
  citedSources: jsonb("cited_sources").default("[]").notNull(),
  llmCostUsd: numeric("llm_cost_usd", { precision: 10, scale: 6 }),
  llmTokensUsed: integer("llm_tokens_used"),
  llmModel: text("llm_model"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
