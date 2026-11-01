import { and, eq } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { citations } from "@/db/schema";
import { detectBrandMention } from "@/lib/audit/detect-mention";
import { ORGANIC_ONLY } from "@/lib/audit/organic-filter";
import { getCached } from "@/lib/llm/cache";
import type { Engine } from "@/lib/llm/interface";

export interface CompetitorMentionCount {
  name: string;
  /** Everyday (organic), run-1 answers that name this competitor. */
  mentions: number;
}

/**
 * How many of an audit's everyday answers name each configured competitor
 * -- the audit page's "Competitor context" card and the report PDF's
 * competitors section read this one function (DEMO-BLOCKER, 1 Nov: moved
 * here from the audit page so the PDF can't count them differently).
 *
 * Task #46 Phase 1: real counts -- the same organic run-1 citation set the
 * headline uses (the brand's own count is the headline k), text-matched
 * per competitor name with the exact same detector the brand's own
 * mention count uses (lib/audit/detect-mention.ts), not a separate/looser
 * check. Empty when the brand has no competitors configured.
 */
export async function countCompetitorMentions(
  tx: DbClient,
  audit: { id: string; methodologyVersion: number | null },
  competitors: readonly string[],
): Promise<CompetitorMentionCount[]> {
  if (competitors.length === 0) return [];

  // Task #46 Phase 2, Part 0: run_number = 1 only -- the other runs are
  // byte-identical cache replays (task SSS), so scanning them too would
  // just repeat the same text-match work for no new information. Bounded
  // cost: one text per real (engine, prompt) pair, matched against every
  // configured competitor once each (responses × competitors), not per
  // page-render query.
  const textRows = await tx
    .select({
      prompt: citations.prompt,
      engine: citations.engine,
      llmModel: citations.llmModel,
      responseSnippet: citations.responseSnippet,
      responseText: citations.responseText,
    })
    .from(citations)
    .where(and(eq(citations.auditId, audit.id), ORGANIC_ONLY, eq(citations.runNumber, 1)));

  // Text source, best first (task #46 Phase 3, Part B):
  // 1. citations.response_text -- the full answer, stored permanently
  //    since migration 0045. When present the LLM cache is never
  //    consulted for that row.
  // 2. The LLM response cache (lib/llm/cache.ts), keyed by
  //    sha256(prompt + model), 48h TTL -- only for historical rows with
  //    no response_text, while the cache still holds it.
  // 3. citations.response_snippet -- first 500 chars only, so a
  //    competitor named later in a long answer is invisible. A real
  //    accuracy ceiling for pre-0045 audits, not something to backfill:
  //    competitor counts are computed fresh on every view.
  const texts = await Promise.all(
    textRows.map(async (r) => {
      if (r.responseText) return r.responseText;
      if (r.llmModel) {
        // Vunnara Build 1, Part G.4: the cache key now includes
        // groundingMode -- read back under this audit's own methodology,
        // matching how it would have been written.
        const groundingMode = (audit.methodologyVersion ?? 1) >= 2 ? "grounded" : "memory_only";
        const cached = await getCached(r.prompt, r.llmModel, r.engine as Engine, groundingMode);
        if (cached) return cached.response;
      }
      return r.responseSnippet;
    }),
  );
  const validTexts = texts.filter((s): s is string => !!s && s.length > 0);

  return Promise.all(
    competitors.map(async (name) => {
      let mentions = 0;
      for (const text of validTexts) {
        const detected = await detectBrandMention(text, { name, domain: "" });
        if (detected.found) mentions++;
      }
      return { name, mentions };
    }),
  );
}
