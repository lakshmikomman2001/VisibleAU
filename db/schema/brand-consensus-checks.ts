import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { brands } from "./brands";
import { organizations } from "./organizations";

export const brandConsensusChecks = pgTable(
  "brand_consensus_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .references(() => brands.id)
      .notNull(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    marketCode: text("market_code").notNull().default("AU_EN"),
    sourceType: text("source_type").notNull(),
    sourceUrl: text("source_url"),
    nameMatch: boolean("name_match"),
    serviceMatch: boolean("service_match"),
    locationMatch: boolean("location_match"),
    pricePositioning: text("price_positioning"),
    differentiatorsMatch: boolean("differentiators_match"),
    consistencyScore: integer("consistency_score"),
    discrepancies: jsonb("discrepancies"),
    checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    brandSourceUnique: unique().on(t.brandId, t.sourceType),
    brandIdx: index("consensus_brand_idx").on(t.brandId, t.checkedAt),
  }),
);
