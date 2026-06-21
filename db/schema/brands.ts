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
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  classification: jsonb("classification").$type<BrandClassification | null>().default(null),
  classificationStatus: text("classification_status", {
    enum: ["pending", "processing", "complete", "failed"],
  })
    .default("pending")
    .notNull(),
  classificationAt: timestamp("classification_at", { withTimezone: true }),
  promptPack: jsonb("prompt_pack").$type<string[] | null>().default(null),
  promptPackVersion: integer("prompt_pack_version").default(1),
});
