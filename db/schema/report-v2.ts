import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { actionItems } from "./action-items";
import { brands } from "./brands";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * S01 part 2 (migration 0154; LLD 7.5, 8.1.3, 8.1.7): what the report contents panel (P08) saves for a brand, and
 * the actions an agency writes for its client's report. FORCE RLS on app.current_org_id (0154's loop).
 */

export const REPORT_TIERS = ["basic", "standard", "enhanced"] as const;
export type ReportTier = (typeof REPORT_TIERS)[number];

/** Per brand: the panel's section toggles and the tier last chosen (null = the plan's highest tier). */
export const reportBrandPreferences = pgTable("report_brand_preferences", {
  brandId: uuid("brand_id")
    .primaryKey()
    .references(() => brands.id, { onDelete: "cascade" }),
  organizationId: uuid("organization_id")
    .references(() => organizations.id)
    .notNull(),
  includeGeneralAdvice: boolean("include_general_advice").default(true).notNull(),
  includeDoneSinceLast: boolean("include_done_since_last").default(true).notNull(),
  defaultTier: text("default_tier", { enum: REPORT_TIERS }),
  updatedBy: uuid("updated_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Per brand and Action Center item: included in the report or not, its position and the agency's note (<= 400). */
export const reportActionChoices = pgTable(
  "report_action_choices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    brandId: uuid("brand_id")
      .references(() => brands.id, { onDelete: "cascade" })
      .notNull(),
    actionItemId: uuid("action_item_id")
      .references(() => actionItems.id, { onDelete: "cascade" })
      .notNull(),
    included: boolean("included").default(true).notNull(),
    position: integer("position"),
    note: text("note"),
    updatedBy: uuid("updated_by").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    brandItemUniq: uniqueIndex("report_action_choices_brand_id_action_item_id_key").on(
      table.brandId,
      table.actionItemId,
    ),
    actionItemIdx: index("report_action_choices_action_item_idx").on(table.actionItemId),
  }),
);

/** Actions an agency writes for a brand's report: "Recommended by {agency}", never shown as measured. */
export const agencyActions = pgTable(
  "agency_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    brandId: uuid("brand_id")
      .references(() => brands.id, { onDelete: "cascade" })
      .notNull(),
    title: text("title").notNull(),
    detail: text("detail"),
    priority: text("priority", { enum: ["high", "medium", "low"] }).notNull(),
    status: text("status", { enum: ["open", "in_progress", "done"] })
      .default("open")
      .notNull(),
    position: integer("position"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => ({
    brandOpenIdx: index("agency_actions_brand_open_idx")
      .on(table.brandId)
      .where(sql`${table.archivedAt} IS NULL`),
  }),
);
