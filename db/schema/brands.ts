import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import type { BrandClassification } from "@/lib/types/brand";
import { regionEnum, verticalEnum } from "./enums";
import { organizations } from "./organizations";

export const brands = pgTable("brands", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .references(() => organizations.id)
    .notNull(),
  name: text("name").notNull(),
  domain: text("domain").notNull(),
  vertical: verticalEnum("vertical").notNull(),
  region: regionEnum("region").notNull(),
  competitors: text("competitors").array().default([]).notNull(),
  primaryRegions: text("primary_regions").array().default([]).notNull(),
  abn: text("abn"),
  clientTag: text("client_tag"),
  // Trust Intelligence: a user-confirmed YouTube channel URL/handle
  // always wins over the fuzzy name-match search and is resolved
  // directly (channels.list by id/handle) -- see
  // lib/trust/youtube-channel-lookup.ts and
  // db/migrations/0037_youtube_channel_confirmation.sql.
  youtubeChannelUrl: text("youtube_channel_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  classification: jsonb("classification").$type<BrandClassification | null>().default(null),
  classificationStatus: text("classification_status", {
    enum: ["pending", "processing", "complete", "failed", "needs_confirmation"],
  })
    .default("pending")
    .notNull(),
  classificationAt: timestamp("classification_at", { withTimezone: true }),
  // Vunnara Build 1, Part C.5: the actual error classifyAndStoreBrand
  // caught, for the brand page's "Classification failed" badge --
  // previously logged to console only and lost.
  classificationError: text("classification_error"),
  // Vunnara Build 1, Part C.4: the user's CONFIRMED category/audience
  // win over classification.category/classification.audience (the
  // LLM's guess) once set -- categoryConfirmedAt is null until the user
  // actually confirms, even if the classifier's own confidence was high
  // enough to need no confirmation prompt.
  categoryConfirmedAt: timestamp("category_confirmed_at", { withTimezone: true }),
  audience: text("audience", { enum: ["households", "businesses", "both"] }),
  categories: text("categories").array().default([]).notNull(),
  // Vunnara Build 1, Part D: location is required at the wizard, but
  // existing rows predate that -- all nullable, no backfill/guess (NO
  // MOCK DATA IN PRODUCTION). suburb/city/state/country are the
  // confirmed, structured location (never parsed out of
  // primaryRegions' "STATE:Suburb" strings at read time); locationMode
  // distinguishes a brand with no fixed address at all from one that
  // simply hasn't confirmed yet (null).
  suburb: text("suburb"),
  city: text("city"),
  state: text("state"),
  country: text("country"),
  locationMode: text("location_mode", { enum: ["fixed", "online_only"] }),
  locationConfirmedAt: timestamp("location_confirmed_at", { withTimezone: true }),
  promptPack: jsonb("prompt_pack").$type<string[] | null>().default(null),
  promptPackVersion: integer("prompt_pack_version").default(1),
  // Vunnara hotfix 2 (19 Oct, post-609e323), item 4: which generation
  // of the GENERATOR (lib/prompts/build-prompt-pack.ts) produced
  // prompt_pack -- distinct from promptPackVersion above, which counts
  // how many times THIS brand's pack has been regenerated, not which
  // generator code ran. See lib/prompts/generator-version.ts.
  promptPackGeneratorVersion: integer("prompt_pack_generator_version").default(1),
  brandToken: text("brand_token").unique(),
});
