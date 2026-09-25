// RLS ENABLED: tenant data — organization_id scoped.
import { index, integer, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { audits } from "./audits";
import { brands } from "./brands";
import { organizations } from "./organizations";

export const shareOfVoiceSnapshots = pgTable(
  "share_of_voice_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .references(() => brands.id)
      .notNull(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    auditId: uuid("audit_id").references(() => audits.id, { onDelete: "cascade" }),
    competitorDomain: text("competitor_domain").notNull(),
    promptCategory: text("prompt_category").notNull(),
    engine: text("engine").notNull(),
    brandShare: numeric("brand_share", { precision: 5, scale: 2 }),
    competitorShare: numeric("competitor_share", { precision: 5, scale: 2 }),
    totalPrompts: integer("total_prompts").notNull(),
    sampleQuality: text("sample_quality").notNull(),
    // Raw counts behind brandShare/competitorShare, needed to correctly
    // re-aggregate across multiple engine groups (each has its own
    // denominator -- summing the stored percentages directly would be
    // wrong). Nullable: rows written before this column existed can't be
    // backfilled exactly, since total_prompts is a different denominator
    // (citation-row count, not mention count) and can't reconstruct it.
    brandMentionCount: integer("brand_mention_count"),
    competitorMentionCount: integer("competitor_mention_count"),
    totalMentionCount: integer("total_mention_count"),
    calculatedAt: timestamp("calculated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    brandEngineIdx: index("sov_brand_engine_idx").on(
      table.brandId,
      table.engine,
      table.calculatedAt,
    ),
  }),
);
