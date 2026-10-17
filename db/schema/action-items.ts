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
    // Task #46 (fix: stored value contradicting its own CI), follow-up #1:
    // the ConfidenceBasis ("verified"/"inferred"/"speculative",
    // lib/recommendations/types.ts) that resolveConfidence actually used
    // to produce confidenceLabel -- written only by the evidence-driven
    // generator (inngest/functions/generate-recommendations.ts). NULL on
    // every row written before this column existed, including both the
    // pre-5fe41c0 static-table code AND anything generated in prod after
    // that commit but before THIS fix's own deploy -- a row's `createdAt`
    // can't tell those apart from a real evidence-driven row (code ships
    // on deploy, not on commit), but this column can: absence always
    // means "not proven evidence-driven," read at display time by
    // lib/recommendations/confidence-labels.ts's isLegacyConfidence,
    // never by editing the stored confidenceLabel itself.
    confidenceBasis: text("confidence_basis"),
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
