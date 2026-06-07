import { numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const validationCorpusResults = pgTable("validation_corpus_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  fixtureName: text("fixture_name").notNull(),
  domain: text("domain").notNull(),
  vertical: text("vertical").notNull(),
  region: text("region").notNull(),
  category: text("category").notNull(),
  expectedScoreMin: numeric("expected_score_min", { precision: 5, scale: 2 }),
  expectedScoreMax: numeric("expected_score_max", { precision: 5, scale: 2 }),
  actualScore: numeric("actual_score", { precision: 5, scale: 2 }),
  withinBand: text("within_band").notNull(),
  spearmanContribution: numeric("spearman_contribution", { precision: 10, scale: 6 }),
  runAt: timestamp("run_at", { withTimezone: true }).defaultNow().notNull(),
});
