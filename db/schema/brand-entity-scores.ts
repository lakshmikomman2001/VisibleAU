import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { brands } from "./brands";

export const brandEntityScores = pgTable("brand_entity_scores", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .references(() => brands.id)
    .notNull(),
  abnVerified: boolean("abn_verified").default(false).notNull(),
  abnNumber: text("abn_number"),
  abnEntityName: text("abn_entity_name"),
  abnStatus: text("abn_status"),
  wikipediaAuPresent: boolean("wikipedia_au_present").default(false).notNull(),
  wikipediaAuUrl: text("wikipedia_au_url"),
  wikipediaAuMentions: integer("wikipedia_au_mentions").default(0).notNull(),
  auTldDomains: jsonb("au_tld_domains").default("[]").notNull(),
  auDirectoryPresence: jsonb("au_directory_presence").default("[]").notNull(),
  scoreOf10: numeric("score_of_10", { precision: 5, scale: 2 }),
  checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow().notNull(),
});
