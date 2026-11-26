import { sql } from "drizzle-orm";
import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { regionEnum, tierEnum } from "./enums";

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  clerkOrgId: text("clerk_org_id").unique().notNull(),
  name: text("name").notNull(),
  slug: text("slug").unique(),
  region: regionEnum("region").notNull().default("au"),
  tier: tierEnum("tier").notNull().default("free"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionCancelledAt: timestamp("subscription_cancelled_at", { withTimezone: true }),
  onboardingComplete: boolean("onboarding_complete").default(false).notNull(),
  ga4MeasurementId: text("ga4_measurement_id"),
  ga4ApiSecret: text("ga4_api_secret"),
  metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
  // S03 part 1 (migration 0156; LLD 7.6): the workspace's question packs (S10 writes them from Stripe; 0 until then).
  questionPacks: integer("question_packs").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});
