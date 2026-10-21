export interface AuditCallOutcome {
  /** Whether the prompt template that produced this call named the brand
   * directly (e.g. "Is {brand} reputable?") -- guarantees a trivial
   * mention, so it must not feed any dimension score. */
  isBranded: boolean;
  brandMentioned: boolean;
  position: number | null;
  /** Audit reliability, Part B: null means "not mentioned, nothing to
   * verify" OR a legacy row written before this column existed --
   * both are counted exactly like a verified mention, via
   * isCountedMention below. Only the literal 'unverified' excludes. */
  mentionVerification: string | null;
  sentimentLabel: string;
  contextLabel: string;
  citedSources: unknown;
  /** 1-based run number within this (engine, prompt) pair. Task SSS: the
   * LLM cache key is sha256(prompt + model) with no run index, so runs
   * 2..N replay the exact cached response from run 1 -- only runNumber===1
   * is ever a real, independent LLM call. */
  runNumber: number;
}

export interface OrganicCitationAggregates {
  totalCalls: number;
  mentionedCount: number;
  positions: (number | null)[];
  sentiments: string[];
  contexts: string[];
  citationData: Array<{ brandMentioned: boolean; mentionVerification: string | null; citedSources: unknown }>;
  /** Task SSS: the TRUE independent-sample counts -- distinct (engine,
   * prompt) observations (runNumber === 1), not the replay-inflated
   * totals above. These feed confidence-interval WIDTH only; point
   * estimates (scores, mentionedCount, totalCalls) are correct as-is
   * because every replay is byte-identical to its run-1 original, so the
   * proportion is the same either way -- only the sample size the margin
   * is computed from was wrong. */
  distinctSampleCount: number;
  distinctMentionedCount: number;
  distinctAccWithSourcesCount: number;
}

/**
 * Audit reliability, Part B: a name match only counts toward Frequency,
 * Position, Sentiment, Context or Source Accuracy once it's confirmed
 * as THIS business (lib/audit/verify-mention.ts) -- an 'unverified'
 * match (a common name hitting a different business, audit #30's
 * Omega Services) is real detected text, kept on the row and shown in
 * the audit's responses, but not counted. `null` (not mentioned, or a
 * legacy row from before this column existed) is counted exactly as
 * before -- only the literal 'unverified' excludes.
 */
export function isCountedMention(o: {
  brandMentioned: boolean;
  mentionVerification: string | null;
}): boolean {
  return o.brandMentioned && o.mentionVerification !== "unverified";
}

/**
 * Excludes every call made from a branded prompt template from the audit's
 * dimension-scoring inputs, before Frequency/Position/Sentiment/Context/
 * Accuracy are computed from them -- a branded prompt guarantees a trivial
 * mention (and typically rank 1, positive sentiment, "listed" context), so
 * it inflates every dimension that depends on it, not just Frequency.
 *
 * Shared by lib/audit/run-audit-inline.ts and inngest/functions/run-audit.ts
 * so they can't drift the way they have before: both call this one function
 * instead of each inlining their own copy of the same filter-and-tally
 * logic.
 *
 * For a brand with no classification/promptPack, prompts come from the
 * vertical pack's lowest-ranked 10 templates -- none branded at
 * PROMPTS_PER_AUDIT=10 (the first branded template is rank 34), so this
 * stays a no-op for that path. For a classified brand (every real customer),
 * prompts come from buildPromptPack's enriched pool instead, which IS
 * branded (task QQ) -- this is where the filter now actually excludes calls.
 */
export function selectOrganicCitations(outcomes: AuditCallOutcome[]): OrganicCitationAggregates {
  const organic = outcomes.filter((o) => !o.isBranded);

  let mentionedCount = 0;
  const positions: (number | null)[] = [];
  const sentiments: string[] = [];
  const contexts: string[] = [];
  const citationData: Array<{
    brandMentioned: boolean;
    mentionVerification: string | null;
    citedSources: unknown;
  }> = [];

  let distinctSampleCount = 0;
  let distinctMentionedCount = 0;
  let distinctAccWithSourcesCount = 0;

  for (const o of organic) {
    citationData.push({
      brandMentioned: o.brandMentioned,
      mentionVerification: o.mentionVerification,
      citedSources: o.citedSources,
    });
    if (isCountedMention(o)) {
      mentionedCount++;
      positions.push(o.position ?? null);
      sentiments.push(o.sentimentLabel);
      contexts.push(o.contextLabel);
    }

    if (o.runNumber === 1) {
      distinctSampleCount++;
      if (isCountedMention(o)) {
        distinctMentionedCount++;
        const sources = o.citedSources as unknown[];
        if (Array.isArray(sources) && sources.length > 0) distinctAccWithSourcesCount++;
      }
    }
  }

  // No divide-by-zero / fabricated value if every call turns out branded:
  // totalCalls is 0 and every downstream dimension scorer already treats a
  // 0-call / empty-array input as 0, not a guessed fallback.
  return {
    totalCalls: organic.length,
    mentionedCount,
    positions,
    sentiments,
    contexts,
    citationData,
    distinctSampleCount,
    distinctMentionedCount,
    distinctAccWithSourcesCount,
  };
}
