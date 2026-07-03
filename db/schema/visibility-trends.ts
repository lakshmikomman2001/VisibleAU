// RLS ENABLED: tenant data — organization_id scoped.
import { integer, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { brands } from "./brands";
import { organizations } from "./organizations";

export const visibilityTrends = pgTable(
  "visibility_trends",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id").references(() => brands.id).notNull(),
    organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
    periodLabel: text("period_label").notNull(),
    periodType: text("period_type").notNull(),
    scoreCompositeAvg: numeric("score_composite_avg", { precision: 5, scale: 2 }),
    scoreFrequencyAvg: numeric("score_frequency_avg", { precision: 5, scale: 2 }),
    scoreSentimentAvg: numeric("score_sentiment_avg", { precision: 5, scale: 2 }),
    scoreAccuracyAvg: numeric("score_accuracy_avg", { precision: 5, scale: 2 }),
    scorePositionAvg: numeric("score_position_avg", { precision: 5, scale: 2 }),
    scoreContextAvg: numeric("score_context_avg", { precision: 5, scale: 2 }),
    auditCount: integer("audit_count").notNull(),
    sampleQuality: text("sample_quality").notNull(),
    mentionRate: numeric("mention_rate", { precision: 5, scale: 2 }),
    citationRate: numeric("citation_rate", { precision: 5, scale: 2 }),
    mentionSourceRatio: numeric("mention_source_ratio", { precision: 5, scale: 2 }),
    brandArchetype: text("brand_archetype"),
    marketCompetitionLabel: text("market_competition_label"),
    citationVolatilityScore: numeric("citation_volatility_score", { precision: 5, scale: 2 }),
    aiReferralSessions: integer("ai_referral_sessions"),
    aiLeadEstimate: numeric("ai_lead_estimate", { precision: 8, scale: 2 }),
    calculatedAt: timestamp("calculated_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueBrandPeriod: unique().on(table.brandId, table.periodLabel, table.periodType),
  }),
);
