import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizations } from "./organizations";

export const orgFeatureFlags = pgTable(
  "org_feature_flags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    flagKey: text("flag_key").notNull(),
    isEnabled: boolean("is_enabled").notNull(),
    reason: text("reason"),
    setBy: text("set_by"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    orgFlagKeyUnique: uniqueIndex("org_feature_flags_org_key_idx").on(
      table.organizationId,
      table.flagKey,
    ),
  }),
);
