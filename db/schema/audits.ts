import { sql } from "drizzle-orm";
import {
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
import { brands } from "./brands";
import { configBundleCache } from "./config-bundle-cache";
import { organizations } from "./organizations";

// Task #46 (6th follow-up), Part C: audits.status is a plain TEXT
// column, never an enum -- every writer and every reader in the
// codebase already agrees on this exact literal (confirmed by grep
// across lib/, inngest/, app/, and by a direct `GROUP BY status`
// against prod: 53 "complete", 2 "failed", 1 "pending", zero
// "completed"). This constant exists so the two queries
// audits_brand_completed_idx is built to serve (checkBrandDomainNotCited,
// getCurrentCitationSources' latest-audit fallback) can't silently
// drift from the partial index's own WHERE clause -- the index's
// `sql\`status = 'complete'\`` predicate below is still a separate
// literal (Drizzle's partial-index `.where()` takes a raw SQL
// fragment, not a column/constant reference), so it's not auto-kept
// in sync by TypeScript -- change both together if this ever changes.
export const AUDIT_STATUS_COMPLETE = "complete" as const;

export const audits = pgTable(
  "audits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    brandId: uuid("brand_id")
      .references(() => brands.id)
      .notNull(),
    organizationId: uuid("organization_id")
      .references(() => organizations.id)
      .notNull(),
    auditNumber: integer("audit_number").notNull(),
    status: text("status").notNull().default("pending"),
    triggeredBy: text("triggered_by").notNull().default("manual"),
    engines: text("engines").array().default([]).notNull(),
    promptsCount: integer("prompts_count"),
    runsPerPrompt: integer("runs_per_prompt"),
    totalCalls: integer("total_calls"),
    scoreComposite: numeric("score_composite", { precision: 5, scale: 2 }),
    scoreFrequency: numeric("score_frequency", { precision: 5, scale: 2 }),
    scorePosition: numeric("score_position", { precision: 5, scale: 2 }),
    scoreSentiment: text("score_sentiment"),
    scoreSentimentNumeric: numeric("score_sentiment_numeric", { precision: 5, scale: 2 }),
    scoreContext: text("score_context"),
    scoreContextNumeric: numeric("score_context_numeric", { precision: 5, scale: 2 }),
    scoreAccuracy: numeric("score_accuracy", { precision: 5, scale: 2 }),
    scoreConfidenceLow: numeric("score_confidence_low", { precision: 5, scale: 2 }),
    scoreConfidenceHigh: numeric("score_confidence_high", { precision: 5, scale: 2 }),
    confidenceIntervals: jsonb("confidence_intervals").default(sql`'{}'::jsonb`).notNull(),
    engineCount: integer("engine_count"),
    totalCostUsd: numeric("total_cost_usd", { precision: 10, scale: 4 }),
    metadata: jsonb("metadata").default(sql`'{}'::jsonb`).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    // Phase 2 Sprint 1 columns (nullable, safe migration)
    configBundleId: uuid("config_bundle_id").references(() => configBundleCache.id),
    configDigest: text("config_digest"),
    estimatedCostCents: integer("estimated_cost_cents"),
    qualityStatus: text("quality_status").default("pending"),
    // Vunnara Build 1, Part E.2: which of the brand's frozen prompt-
    // pack generations this audit actually ran -- read from brands.
    // prompt_pack_version at audit-creation time (lib/audit/
    // numbering.ts's getBrandPromptPackVersion) and never updated
    // afterwards, so a later regeneration can't retroactively change
    // what an already-completed audit used. Drift comparisons
    // (lib/drift/detect.ts) and trend views treat a mismatch between
    // two audits' versions the same way a composite-basis mismatch is
    // already treated -- never like-for-like.
    promptPackVersion: integer("prompt_pack_version").default(1),
  },
  (table) => ({
    uniqueOrgAuditNumber: uniqueIndex("audits_org_audit_number_idx").on(
      table.organizationId,
      table.auditNumber,
    ),
    orgCompletedIdx: index("audits_org_completed_idx").on(table.organizationId, table.completedAt),
    // Task #46 (6th follow-up): checkBrandDomainNotCited and
    // getCurrentCitationSources' latest-audit fallback both run
    // WHERE brand_id = ? AND status = 'complete' ORDER BY completed_at
    // DESC LIMIT 1 -- partial on status = 'complete' since that's the
    // only status either caller filters on; completed_at DESC lets the
    // planner satisfy the ORDER BY/LIMIT straight from the index with
    // no separate Sort step. See
    // db/migrations/0040_citations_audits_hot_path_indexes.sql.
    brandCompletedIdx: index("audits_brand_completed_idx")
      .on(table.brandId, table.completedAt.desc())
      .where(sql`status = 'complete'`),
  }),
);
