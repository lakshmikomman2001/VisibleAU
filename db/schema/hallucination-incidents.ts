import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { brands } from "./brands";
import { citations } from "./citations";
import { organizations } from "./organizations";
import { users } from "./users";

export const hallucinationIncidents = pgTable(
  "hallucination_incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .references(() => brands.id)
      .notNull(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    citationId: uuid("citation_id")
      .references(() => citations.id, { onDelete: "set null" }),
    engine: text("engine").notNull(),
    prompt: text("prompt").notNull(),
    incorrectClaim: text("incorrect_claim").notNull(),
    correctValue: text("correct_value"),
    claimType: text("claim_type").notNull(),
    severity: text("severity").notNull(),
    isAcknowledged: boolean("is_acknowledged").default(false).notNull(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    acknowledgedBy: uuid("acknowledged_by")
      .references(() => users.id),
    isFalsePositive: boolean("is_false_positive").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    brandIdx: index("hallucination_brand_idx").on(t.brandId, t.createdAt),
  }),
);
