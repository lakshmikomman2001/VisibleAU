import { createHash } from "node:crypto";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { llmResponseCache } from "@/db/schema";
import {
  type CompleteOutput,
  type Engine,
  ENGINE_SUPPLIES_STRUCTURED_CITATIONS,
} from "./interface";
import { METHODOLOGY_VERSION } from "./methodology";
import type { GroundingMode } from "./web-search-config";

// Vunnara Build 1, Part G.4: a grounded answer reflects the live web
// at the moment it was fetched -- caching it as long as a memory-only
// answer (which only ever reflects training data, so staleness barely
// matters) would risk serving outdated search results for longer than
// makes sense. Memory-only keeps the pre-existing 48h TTL unchanged.
const MEMORY_ONLY_TTL_HOURS = 48;
const GROUNDED_TTL_HOURS = 24;

/**
 * "'Run audit' always fetches fresh answers" (23 Oct), item 1 -- how
 * recently a cache row must have actually been FETCHED (not just
 * "still inside its own 24h/48h TTL") for a retry of a recently-failed
 * audit to reuse it, via getCached()'s maxAgeMs param below. Named
 * separately from GROUNDED_TTL_HOURS/MEMORY_ONLY_TTL_HOURS because
 * it answers a different question: those bound how long a row is
 * eligible for ANY reuse; this bounds how long a RETRY specifically
 * trusts it as representing "what the failed attempt already paid
 * for", which should be much shorter than the full TTL -- a retry an
 * hour after the failure is clearly the same attempt continuing; a
 * retry 20 hours later (still inside a grounded row's 24h TTL) is not.
 */
export const AUDIT_RETRY_CACHE_WINDOW_MS = 60 * 60 * 1000;

/**
 * Vunnara Build 1, Part G.4: the cache key now also includes the
 * grounding mode and the methodology version -- a memory-only and a
 * grounded answer to the identical prompt are genuinely different
 * responses (one reflects live web content, the other doesn't), so
 * they must never collide on the same cache row. Including
 * METHODOLOGY_VERSION means every pre-Part-G cache entry (keyed
 * without either of these) is simply orphaned, not reused under the
 * new semantics -- a clean break, not a silent reinterpretation of
 * old rows.
 */
// Build 1 addendum, item 4: exported so a reader (the audit page) can
// recompute the same key a cached citation would have been served
// under, and look up that exact llm_response_cache row's real
// created_at -- never an estimate.
export function makeKey(prompt: string, model: string, groundingMode: GroundingMode): string {
  return createHash("sha256")
    .update(`${prompt}\n${model}\n${groundingMode}\n${METHODOLOGY_VERSION}`)
    .digest("hex");
}

/**
 * Build 1 addendum, item 4: the real, earliest creation time among the
 * llm_response_cache rows backing a set of (prompt, model,
 * groundingMode) triples -- the honest "how old is the oldest cached
 * answer this audit reused" figure a UI can show next to "N cached".
 * Returns null when none of the computed keys have a live cache row
 * (e.g. it already expired, or was never cached under this exact key
 * -- the caller falls back to not showing an age rather than guessing
 * one). Because the cache key includes groundingMode + METHODOLOGY_
 * VERSION (Part G.4), a pre-Build-1 cache row can never match any key
 * computed here -- it was written under the old 2-field key shape.
 *
 * "71-hour-old cached answers in a web-grounded audit" (23 Oct) -- the
 * root cause of audit #32's "cached answers from 19 Oct 10:57 (up to
 * 71h old)": this query had NO expiry filter, so it could return the
 * createdAt of a long-EXPIRED row. createdAt is set once at a row's
 * first-ever INSERT and never updated by setCached()'s
 * onConflictDoUpdate on a later refresh, so a row that's been
 * refreshed many times over its life still reports its original
 * creation date -- describing dead, out-of-TTL content as if it were
 * what's actually shown. getCached() itself (below) already filters
 * gt(expiresAt, now) before ever returning a real hit, so the content
 * an audit actually reuses was already correctly bounded by the 24h
 * TTL -- only this DISPLAY query was wrong. Now uses the identical
 * gt(expiresAt, now) rule, so "oldest" only ever describes a row that
 * could actually still be served as a hit.
 */
