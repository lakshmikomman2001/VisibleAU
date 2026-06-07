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
});
