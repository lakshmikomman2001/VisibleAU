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

export const citations = pgTable(
  "citations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    auditId: uuid("audit_id")
      .references(() => audits.id, { onDelete: "cascade" })
      .notNull(),
    engine: text("engine").notNull(),
    prompt: text("prompt").notNull(),
    // "Audits time out on Vercel" follow-up, item 2 -- this call's
    // position in the audit's own prompt array (lib/audit/get-audit-
    // prompts.ts's return order), not the prompt's text. Lets a
    // replayed Inngest step (one that made its real provider call and
    // wrote this row, but whose request died before Inngest saw the
    // step complete) be a safe no-op instead of a duplicate row --
    // see migration 0093's unique index on (audit_id, engine,
    // prompt_index). Nullable, no backfill: a legacy row (written
    // before this column existed) is NULL and simply can't collide
    // with anything under the new index (Postgres never treats two
    // NULLs as equal in a unique index) -- it was never at risk of
    // this specific duplication anyway, since Inngest's step-based
    // replay-on-timeout is what creates the risk, and the per-call
    // step/per-call-budget pair this column supports didn't exist
    // before this follow-up.
    promptIndex: integer("prompt_index"),
    runNumber: integer("run_number").default(1).notNull(),
    brandMentioned: boolean("brand_mentioned").notNull(),
    // Whether the source prompt TEMPLATE named the brand directly (e.g. "Is
    // {brand} reputable?") -- guarantees a trivial brand mention, so Share of
    // Voice excludes these citations for every domain. Nullable: rows written
    // before this column existed have no way to reconstruct it (citations.prompt
    // stores the already-expanded text, with no link back to its template) --
    // they stay unfiltered until the next audit.complete run.
    isBrandedPrompt: boolean("is_branded_prompt"),
    // Audit reliability, Part B: a name match alone isn't proof it's
    // THIS business ("Omega Services" is a common name) -- verified
    // only when a cited URL is the brand's own domain, or the text
    // around the match names its confirmed suburb/city/state.
    // Additive, nullable: a legacy row (written before this column
    // existed) is NULL and keeps counting exactly as it always did --
    // only a NEW row can ever be the honest "unverified" (lib/audit/
    // verify-mention.ts is the one place this is computed; never a
    // second copy).
    mentionVerification: text("mention_verification", {
      enum: ["verified_domain", "verified_location", "unverified"],
    }),
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
    // "Audits time out on Vercel" follow-up, item 2 -- see
    // promptIndex's own doc comment above. A plain (non-unique) index
    // would still need a manual existence check before every insert;
    // this makes a replayed step's duplicate insert attempt a true
    // no-op at the database level instead (ON CONFLICT DO NOTHING in
    // both runners' insert calls).
    auditEnginePromptIdxUniqueIdx: uniqueIndex("citations_audit_engine_prompt_idx_unique_idx").on(
      table.auditId,
      table.engine,
      table.promptIndex,
    ),
  }),
);
