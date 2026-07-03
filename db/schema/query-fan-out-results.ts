// RLS ENABLED: tenant data — organization_id scoped.
import { boolean, index, integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { audits } from "./audits";
import { brands } from "./brands";
import { organizations } from "./organizations";
import { verticalPackPrompts } from "./vertical-pack-prompts";

export const queryFanOutResults = pgTable(
  "query_fan_out_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    auditId: uuid("audit_id").references(() => audits.id, { onDelete: "cascade" }),
    brandId: uuid("brand_id").references(() => brands.id).notNull(),
    organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
    originalPrompt: text("original_prompt").notNull(),
    originalPromptId: uuid("original_prompt_id").references(() => verticalPackPrompts.id, { onDelete: "set null" }),
    engine: text("engine").notNull(),
    subQuery: text("sub_query").notNull(),
    subQueryRank: integer("sub_query_rank").notNull(),
    brandAppeared: boolean("brand_appeared").notNull(),
    brandPosition: integer("brand_position"),
    contentSimilarityScore: numeric("content_similarity_score", { precision: 4, scale: 3 }),
    aboveThreshold: boolean("above_threshold"),
    runAt: timestamp("run_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    brandIdx: index("fan_out_brand_idx").on(table.brandId, table.runAt),
    auditIdx: index("fan_out_audit_idx").on(table.auditId),
    thresholdIdx: index("fan_out_threshold_idx").on(table.brandId, table.aboveThreshold),
  }),
);
