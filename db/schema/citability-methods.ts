import { jsonb, numeric, pgTable, text, uuid } from "drizzle-orm/pg-core";

export const citabilityMethods = pgTable("citability_methods", {
  id: uuid("id").primaryKey().defaultRandom(),
  methodKey: text("method_key").unique().notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  source: text("source").notNull(),
  // Deprecated (Sri's decision, task after ZZZ): this was invented
  // precision inherited from the fabricated SE Ranking / AutoGEO data --
  // no longer populated by the seed or rendered/sorted by anywhere live.
  // Kept (not DROPed) only because it was already nullable, so leaving it
  // unpopulated is strictly lower-risk than this codebase's first-ever
  // DROP COLUMN against a table drizzle-kit can't track (see
  // db/migrations/README.md). Superseded by impactTier below. See
  // docs/ops/post-launch-db-hardening.md section 32.
  effectSizePct: numeric("effect_size_pct", { precision: 5, scale: 2 }),
  effectSizeNotes: text("effect_size_notes"),
  appliesTo: jsonb("applies_to").default("[]").notNull(),
  // Task VVV: "research" entries carry a real, verified citationUrl
  // (reusing lib/methodology/methods.ts's already-vetted sources);
  // "vunnara_estimate" entries have no external citation to link.
  // See db/migrations/0034_citability_methods_provenance.sql.
  citationUrl: text("citation_url"),
  sourceType: text("source_type"),
  // Qualitative impact rating ("high" | "medium" | "low"), Vunnara's own
  // judgment call -- replaces effectSizePct above. See
  // db/migrations/0035_citability_methods_impact_tier.sql.
  impactTier: text("impact_tier"),
});
