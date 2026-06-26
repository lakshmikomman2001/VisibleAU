// RLS DISABLED: global seed config table — no organization_id.
import { integer, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const samplingPolicies = pgTable(
  "sampling_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketCode: text("market_code").notNull(),
    segment: text("segment").notNull(),
    useCase: text("use_case").notNull(),
    minimumPromptCount: integer("minimum_prompt_count").notNull().default(10),
    recommendedPromptCount: integer("recommended_prompt_count").notNull().default(50),
    minimumRepeatedSamples: integer("minimum_repeated_samples").notNull().default(3),
    confidenceDisplayThreshold: numeric("confidence_display_threshold", {
      precision: 5,
      scale: 2,
    })
      .notNull()
      .default("0.60"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueMarketSegmentUseCase: uniqueIndex("sampling_policy_unique").on(
      table.marketCode,
      table.segment,
      table.useCase,
    ),
  }),
);
