import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    weeklyDigest: boolean("weekly_digest").default(true).notNull(),
    digestEmail: text("digest_email").notNull(),
    emailOnDrift: boolean("email_on_drift").default(true).notNull(),
    // On by default (A1, Sri 31 Oct; migration 0106).
    emailOnAuditComplete: boolean("email_on_audit_complete").default(true).notNull(),
    emailOnScheduleFailure: boolean("email_on_schedule_failure").default(true).notNull(),
    emailOnHallucination: boolean("email_on_hallucination").default(true),
    emailOnConsensus: boolean("email_on_consensus").default(false),
    emailOnVolatility: boolean("email_on_volatility").default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqueOrg: uniqueIndex("notification_preferences_org_idx").on(t.organizationId),
  }),
);
