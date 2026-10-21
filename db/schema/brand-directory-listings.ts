import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { brands } from "./brands";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * Vunnara (21 Oct, "directory listings... never scraping", Part C) --
 * the ONLY source of directory-presence truth this product writes:
 * the owner's own say-so. A row exists only once the owner has
 * actually picked Listed/Not listed/Not sure for that directory on
 * that brand -- there is no placeholder/unconfirmed row, matching the
 * brand page's own "nothing is pre-selected" requirement. One row per
 * (brand, directory) -- re-confirming the same directory UPDATEs this
 * row (confirmedAt/confirmedBy move forward), it never inserts a
 * second one.
 */
export const brandDirectoryListings = pgTable(
  "brand_directory_listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    brandId: uuid("brand_id")
      .references(() => brands.id)
      .notNull(),
    // Matches a key in lib/directories/registry.ts -- not a DB foreign
    // key (the registry is code, not a table; Build 2's market_packs
    // migration, if it absorbs the registry into a real table, can add
    // one then).
    directoryKey: text("directory_key").notNull(),
    status: text("status", { enum: ["listed", "not_listed", "unsure"] }).notNull(),
    profileUrl: text("profile_url"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }).notNull(),
    confirmedBy: uuid("confirmed_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    brandDirectoryUniq: uniqueIndex("brand_directory_listings_brand_directory_uniq").on(
      table.brandId,
      table.directoryKey,
    ),
    orgIdx: index("brand_directory_listings_org_idx").on(table.organizationId),
    brandIdx: index("brand_directory_listings_brand_idx").on(table.brandId),
  }),
);
