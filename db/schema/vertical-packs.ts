import { relations } from "drizzle-orm";
import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { regionEnum, verticalEnum } from "./enums";
import { verticalPackPrompts } from "./vertical-pack-prompts";

export const verticalPacks = pgTable(
  "vertical_packs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vertical: verticalEnum("vertical").notNull(),
    region: regionEnum("region").notNull(),
    version: text("version").notNull(),
    name: text("name").notNull(),
    promptsCount: integer("prompts_count").notNull(),
    metadata: jsonb("metadata").default("{}").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).defaultNow().notNull(),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueVerticalRegion: uniqueIndex("vertical_packs_vertical_region_idx").on(
      table.vertical,
      table.region,
    ),
  }),
);

export const verticalPacksRelations = relations(verticalPacks, ({ many }) => ({
  prompts: many(verticalPackPrompts),
}));
