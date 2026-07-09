import { boolean, index, integer, jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { brands } from "./brands";
import { organizations } from "./organizations";

export const agentReadinessScores = pgTable("agent_readiness_scores", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id").references(() => brands.id).notNull(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  // Dimension 1: Technical Accessibility /20
  techLlmstxtPresent: boolean("tech_llmstxt_present"),
  techLlmstxtValid: boolean("tech_llmstxt_valid"),
  techRobotsAllowsCrawlers: boolean("tech_robots_allows_crawlers"),
  techSsrPasses: boolean("tech_ssr_passes"),
  techAiDiscoveryEndpoints: boolean("tech_ai_discovery_endpoints"),
  techPageLoadFast: boolean("tech_page_load_fast"),
  techMcpEndpointPresent: boolean("tech_mcp_endpoint_present"),
  techMcpEndpointValid: boolean("tech_mcp_endpoint_valid"),
  techMcpToolsCount: integer("tech_mcp_tools_count"),
  techScore: integer("tech_score"),
  // Dimension 2: Entity Clarity /20
  entityOrgSchemaPresent: boolean("entity_org_schema_present"),
  entityLocalBusinessSchema: boolean("entity_local_business_schema"),
  entityLocalRegInSchema: boolean("entity_local_reg_in_schema"),
  entityNameConsistent: boolean("entity_name_consistent"),
  entityServiceReadable: boolean("entity_service_readable"),
  entityClarityScore: integer("entity_clarity_score"),
  // Dimension 3: Claim Verifiability /20
  verifyAbnConfirmed: boolean("verify_abn_confirmed"),
  verifyWikipediaAu: boolean("verify_wikipedia_au"),
  verifyAuDirectories: integer("verify_au_directories"),
  verifyReviewCitations: integer("verify_review_citations"),
  verifyExpertQuotes: boolean("verify_expert_quotes"),
  verifyScore: integer("verify_score"),
  // Dimension 4: Category Authority /20
  authorityTopicalCoverage: integer("authority_topical_coverage"),
  authorityPromptAppearance: integer("authority_prompt_appearance"),
  authorityCitationDiversity: integer("authority_citation_diversity"),
  authorityScore: integer("authority_score"),
  // Dimension 5: Task-Fit Signals /20
  taskBookingAccessible: boolean("task_booking_accessible"),
  taskPricingVisible: boolean("task_pricing_visible"),
  taskServiceAreaDefined: boolean("task_service_area_defined"),
  taskFaqDirectAnswers: integer("task_faq_direct_answers"),
  taskScore: integer("task_score"),
  // Composite
  localAiTrustScore: integer("local_ai_trust_score"),
  totalScore: integer("total_score"),
  gaps: jsonb("gaps"),
  scoredAt: timestamp("scored_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  brandIdx: index("agent_readiness_brand_idx").on(t.brandId, t.scoredAt),
}));
