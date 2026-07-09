import { boolean, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { brands } from "./brands";
import { organizations } from "./organizations";

export const conversationJourneys = pgTable("conversation_journeys", {
  id: uuid("id").primaryKey().defaultRandom(),
  brandId: uuid("brand_id")
    .references(() => brands.id)
    .notNull(),
  organizationId: uuid("organization_id")
    .references(() => organizations.id)
    .notNull(),
  journeyName: text("journey_name").notNull(),
  vertical: text("vertical").notNull(),
  buyerStage: text("buyer_stage").notNull(),
  promptSequence: jsonb("prompt_sequence").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
