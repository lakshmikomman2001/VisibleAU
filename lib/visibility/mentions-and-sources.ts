import type { HeadlineColorBand } from "@/lib/scoring/headline-color";
import { sourceCitationCard } from "@/lib/scoring/measured-display";
import { NO_AUDIT_YET, visibilityDisplay } from "@/lib/scoring/visibility-display";

/**
 * 17 Nov, part 1 -- the Visibility page's "Mentions and sources" card (was "Mention-Source Divide"), from ONE
 * audit's own figures, by the audit page's own definitions (lib/scoring/resolve-audit-dimensions.ts):
 * - mentioned: verified mentions of the brand ÷ the audit's successful everyday answers ("13 of 40", shown as the
 *   audit page rounds it, "33%");
 * - linked a source: of those mentions, how many linked at least one source -- any site, not only the brand's
 *   ("13 of 13"), the audit page's "13 of 13 mentions linked a source".
 *
 * Sri saw, for Hero Home Services (audit #50: 33%, 13 of 40, 13 of 13): "Mention 81.8%, Citation 0.0%, Ratio 0.00 --
 * Known but Untrusted". The card read the newest visibility_trends row (by calculated_at, so an older week
 * recomputed after an operator's trend exclusion became "the latest"), whose mention rate is the share of distinct
 * QUESTIONS any engine named the brand in, over every comparable audit of the week (#48's 11 questions with #50's
 * 10: 9 of 11), counting unverified mentions; and whose "citation" rate is the share of questions whose sources
 * include the brand's own domain exactly -- a different measure under the audit page's word, and 0 whenever AI
 * cites the brand's directory profiles instead of its site.
 *
 * The verdict comes only from the two figures above, and only when both are measured: an audit with too few
 * answers, or no mention to count sources for, says "Not measured for this audit" -- never 0.0% and never a
 * verdict. The card shows one audit, so no comparison (and no question-set or trend-exclusion rule) applies; an
 * audit an operator excluded from trends still shows, with the audit page's own label.
 *
 * Pure, so the card (a client component) can use it; lib/visibility/mentions-and-sources-for-audit.ts loads it.
 */

/** "Named often": in at least 1 in 5 everyday answers (the old card's own mention threshold, 20%). */
export const NAMED_OFTEN_PERCENT = 20;

export type MentionsVerdictKey =
  | "often_with_sources"
  | "often_few_sources"
  | "rarely_with_sources"
  | "rarely_few_sources";

/** Plain words, each with its one-line explanation. "With sources" = at least half the mentions linked one,
 * the report's own rule (lib/reports/report-rules.ts isPositionStrength). */
export const MENTIONS_VERDICTS: Record<MentionsVerdictKey, { label: string; explanation: string }> =
  {
    often_with_sources: {
      label: "Named often, with sources",
      explanation:
        "AI names you in at least 1 in 5 everyday answers, and at least half of those answers link a source.",
    },
    often_few_sources: {
      label: "Named often, few sources",
      explanation:
        "AI names you in at least 1 in 5 everyday answers, but fewer than half of those answers link a source.",
    },
    rarely_with_sources: {
      label: "Named rarely, with sources",
      explanation:
        "AI names you in fewer than 1 in 5 everyday answers; when it does, at least half link a source.",
    },
    rarely_few_sources: {
      label: "Named rarely, few sources",
      explanation:
        "AI names you in fewer than 1 in 5 everyday answers, and fewer than half of those link a source.",
    },
  };

export const NOT_MEASURED_FOR_AUDIT = "Not measured for this audit";

/** The audit's own counts (resolveOrganicDimensions), and its number. */
export interface MentionsAndSourcesInput {
  auditNumber: number;
  headline: { status: string; value?: number };
  sampleCount: number;
  mentionedCount: number;
  sourcedCount: number;
  /** "3 of 4 engines" when a whole engine failed (engineCoverageLabel), else null. */
  coverage?: string | null;
  /** The audit page's "Excluded from trends: ..." label, else null. */
  excludedFromTrends?: string | null;
}

/** The audit page's own Source citation card (sourceCitationCard): "13 of 13" over "mentions linked a source". */
export type SourcesFigure =
  | {
      state: "measured";
      value: string;
      detail: string;
      percent: string;
      smallSampleNote: string | null;
    }
  | { state: "not_measured"; reason: string };

export type MentionsAndSources =
  | { state: "no_audit"; reason: string }
  | {
      state: "not_measured";
      auditNumber: number;
      reason: string;
      coverage: string | null;
      excludedFromTrends: string | null;
    }
  | {
      state: "measured";
      auditNumber: number;
      coverage: string | null;
      excludedFromTrends: string | null;
      /** The audit page's headline (visibilityDisplay): "33%" over "13 of 40", in its colour band. */
      mentioned: { value: string; counts: string; band: HeadlineColorBand | null };
      sources: SourcesFigure;
      /** Null when a figure isn't measured. */
      verdict: { key: MentionsVerdictKey; label: string; explanation: string } | null;
    };

export function mentionsAndSources(input: MentionsAndSourcesInput | null): MentionsAndSources {
  if (!input) return { state: "no_audit", reason: NO_AUDIT_YET };
  const coverage = input.coverage ?? null;
  const excludedFromTrends = input.excludedFromTrends ?? null;
  if (input.headline.status !== "scored" || typeof input.headline.value !== "number") {
    return {
      state: "not_measured",
      auditNumber: input.auditNumber,
      reason: `${NOT_MEASURED_FOR_AUDIT}: fewer than 10 everyday answers came back (${input.sampleCount}).`,
      coverage,
      excludedFromTrends,
    };
  }
  const { mentionedCount, sampleCount, sourcedCount } = input;
  const headline = visibilityDisplay({
    headline: { status: "scored", value: input.headline.value, ci: { lower: 0, upper: 0 } },
    mentionedCount,
    sampleCount,
  });
  const mentioned = { value: headline.value, counts: headline.detail, band: headline.band };
  const card = sourceCitationCard({
    mentionedCount,
    sourcedCount,
    rankedCount: 0,
    medianPosition: null,
  });
  const sources: SourcesFigure =
    card.kind === "measured"
      ? {
          state: "measured",
          value: card.value,
          detail: card.detail,
          percent: `${Math.round((sourcedCount / mentionedCount) * 100)}%`,
          smallSampleNote: card.smallSampleNote,
        }
      : {
          state: "not_measured",
          reason: `${NOT_MEASURED_FOR_AUDIT}: AI didn't name you, so there's no mention to check.`,
        };
  let verdict: { key: MentionsVerdictKey; label: string; explanation: string } | null = null;
  if (sources.state === "measured") {
    const often = input.headline.value >= NAMED_OFTEN_PERCENT;
    const withSources = sourcedCount * 2 >= mentionedCount;
    const key: MentionsVerdictKey = often
      ? withSources
        ? "often_with_sources"
        : "often_few_sources"
      : withSources
        ? "rarely_with_sources"
        : "rarely_few_sources";
    verdict = { key, ...MENTIONS_VERDICTS[key] };
  }
  return {
    state: "measured",
    auditNumber: input.auditNumber,
    coverage,
    excludedFromTrends,
    mentioned,
    sources,
    verdict,
  };
}
