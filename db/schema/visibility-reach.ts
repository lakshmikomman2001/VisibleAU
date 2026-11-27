import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { audits } from "./audits";
import { brands } from "./brands";
import { organizations } from "./organizations";
import { QUESTION_REACHES, type QuestionReach } from "./questions";
import { users } from "./users";

/**
 * S04 part 2 (migration 0157; LLD 7.2, 8.4): where a brand wants to be visible, and each audit's figures per reach.
 * FORCE RLS on app.current_org_id (0157's loop). The reach CHECKs are in the migration; `reach` is the questions'
 * own list ('local', 'state', 'country', 'global' -- "Worldwide" to the customer).
 */

/** A reach's place: local {suburb, city, state, postcode}; state {state}; country {country}; global {}. */
export interface ReachPlace {
  suburb?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
}

/** A brand's reaches, one row each at most. A brand with no row is Local only, from its own location. */
export const brandVisibilityScopes = pgTable(
  "brand_visibility_scopes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    brandId: uuid("brand_id")
      .references(() => brands.id, { onDelete: "cascade" })
      .notNull(),
    reach: text("reach", { enum: QUESTION_REACHES }).$type<QuestionReach>().notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    place: jsonb("place").$type<ReachPlace>().default(sql`'{}'::jsonb`).notNull(),
    targetCount: integer("target_count").default(0).notNull(),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    brandReach: unique("brand_visibility_scopes_brand_reach_key").on(table.brandId, table.reach),
    org: index("brand_visibility_scopes_org").on(table.organizationId),
  }),
);

/** An audit's Visibility in one reach: successful everyday answers, mentions, the 95% interval (fractions), its hash. */
export const auditReachResults = pgTable(
  "audit_reach_results",
  {
    auditId: uuid("audit_id")
      .references(() => audits.id, { onDelete: "cascade" })
      .notNull(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    reach: text("reach", { enum: QUESTION_REACHES }).$type<QuestionReach>().notNull(),
    everydayAnswers: integer("everyday_answers").notNull(),
    mentioned: integer("mentioned").notNull(),
    ciLow: numeric("ci_low", { precision: 5, scale: 4 }),
    ciHigh: numeric("ci_high", { precision: 5, scale: 4 }),
    reachHash: text("reach_hash").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.auditId, table.reach] }),
    org: index("audit_reach_results_org").on(table.organizationId),
  }),
);
