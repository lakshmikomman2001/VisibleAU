import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { brands } from "./brands";
import { organizations } from "./organizations";

export const linkedinPresenceAudits = pgTable(
  "linkedin_presence_audits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .references(() => brands.id)
      .notNull(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    marketCode: text("market_code").notNull().default("AU_EN"),
    companyPageUrl: text("company_page_url"),
    companyPageExists: boolean("company_page_exists"),
    companyPageFollowers: integer("company_page_followers"),
    companyPageLastPostDate: timestamp("company_page_last_post_date", { mode: "date" }),
    companyPosts30d: integer("company_posts_30d"),
    companyArticlesCount: integer("company_articles_count"),
    founderProfileUrl: text("founder_profile_url"),
    founderProfileExists: boolean("founder_profile_exists"),
    founderFollowers: integer("founder_followers"),
    founderPosts30d: integer("founder_posts_30d"),
    founderArticlesCount: integer("founder_articles_count"),
    founderArticles500plus: integer("founder_articles_500plus"),
    knowledgeSharingRatio: numeric("knowledge_sharing_ratio", { precision: 4, scale: 3 }),
    originalContentRatio: numeric("original_content_ratio", { precision: 4, scale: 3 }),
    semanticRelevanceScore: numeric("semantic_relevance_score", { precision: 4, scale: 3 }),
    presenceScore: integer("presence_score"),
    gaps: jsonb("gaps"),
    auditedAt: timestamp("audited_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    brandIdx: index("linkedin_brand_idx").on(t.brandId, t.auditedAt),
  }),
);
