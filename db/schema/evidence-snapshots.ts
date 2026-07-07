import {
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { audits } from "./audits";
import { brands } from "./brands";
import { organizations } from "./organizations";

export const evidenceSnapshots = pgTable("evidence_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .references(() => brands.id)
    .notNull(),
  organizationId: uuid("organization_id")
    .references(() => organizations.id)
    .notNull(),
  auditId: uuid("audit_id")
    .references(() => audits.id, { onDelete: "set null" }),
  engine: text("engine").notNull(),
  prompt: text("prompt").notNull(),
  rawResponse: text("raw_response").notNull(),
  scoreAtCapture: numeric("score_at_capture", { precision: 5, scale: 2 }),
  capturedAt: timestamp("captured_at", { withTimezone: true }).defaultNow().notNull(),
});
