import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { audits } from "./audits";
import { brands } from "./brands";
import { organizations } from "./organizations";

export const actionItems = pgTable(
  "action_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    brandId: uuid("brand_id")
      .references(() => brands.id)
      .notNull(),
    auditId: uuid("audit_id")
      .references(() => audits.id)
      .notNull(),
    recommendationKey: text("recommendation_key").notNull(),
    dimension: text("dimension").notNull(),
    title: text("title").notNull(),
    action: text("action").notNull(),
    confidenceLabel: text("confidence_label").notNull(),
    expectedImpactScore: text("expected_impact_score").notNull(),
    evidenceRefs: jsonb("evidence_refs").default("[]").notNull(),
    status: text("status").default("open").notNull(),
    dismissedReason: text("dismissed_reason"),
    doneAt: timestamp("done_at", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    uniqueAuditRec: uniqueIndex("action_items_audit_rec_idx").on(
      table.auditId,
      table.recommendationKey,
    ),
  }),
);
