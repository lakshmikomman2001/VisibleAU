import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { audits } from "./audits";
import { brands } from "./brands";
import { organizations } from "./organizations";

export const citationSourceIntelligence = pgTable(
  "citation_source_intelligence",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .references(() => brands.id)
      .notNull(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    auditId: uuid("audit_id").references(() => audits.id, { onDelete: "cascade" }),
    engine: text("engine").notNull(),
    sourceType: text("source_type").notNull(),
    citationCount: integer("citation_count").notNull(),
    citationShare: numeric("citation_share", { precision: 5, scale: 2 }),
    brandPresentInSource: boolean("brand_present_in_source").notNull(),
    gapSeverity: text("gap_severity").notNull(),
    marketBenchmark: jsonb("market_benchmark"),
    sourceAffinityNote: text("source_affinity_note"),
    // Task #45: up to 8 { domain, count, origin, isBrand? } entries,
    // sorted by count desc, computed in buildCitationSourceIntelligence
    // alongside citationCount/citationShare. Nullable: rows written
    // before this column existed (and any row whose non-fatal write
    // failed) have no value here. Migration 0039
    // (apply-before-push -- see db/prod-fixes/0044-csi-top-domains-*-prod.sql).
    // See docs/ops/post-launch-db-hardening.md section 45.
    topDomains: jsonb("top_domains"),
    calculatedAt: timestamp("calculated_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqueWithAudit: uniqueIndex("csi_unique_with_audit")
      .on(t.brandId, t.auditId, t.engine, t.sourceType)
      .where(sql`audit_id IS NOT NULL`),
    uniqueAggregate: uniqueIndex("csi_unique_aggregate")
      .on(t.brandId, t.engine, t.sourceType)
      .where(sql`audit_id IS NULL`),
    brandEngineIdx: index("csi_brand_engine_idx").on(t.brandId, t.engine, t.calculatedAt),
  }),
);
