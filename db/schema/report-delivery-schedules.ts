import { boolean, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { brands } from "./brands";
import { organizations } from "./organizations";
import { reportTemplates } from "./report-templates";

export const reportDeliverySchedules = pgTable("report_delivery_schedules", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: uuid("organization_id")
    .references(() => organizations.id)
    .notNull(),
  brandId: uuid("brand_id").references(() => brands.id),
  templateId: uuid("template_id").references(() => reportTemplates.id, { onDelete: "set null" }),
  frequency: text("frequency").notNull(),
  dayOfWeek: integer("day_of_week"),
  dayOfMonth: integer("day_of_month"),
  timeOfDay: text("time_of_day").notNull().default("23:00"),
  recipientEmails: jsonb("recipient_emails").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  // S01 part 2 (migration 0154; LLD 8.1.7): the report tier a scheduled report is generated at, capped at the plan.
  reportTier: text("report_tier", { enum: ["basic", "standard", "enhanced"] })
    .notNull()
    .default("basic"),
  lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
