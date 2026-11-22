import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { brands } from "./brands";
import { organizations } from "./organizations";

export const agencyBrandAssets = pgTable(
  "agency_brand_assets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    brandId: uuid("brand_id").references(() => brands.id),
    logoUrl: text("logo_url"),
    primaryColor: text("primary_color").default("#0066CC").notNull(),
    secondaryColor: text("secondary_color").default("#1A1A1A").notNull(),
    accentColor: text("accent_color").default("#FF6B35").notNull(),
    footerText: text("footer_text"),
    contactLine: text("contact_line"),
    agencyName: text("agency_name"),
    contactEmail: text("contact_email"),
    // S01 part 2 (migration 0154; LLD 7.5, P18): the names the agency sells its report tiers under, on the workspace
    // row only (brand_id IS NULL); null = the default names (lib/reports/tier-names.ts).
    reportTierNames: jsonb("report_tier_names"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqueOrgBrand: uniqueIndex("unique_org_brand_assets").on(t.organizationId, t.brandId),
  }),
);
