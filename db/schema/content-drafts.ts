// RLS ENABLED: tenant data — organization_id scoped.
import {
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { brands } from "./brands";
import { organizations } from "./organizations";
import { remediationTasks } from "./remediation-tasks";
import { users } from "./users";

export const contentDrafts = pgTable(
  "content_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    brandId: uuid("brand_id")
      .references(() => brands.id)
      .notNull(),
    taskId: uuid("task_id")
      .references(() => remediationTasks.id, { onDelete: "set null" }),
    draftType: text("draft_type").notNull(),
    contentFormat: text("content_format").notNull(),
    formatRecommendationReason: text("format_recommendation_reason"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    targetSubQuery: text("target_sub_query"),
    targetWordCount: integer("target_word_count"),
    wordCount: integer("word_count"),
    targetUrl: text("target_url"),
    status: text("status").notNull().default("draft"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => users.id),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
);
