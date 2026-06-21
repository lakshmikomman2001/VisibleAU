import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { brands } from "./brands";
import { organizations } from "./organizations";

export const localSeoResults = pgTable(
  "local_seo_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .references(() => brands.id)
      .notNull(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),

    gmbPresent: boolean("gmb_present").default(false).notNull(),
    gmbCompleteness: numeric("gmb_completeness", { precision: 5, scale: 2 }),
    gmbReviewCount: integer("gmb_review_count").default(0).notNull(),
    gmbAvgRating: numeric("gmb_avg_rating", { precision: 3, scale: 2 }),

    directoryPresence: jsonb("directory_presence").default("[]").notNull(),
    napConsistency: numeric("nap_consistency", { precision: 5, scale: 2 }),
    napFindings: jsonb("nap_findings").default("[]").notNull(),
    suburbCoverage: jsonb("suburb_coverage").default("[]").notNull(),
    scoreComposite: numeric("score_composite", { precision: 5, scale: 2 }),

    checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    brandCheckedIdx: index("local_seo_results_brand_checked_idx").on(
      table.brandId,
      table.checkedAt,
    ),
  }),
);
