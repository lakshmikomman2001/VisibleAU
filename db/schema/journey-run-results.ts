import { index, integer, jsonb, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { brands } from "./brands";
import { organizations } from "./organizations";
import { conversationJourneys } from "./conversation-journeys";

export const journeyRunResults = pgTable(
  "journey_run_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    journeyId: uuid("journey_id")
      .references(() => conversationJourneys.id, { onDelete: "cascade" })
      .notNull(),
    brandId: uuid("brand_id")
      .references(() => brands.id)
      .notNull(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    engine: text("engine").notNull(),
    runAt: timestamp("run_at", { withTimezone: true }).defaultNow().notNull(),
    turnResults: jsonb("turn_results").notNull(),
    brandAppearedInNTurns: integer("brand_appeared_in_n_turns").notNull(),
    totalTurns: integer("total_turns").notNull(),
    journeyScore: numeric("journey_score", { precision: 5, scale: 2 }),
    firstMentionTurn: integer("first_mention_turn"),
  },
  (table) => ({
    brandIdx: index("journey_results_brand_idx").on(table.brandId, table.runAt),
    journeyIdx: index("journey_results_journey_idx").on(table.journeyId, table.runAt),
  }),
);
