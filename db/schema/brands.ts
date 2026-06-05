import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});
