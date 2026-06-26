// RLS DISABLED: global seed config table — no organization_id.
import { jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const promptPackCoverage = pgTable(
  "prompt_pack_coverage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketCode: text("market_code").notNull(),
    locale: text("locale").notNull(),
    segment: text("segment").notNull(),
    useCase: text("use_case").notNull(),
    requiredTemplateKeys: jsonb("required_template_keys").notNull(),
    availableTemplateKeys: jsonb("available_template_keys").notNull(),
    coverageRatio: numeric("coverage_ratio", { precision: 5, scale: 2 }).notNull(),
    coverageStatus: text("coverage_status").notNull(),
    lastValidatedAt: timestamp("last_validated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueMarketLocaleSegmentUseCase: uniqueIndex("prompt_pack_coverage_unique").on(
      table.marketCode,
      table.locale,
      table.segment,
      table.useCase,
    ),
  }),
);
