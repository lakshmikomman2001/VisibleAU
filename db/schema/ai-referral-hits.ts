import { date, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { brands } from "./brands";
import { organizations } from "./organizations";

export const aiReferralHits = pgTable("ai_referral_hits", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  brandId: uuid("brand_id").references(() => brands.id).notNull(),
  referrerDomain: text("referrer_domain").notNull(),
  aiPlatform: text("ai_platform").notNull(),
  landingPath: text("landing_path").notNull(),
  sessionCount: integer("session_count").notNull(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  source: text("source").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  dedupIdx: uniqueIndex("ai_referral_hits_dedup_idx").on(
    t.brandId, t.referrerDomain, t.landingPath, t.periodStart,
  ),
}));
