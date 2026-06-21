import {
  boolean,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { audits } from "./audits";
import { brands } from "./brands";
import { organizations } from "./organizations";

export const driftAlerts = pgTable(
  "drift_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    brandId: uuid("brand_id")
      .references(() => brands.id)
      .notNull(),
    currentAuditId: uuid("current_audit_id")
      .references(() => audits.id)
      .notNull(),
    previousAuditId: uuid("previous_audit_id")
      .references(() => audits.id)
      .notNull(),
    severity: text("severity").notNull(),
    scoreDelta: numeric("score_delta", { precision: 6, scale: 2 }),
    dimensionDeltas: jsonb("dimension_deltas").default("{}").notNull(),
    acknowledged: boolean("acknowledged").default(false).notNull(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orgAcknowledgedIdx: index("drift_alerts_org_acknowledged_idx").on(
      table.organizationId,
      table.acknowledged,
    ),
    brandCreatedIdx: index("drift_alerts_brand_created_idx").on(
      table.brandId,
      table.createdAt,
    ),
  }),
);
