import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { brands } from "./brands";
import { organizations } from "./organizations";

export const auditSchedules = pgTable("audit_schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id").references(() => organizations.id).notNull(),
  brandId: uuid("brand_id").references(() => brands.id).notNull(),
  frequency: text("frequency").notNull(),
  status: text("status").default("active").notNull(),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  pausedReason: text("paused_reason"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({
  statusNextRunIdx: index("audit_schedules_status_next_run_idx").on(t.status, t.nextRunAt),
  brandUnique: uniqueIndex("audit_schedules_brand_unique_idx").on(t.brandId),
}));
