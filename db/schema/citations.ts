import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { audits } from "./audits";

export const citations = pgTable(
  "citations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    auditId: uuid("audit_id")
      .references(() => audits.id, { onDelete: "cascade" })
      .notNull(),
    engine: text("engine").notNull(),
    prompt: text("prompt").notNull(),
    runNumber: integer("run_number").default(1).notNull(),
    brandMentioned: boolean("brand_mentioned").notNull(),
    // Whether the source prompt TEMPLATE named the brand directly (e.g. "Is
    // {brand} reputable?") -- guarantees a trivial brand mention, so Share of
    // Voice excludes these citations for every domain. Nullable: rows written
    // before this column existed have no way to reconstruct it (citations.prompt
    // stores the already-expanded text, with no link back to its template) --
    // they stay unfiltered until the next audit.complete run.
    isBrandedPrompt: boolean("is_branded_prompt"),
    position: integer("position"),
    sentimentLabel: text("sentiment_label"),
    sentimentScore: numeric("sentiment_score", { precision: 5, scale: 4 }),
    contextLabel: text("context_label"),
    responseSnippet: text("response_snippet"),
    // Task #46 Phase 3, Part B: the FULL LLM answer text (response_snippet
    // is only its first 500 chars). Nullable, no default: rows written
    // before migration 0045 never captured it, so NULL means "not
    // captured" -- readers fall back to the snippet and say so, never
    // presenting it as the full answer.
    responseText: text("response_text"),
    contextSnippets: jsonb("context_snippets").default("[]").notNull(),
    citedSources: jsonb("cited_sources").default("[]").notNull(),
    llmCostUsd: numeric("llm_cost_usd", { precision: 10, scale: 6 }),
    llmTokensUsed: integer("llm_tokens_used"),
    llmModel: text("llm_model"),
    citedSourceType: text("cited_source_type"),
    citedSourceEngineAffinity: text("cited_source_engine_affinity"),
    isAccurate: boolean("is_accurate"),
    hallucinationFlags: jsonb("hallucination_flags"),
    // Task #46 Phase 2, Part C: an explicit, reliable cache-hit signal,
    // set at write time from lib/llm/cache.ts's getCached() result --
    // replaces inferring it from costEstimateUsd === 0 (every cache hit
    // happens to cost $0 by construction, but that's an inference, not
    // a recorded fact). Historical rows (pre migration 0044) default to
    // false; the audit page's LLM-calls header still falls back to the
    // cost-based inference for rows this old, so nothing regresses.
    isCacheHit: boolean("is_cache_hit").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => ({
    // Task #46 (6th follow-up): every hot-path reader of this table
    // (buildCitationSourceIntelligence, checkBrandDomainNotCited,
    // Evidence Archive) filters audit_id = ? AND run_number = 1 --
    // this table previously had no index at all besides its PK, so
    // every one of those reads was a full-table Seq Scan whose cost
    // grows with every customer's total citations, not just one
    // audit's own rows. See db/migrations/0040_citations_audits_hot_path_indexes.sql.
    auditRunIdx: index("citations_audit_run_idx").on(table.auditId, table.runNumber),
  }),
);
