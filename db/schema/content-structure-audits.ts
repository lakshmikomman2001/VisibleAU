import { boolean, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { brands } from "./brands";
import { organizations } from "./organizations";

export const contentStructureAudits = pgTable("content_structure_audits", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id").references(() => brands.id).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  pageUrl: text("page_url").notNull(),
  answerCapsuleScore: integer("answer_capsule_score"),
  faqBlockPresent: boolean("faq_block_present"),
  faqSchemaPresent: boolean("faq_schema_present"),
  headingStructure: jsonb("heading_structure"),
  capsuleGaps: jsonb("capsule_gaps"),
  wordCount: integer("word_count"),
  optimalPassageCount: integer("optimal_passage_count"),
  lastModified: text("last_modified"),
  daysSincePublished: integer("days_since_published"),
  freshnessRisk: text("freshness_risk"),
  contentFormatDetected: text("content_format_detected"),
  citationProbabilityScore: numeric("citation_probability_score", { precision: 4, scale: 3 }),
  isEntityHomeCandidate: boolean("is_entity_home_candidate"),
  entityHomeHasOrgSchema: boolean("entity_home_has_org_schema"),
  entityHomeHasIdField: boolean("entity_home_has_id_field"),
  entityHomeSameAsCount: integer("entity_home_same_as_count"),
  entityHomePageUrl: text("entity_home_page_url"),
  outboundCitationCount: integer("outbound_citation_count"),
  hasAuthorAttribution: boolean("has_author_attribution"),
  auditedAt: timestamp("audited_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  brandPageUnique: uniqueIndex("content_structure_brand_page_idx").on(t.brandId, t.pageUrl),
  brandIdx: index("content_structure_brand_idx").on(t.brandId),
}));
