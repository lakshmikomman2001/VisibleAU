// RLS ENABLED: tenant data — organization_id scoped.
import { boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { brands } from "./brands";
import { organizations } from "./organizations";

export const topicalCoverageGaps = pgTable(
  "topical_coverage_gaps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id").references(() => brands.id).notNull(),
    organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
    vertical: text("vertical").notNull(),
    topicCluster: text("topic_cluster").notNull(),
    topicLabel: text("topic_label").notNull(),
    brandHasContent: boolean("brand_has_content").notNull(),
    brandContentDepth: integer("brand_content_depth"),
    brandPassageCount: integer("brand_passage_count"),
    competitorCoverage: jsonb("competitor_coverage"),
    estimatedCitationImpact: numeric("estimated_citation_impact", { precision: 4, scale: 2 }),
    priorityRank: integer("priority_rank"),
    crossPromptImpact: integer("cross_prompt_impact"),
    analyzedAt: timestamp("analyzed_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueBrandVerticalTopic: unique().on(table.brandId, table.vertical, table.topicCluster),
    brandPriorityIdx: index("topic_gaps_brand_priority_idx").on(table.brandId, table.priorityRank),
    crossPromptIdx: index("topic_gaps_cross_prompt_idx").on(table.brandId, table.crossPromptImpact),
  }),
);
