import { sql } from "drizzle-orm";
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
import { audits } from "./audits";
import { brands } from "./brands";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * Google AI surfaces, Phase 1 (migration 0145) -- Google AI Overviews and Google AI Mode, fetched through a
 * SERP provider, behind switches Sri controls. Every table here is new and additive: no existing table reads
 * them, so with the switches off nothing an audit writes or shows changes.
 *
 * - featureSettings / featureSettingChanges: global operator settings and their history (no workspace,
 *   no RLS). Read and written only by lib/governance/google-surfaces.ts.
 * - brandGoogleLocations: an operator-set postcode per brand (brands have no postcode).
 * - auditGoogleSurfaces: what one audit ran with, decided once at its start.
 * - googleSurfaceResults: one row per (audit, surface, question), never in citations.
 */

/** RLS DISABLED: global operator settings, one row per key; a missing row is the key's default. */
export const featureSettings = pgTable("feature_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedByUserId: uuid("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** RLS DISABLED: the operator's change history (global settings, workspace overrides, brand postcodes). */
export const featureSettingChanges = pgTable(
  "feature_setting_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: text("scope").$type<"global" | "workspace" | "brand">().notNull(),
    settingKey: text("setting_key").notNull(),
    targetWorkspaceId: uuid("target_workspace_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    targetBrandId: uuid("target_brand_id").references(() => brands.id, { onDelete: "set null" }),
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
    changedByUserId: uuid("changed_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("feature_setting_changes_created_idx").on(sql`${t.createdAt} DESC`)],
);

export const brandGoogleLocations = pgTable(
  "brand_google_locations",
  {
    brandId: uuid("brand_id")
      .primaryKey()
      .references(() => brands.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    postcode: text("postcode").notNull(),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("brand_google_locations_org_idx").on(t.organizationId)],
);

export const auditGoogleSurfaces = pgTable(
  "audit_google_surfaces",
  {
    auditId: uuid("audit_id")
      .primaryKey()
      .references(() => audits.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    surfaces: text("surfaces").array().notNull(),
    settings: jsonb("settings").notNull(),
    location: jsonb("location"),
    status: text("status").$type<"queued" | "collecting" | "complete">().notNull(),
    statusReason: text("status_reason"),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [index("audit_google_surfaces_org_idx").on(t.organizationId)],
);

export const googleSurfaceResults = pgTable(
  "google_surface_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    auditId: uuid("audit_id")
      .references(() => audits.id, { onDelete: "cascade" })
      .notNull(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    surface: text("surface").$type<"google_ai_overviews" | "google_ai_mode">().notNull(),
    prompt: text("prompt").notNull(),
    promptIndex: integer("prompt_index").notNull(),
    isBrandedPrompt: boolean("is_branded_prompt").notNull(),
    outcome: text("outcome")
      .$type<"pending" | "shown" | "not_shown" | "failed" | "not_completed" | "skipped">()
      .notNull(),
    outcomeReason: text("outcome_reason"),
    provider: text("provider").notNull(),
    providerTaskId: text("provider_task_id"),
    providerStatusCode: integer("provider_status_code"),
    attempts: integer("attempts").default(0).notNull(),
    answerText: text("answer_text"),
    citedLinks: jsonb("cited_links"),
    googleLinkCount: integer("google_link_count"),
    brandMentioned: boolean("brand_mentioned"),
    mentionVerification: text("mention_verification").$type<
      "verified_domain" | "verified_location" | "unverified"
    >(),
    position: integer("position"),
    costUsd: numeric("cost_usd", { precision: 10, scale: 6 }),
    costSource: text("cost_source"),
    locationCode: integer("location_code"),
    locationLabel: text("location_label"),
    device: text("device"),
    seDomain: text("se_domain"),
    languageCode: text("language_code"),
    queueMode: text("queue_mode"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }),
    rawResponse: jsonb("raw_response"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("google_surface_results_audit_surface_prompt_idx").on(
      t.auditId,
      t.surface,
      t.promptIndex,
    ),
    index("google_surface_results_org_idx").on(t.organizationId),
  ],
);
