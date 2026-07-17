import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const aiBotRegistry = pgTable("ai_bot_registry", {
  id: uuid("id").primaryKey().defaultRandom(),
  uaToken: text("ua_token").notNull().unique(),
  matchMode: text("match_mode").notNull().default("substring"),
  vendor: text("vendor").notNull(),
  crawlerTier: text("crawler_tier").notNull(),
  defaultPurpose: text("default_purpose"),
  isAgentUa: boolean("is_agent_ua").notNull().default(false),
  aiPlatform: text("ai_platform"),
  verificationPaths: jsonb("verification_paths").notNull(),
  cidrSourceUrl: text("cidr_source_url"),
  ptrDomainSuffix: text("ptr_domain_suffix"),
  expectedAsns: integer("expected_asns").array(),
  respectsRobots: boolean("respects_robots"),
  isActive: boolean("is_active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
