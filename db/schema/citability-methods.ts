import { jsonb, numeric, pgTable, text, uuid } from "drizzle-orm/pg-core";

export const citabilityMethods = pgTable("citability_methods", {
  id: uuid("id").primaryKey().defaultRandom(),
  methodKey: text("method_key").unique().notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  source: text("source").notNull(),
  effectSizePct: numeric("effect_size_pct", { precision: 5, scale: 2 }),
  effectSizeNotes: text("effect_size_notes"),
  appliesTo: jsonb("applies_to").default("[]").notNull(),
  // Task VVV: "research" entries carry a real, verified citationUrl
  // (reusing lib/methodology/methods.ts's already-vetted sources);
  // "vunnara_estimate" entries have no external citation to link -- the
  // effectSizePct is Vunnara's own estimate, not a claimed research figure.
  // See db/migrations/0034_citability_methods_provenance.sql.
  citationUrl: text("citation_url"),
  sourceType: text("source_type"),
});
