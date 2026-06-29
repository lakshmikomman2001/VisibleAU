// RLS ENABLED: tenant data — organization_id scoped.
import {
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { audits } from "./audits";
import { brands } from "./brands";
import { organizations } from "./organizations";
import { users } from "./users";
import { actionItems } from "./action-items";

export const remediationTasks = pgTable(
  "remediation_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    brandId: uuid("brand_id")
      .references(() => brands.id)
      .notNull(),
    auditId: uuid("audit_id")
      .references(() => audits.id, { onDelete: "set null" }),
    recommendationId: uuid("recommendation_id")
      .references(() => actionItems.id, { onDelete: "set null" }),
    recommendationKey: text("recommendation_key"),
    title: text("title").notNull(),
    description: text("description"),
    dimension: text("dimension"),
    status: text("status").notNull().default("open"),
    priority: integer("priority").notNull(),
    effort: text("effort"),
    confidenceLabel: text("confidence_label"),
    assignedTo: uuid("assigned_to").references(() => users.id),
    approvedBy: uuid("approved_by").references(() => users.id),
    dueDate: timestamp("due_date", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    wontFixReason: text("wont_fix_reason"),
    scoreBefore: numeric("score_before", { precision: 5, scale: 2 }),
    scoreAfter: numeric("score_after", { precision: 5, scale: 2 }),
    fanOutBefore: numeric("fan_out_before", { precision: 5, scale: 2 }),
    fanOutAfter: numeric("fan_out_after", { precision: 5, scale: 2 }),
    similarityBefore: numeric("similarity_before", { precision: 4, scale: 3 }),
    similarityAfter: numeric("similarity_after", { precision: 4, scale: 3 }),
    reauditId: uuid("reaudit_id").references(() => audits.id, { onDelete: "set null" }),
    reauditDeferredReason: text("reaudit_deferred_reason"),
    // Plain UUID — FK constraints added in Sprint 3 when the target tables exist (BD-01)
    fanOutGapId: uuid("fan_out_gap_id"),
    topicalGapId: uuid("topical_gap_id"),
    linkedinGapSource: text("linkedin_gap_source"),
    consensusGapSource: text("consensus_gap_source"),
    liftAchieved: numeric("lift_achieved", { precision: 5, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    brandStatusIdx: index("tasks_brand_status_idx").on(table.brandId, table.status),
    assignedIdx: index("tasks_assigned_idx").on(table.assignedTo, table.status),
  }),
);
