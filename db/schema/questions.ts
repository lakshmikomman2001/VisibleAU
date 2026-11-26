import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { brands } from "./brands";
import { organizations } from "./organizations";
import { users } from "./users";

/**
 * S02 part 1 (migration 0155; LLD 7.1, 8.2): a brand's question library and its versioned question sets. Audits ask
 * the current set (lib/audit/get-audit-prompts.ts). FORCE RLS on app.current_org_id (0155's loop). Text enums are
 * TS-only here; the CHECKs are in the migration.
 */

export const QUESTION_KINDS = ["everyday", "branded"] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];
export const QUESTION_SOURCES = ["original", "template", "ai_suggested", "agency"] as const;
export type QuestionSource = (typeof QUESTION_SOURCES)[number];
export const QUESTION_REACHES = ["local", "state", "country", "global"] as const;
export type QuestionReach = (typeof QUESTION_REACHES)[number];
export const QUESTION_STATUSES = ["suggested", "ready", "archived"] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];
export const QUESTION_INTENTS = [
  "best",
  "reviews",
  "price",
  "near",
  "problem",
  "emergency",
  "comparison",
  "other",
] as const;
export type QuestionIntent = (typeof QUESTION_INTENTS)[number];

/** Every question a brand has asked or could ask. `textKey` is question_text_key(text) (a CHECK holds it). */
export const brandQuestions = pgTable(
  "brand_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    brandId: uuid("brand_id")
      .references(() => brands.id, { onDelete: "cascade" })
      .notNull(),
    text: text("text").notNull(),
    textKey: text("text_key").notNull(),
    kind: text("kind", { enum: QUESTION_KINDS }).notNull(),
    source: text("source", { enum: QUESTION_SOURCES }).notNull(),
    reach: text("reach", { enum: QUESTION_REACHES }).default("local").notNull(),
    serviceLabel: text("service_label"),
    businessServiceId: uuid("business_service_id"),
    placeLabel: text("place_label"),
    intent: text("intent", { enum: QUESTION_INTENTS }),
    status: text("status", { enum: QUESTION_STATUSES }).default("ready").notNull(),
    rank: numeric("rank", { precision: 6, scale: 3 }),
    reasons: jsonb("reasons").default([]).notNull(),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => ({
    liveKey: uniqueIndex("brand_questions_live_key")
      .on(table.brandId, table.textKey)
      .where(sql`${table.archivedAt} IS NULL`),
    brandStatus: index("brand_questions_brand_status").on(
      table.organizationId,
      table.brandId,
      table.status,
    ),
  }),
);

/** A brand's question sets, versioned; exactly one is current. comparisonHash: lib/questions/hash.ts. */
export const brandQuestionSets = pgTable(
  "brand_question_sets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    brandId: uuid("brand_id")
      .references(() => brands.id, { onDelete: "cascade" })
      .notNull(),
    version: integer("version").notNull(),
    isCurrent: boolean("is_current").default(false).notNull(),
    comparisonHash: text("comparison_hash").notNull(),
    reachHashes: jsonb("reach_hashes").default({}).notNull(),
    appliedBy: uuid("applied_by").references(() => users.id),
    appliedAt: timestamp("applied_at", { withTimezone: true }).defaultNow().notNull(),
    note: text("note"),
  },
  (table) => ({
    brandVersion: unique("brand_question_sets_brand_id_version_key").on(
      table.brandId,
      table.version,
    ),
    oneCurrent: uniqueIndex("brand_question_sets_one_current")
      .on(table.brandId)
      .where(sql`${table.isCurrent}`),
  }),
);

/** A set's questions in order, with each one's kind, reach and source as applied. */
export const brandQuestionSetItems = pgTable(
  "brand_question_set_items",
  {
    setId: uuid("set_id")
      .references(() => brandQuestionSets.id, { onDelete: "cascade" })
      .notNull(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id, { onDelete: "cascade" })
      .notNull(),
    // Checked at commit (DEFERRABLE INITIALLY DEFERRED, migration 0155): a question a set uses can't be deleted, yet a
    // brand delete cascades through questions and items in one statement.
    questionId: uuid("question_id")
      .references(() => brandQuestions.id)
      .notNull(),
    position: integer("position").notNull(),
    kind: text("kind", { enum: QUESTION_KINDS }).notNull(),
    reach: text("reach", { enum: QUESTION_REACHES }).notNull(),
    source: text("source", { enum: QUESTION_SOURCES }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.setId, table.questionId] }),
    setPosition: unique("brand_question_set_items_set_id_position_key").on(
      table.setId,
      table.position,
    ),
    question: index("brand_question_set_items_question").on(table.questionId),
  }),
);
