import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { brands } from "./brands";
import { organizations } from "./organizations";

export const brandEntityScores = pgTable(
  "brand_entity_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .references(() => brands.id)
      .notNull(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id),
    marketCode: text("market_code").default("AU_EN"),
    abnVerified: boolean("abn_verified").default(false).notNull(),
    abnNumber: text("abn_number"),
    abnEntityName: text("abn_entity_name"),
    abnStatus: text("abn_status"),
    localRegVerified: boolean("local_reg_verified"),
    localRegNumber: text("local_reg_number"),
    wikipediaAuPresent: boolean("wikipedia_au_present").default(false).notNull(),
    wikipediaAuUrl: text("wikipedia_au_url"),
    wikipediaAuMentions: integer("wikipedia_au_mentions").default(0).notNull(),
    wikipediaLocalPresent: boolean("wikipedia_local_present"),
    wikipediaLocalUrl: text("wikipedia_local_url"),
    auTldDomains: jsonb("au_tld_domains").default("[]").notNull(),
    auTldPresent: boolean("au_tld_present"),
    auDirectoryPresence: jsonb("au_directory_presence").default("[]").notNull(),
    hipagesPresent: boolean("hipages_present"),
    hipagesRating: numeric("hipages_rating", { precision: 3, scale: 1 }),
    yellowPagesPresent: boolean("yellow_pages_present"),
    serviceSeekingPresent: boolean("service_seeking_present"),
    wordOfMouthPresent: boolean("word_of_mouth_present"),
    wordOfMouthRating: numeric("word_of_mouth_rating", { precision: 3, scale: 1 }),
    localDirectoryCount: integer("local_directory_count"),
    localDirectoryDetails: jsonb("local_directory_details"),
    knowledgePanelPresent: boolean("knowledge_panel_present"),
    knowledgePanelAccurate: boolean("knowledge_panel_accurate"),
    knowledgePanelUrl: text("knowledge_panel_url"),
    wikidataEntryPresent: boolean("wikidata_entry_present"),
    wikidataEntryUrl: text("wikidata_entry_url"),
    scoreOf10: numeric("score_of_10", { precision: 5, scale: 2 }),
    checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    brandMarketCheckedUniq: uniqueIndex("brand_entity_brand_market_checked_uniq").on(t.brandId, t.marketCode, t.checkedAt),
  }),
);
