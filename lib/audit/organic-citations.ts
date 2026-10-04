export interface AuditCallOutcome {
  /** Whether the prompt template that produced this call named the brand
   * directly (e.g. "Is {brand} reputable?") -- guarantees a trivial
   * mention, so it must not feed any dimension score. */
  isBranded: boolean;
  brandMentioned: boolean;
  position: number | null;
  sentimentLabel: string;
  contextLabel: string;
  citedSources: unknown;
}

export interface OrganicCitationAggregates {
  totalCalls: number;
  mentionedCount: number;
  positions: (number | null)[];
  sentiments: string[];
  contexts: string[];
  citationData: Array<{ brandMentioned: boolean; citedSources: unknown }>;
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
  const citationData: Array<{ brandMentioned: boolean; citedSources: unknown }> = [];

  for (const o of organic) {
    citationData.push({ brandMentioned: o.brandMentioned, citedSources: o.citedSources });
    if (o.brandMentioned) {
      mentionedCount++;
      positions.push(o.position ?? null);
      sentiments.push(o.sentimentLabel);
      contexts.push(o.contextLabel);
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
  };
}
