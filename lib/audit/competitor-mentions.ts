import { and, eq } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { citations } from "@/db/schema";
import { detectBrandMention } from "@/lib/audit/detect-mention";
import { citedSourcesOf } from "@/lib/audit/extract-citations";
import { ORGANIC_ONLY } from "@/lib/audit/organic-filter";
import { verifyMention } from "@/lib/audit/verify-mention";
import { getCached } from "@/lib/llm/cache";
import type { Engine } from "@/lib/llm/interface";

/** A configured competitor with its own website: the only kind whose mentions can be verified. */
export interface VerifiableCompetitor {
  name: string;
  /** Its host, e.g. rivalplumbing.com.au (brands.competitor_websites). */
  website: string;
}

export interface CompetitorMentionCount {
  name: string;
  /** Everyday (organic), run-1 answers that name this competitor AND cite its own website. */
  mentions: number;
  /** The same answers split by engine (engines with no mention are absent). */
  perEngine: Record<string, number>;
}

/**
 * How many of an audit's everyday answers name each configured competitor.
 * One Share of Voice (7 Nov): only lib/visibility/share-of-voice.ts calls
 * this -- every surface (Overview, Visibility page, audit page, PDF, wins
 * feed) reads its counts through that one counter, never this directly
 * (tests/unit/visibility/one-share-of-voice.test.ts).
 *
 * Task #46 Phase 1: real counts -- the same organic run-1 citation set the
 * headline uses (the brand's own count is the headline k), text-matched
 * per competitor name with the exact same detector the brand's own
 * mention count uses (lib/audit/detect-mention.ts), not a separate/looser
 * check. Empty when the brand has no competitors configured.
 *
 * Fair competitor counting (7 Nov, Sri's decision 4): a name match counts only when it's verified by the
 * same rule as the brand's own mentions -- lib/audit/verify-mention.ts, here with the competitor's
 * website as the domain: its site among the sources the answer cited. A competitor has no confirmed
 * location, so the location half of that rule never applies to it. Competitors with no website can't
 * be verified; the caller (lib/visibility/share-of-voice.ts) leaves them out and names them.
 */
export async function countCompetitorMentions(
  tx: DbClient,
  audit: { id: string; methodologyVersion: number | null },
  competitors: readonly VerifiableCompetitor[],
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
      citedSources: citations.citedSources,
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
  const answers = textRows
    .map((r, i) => ({
      engine: r.engine,
      text: texts[i],
      // Decision 1 (6 Nov): only the sources the answer cited, as for the brand.
      citedSources: citedSourcesOf<{ domain: string; cited?: boolean }>(r.citedSources),
    }))
    .filter(
      (a): a is { engine: string; text: string; citedSources: Array<{ domain: string }> } =>
        !!a.text && a.text.length > 0,
    );

  return Promise.all(
    competitors.map(async ({ name, website }) => {
      let mentions = 0;
      const perEngine: Record<string, number> = {};
      for (const answer of answers) {
        const detected = await detectBrandMention(answer.text, { name, domain: website });
        if (!detected.found) continue;
        const verification = verifyMention({
          matchIndex: detected.matchIndex,
          responseText: answer.text,
          citedSources: answer.citedSources,
          brand: {
            domain: website,
            suburb: null,
            city: null,
            state: null,
            locationConfirmedAt: null,
            locationMode: "online_only",
          },
        });
        if (verification === "unverified") continue;
        mentions++;
        perEngine[answer.engine] = (perEngine[answer.engine] ?? 0) + 1;
      }
      return { name, mentions, perEngine };
    }),
  );
}
