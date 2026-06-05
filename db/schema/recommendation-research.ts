import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const recommendationResearch = pgTable(
  "recommendation_research",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recommendationKey: text("recommendation_key").notNull(),
    source: text("source").notNull(),
    url: text("url"),
    summary: text("summary").notNull(),
    confidenceLevel: text("confidence_level").notNull(),
    citedAt: timestamp("cited_at", { withTimezone: true }),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    recKeyIdx: index("recommendation_research_key_idx").on(table.recommendationKey),
  }),
);