export async function getOldestCacheEntryDate(
  entries: Array<{ prompt: string; model: string; groundingMode: GroundingMode }>,
): Promise<Date | null> {
  if (entries.length === 0) return null;
  const keys = [...new Set(entries.map((e) => makeKey(e.prompt, e.model, e.groundingMode)))];

  try {
    const rows = await db
      .select({ createdAt: llmResponseCache.createdAt })
      .from(llmResponseCache)
      .where(and(inArray(llmResponseCache.cacheKey, keys), gt(llmResponseCache.expiresAt, new Date())));
    if (rows.length === 0) return null;
    return rows.reduce(
      (oldest, r) => (r.createdAt < oldest ? r.createdAt : oldest),
      rows[0].createdAt,
    );
  } catch (err) {
    console.error("[llm-cache] getOldestCacheEntryDate failed (age omitted, not estimated)", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Task #43: both getCached and setCached are now wrapped so a cache-layer
 * failure (a DB hiccup, or -- before migration 0038 is applied -- the
 * new cited_urls column not existing yet) degrades to "cache miss" /
 * "response not cached" instead of breaking the LLM call that invoked
 * them. Previously only google-impl.ts guarded its own getCached() call;
 * openai-impl.ts, anthropic-impl.ts and perplexity-impl.ts all awaited
 * it unguarded. Centralizing the guard here protects all four engines
 * uniformly instead of relying on each call site to remember one. See
 * docs/ops/post-launch-db-hardening.md section 43.
 */
type CachedHit = Pick<
  CompleteOutput,
  "response" | "tokensUsed" | "costEstimateUsd" | "model" | "citedUrls" | "isCacheHit" | "cachedFromAt"
>;

export async function getCached(
  prompt: string,
  model: string,
  engine: Engine,
  groundingMode: GroundingMode,
  options?: { maxAgeMs?: number },
): Promise<CachedHit | null> {
  try {
    const key = makeKey(prompt, model, groundingMode);
    const [hit] = await db
      .select()
      .from(llmResponseCache)
      .where(and(eq(llmResponseCache.cacheKey, key), gt(llmResponseCache.expiresAt, new Date())));
    if (!hit) return null;

    // "'Run audit' always fetches fresh answers", item 1 -- a retry's
    // maxAgeMs is stricter than the row's own TTL: it must have been
    // FETCHED recently (within AUDIT_RETRY_CACHE_WINDOW_MS), not just
    // still inside its full 24h/48h window. fetchedAt is NULL only for
    // a row written before migration 0095 added this column AND never
    // refreshed since -- can't confirm it's recent enough, so treated
    // as a miss rather than guessed at (item 1 originally derived this
    // from expiresAt minus the mode's TTL; fetchedAt is now the real,
    // explicit value instead).
    if (options?.maxAgeMs !== undefined) {
      if (hit.fetchedAt === null) return null;
      if (Date.now() - hit.fetchedAt.getTime() > options.maxAgeMs) return null;
    }

    // Task #44: Bondi was re-audited the same day migration 0038 shipped
    // -- within the 48h TTL, llm_response_cache still holds Perplexity
    // responses for the exact same prompts written BEFORE cited_urls
    // existed (hit.citedUrls === null). For an engine that's supposed to
    // supply structured citations, serving that stale hit as-is would
    // mean Perplexity stays 100% "other" even after task #43 shipped --
    // the fix would look broken. Treat it as a miss instead (not
    // incrementing hitCount) so the caller re-fetches and setCached()
    // backfills citedUrls on this cache row. An engine that never
    // supplies citedUrls (the other three) has a NULL cited_urls as its
    // normal, permanent state -- that must still be a genuine hit.
    const suppliesCitations = ENGINE_SUPPLIES_STRUCTURED_CITATIONS[engine];
    if (suppliesCitations && hit.citedUrls == null) {
      return null;
    }

    db.update(llmResponseCache)
      .set({ hitCount: hit.hitCount + 1 })
      .where(eq(llmResponseCache.id, hit.id))
      .execute()
      .catch(() => {});
    return {
      response: hit.response,
      tokensUsed: hit.tokensUsed,
      costEstimateUsd: 0,
      model: hit.model,
      citedUrls: Array.isArray(hit.citedUrls) ? (hit.citedUrls as string[]) : undefined,
      isCacheHit: true,
      // "The cached-answer age must be the age of the content", item 2
      // -- the real time THIS content was fetched, for the caller to
      // persist on its own citation row (never re-derived later from
      // whatever llm_response_cache says at display time, which could
      // have been refreshed since). undefined (not null) for a NULL
      // fetchedAt, matching CompleteOutput.cachedFromAt's optional shape.
      cachedFromAt: hit.fetchedAt ?? undefined,
    };
  } catch (err) {
    console.error("[llm-cache] getCached failed (treating as cache miss)", {
      model,
      engine,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function setCached(
  prompt: string,
  model: string,
  output: { response: string; tokensUsed: number; costEstimateUsd: number; citedUrls?: string[] },
  groundingMode: GroundingMode,
) {
  try {
    const key = makeKey(prompt, model, groundingMode);
    const ttlHours = groundingMode === "grounded" ? GROUNDED_TTL_HOURS : MEMORY_ONLY_TTL_HOURS;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlHours * 3600 * 1000);
    await db
      .insert(llmResponseCache)
      .values({
        cacheKey: key,
        prompt,
        model,
        response: output.response,
        tokensUsed: output.tokensUsed,
        costEstimateUsd: output.costEstimateUsd.toString(),
        citedUrls: output.citedUrls ?? null,
        expiresAt,
        // "The cached-answer age must be the age of the content", item
        // 2 -- set on EVERY insert and EVERY refresh (the matching
        // .set() below), so this always reflects when the CURRENT
        // content was produced, never a frozen first-ever-insert time.
        fetchedAt: now,
      })
      .onConflictDoUpdate({
        target: llmResponseCache.cacheKey,
        set: {
          response: output.response,
          tokensUsed: output.tokensUsed,
          costEstimateUsd: output.costEstimateUsd.toString(),
          citedUrls: output.citedUrls ?? null,
          expiresAt,
          fetchedAt: now,
          hitCount: sql`${llmResponseCache.hitCount} + 1`,
        },
      });
  } catch (err) {
    console.error("[llm-cache] setCached failed (response not cached, call result still returned)", {
      model,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
