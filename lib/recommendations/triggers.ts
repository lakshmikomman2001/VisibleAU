import { type DimensionKey, resolveDimension } from "@/lib/scoring/dimension-result";
import {
  type DatedPage,
  type DirectoryFinding,
  NO_EVIDENCE,
  type NotabilityEvidence,
  type RecommendationEvidence,
} from "./evidence";
import type {
  ConfidenceBasis,
  EvidenceRef,
  TriggerContext,
  TriggeredRecommendation,
} from "./types";

interface RuleInput {
  ctx: TriggerContext;
  evidence: RecommendationEvidence;
  /** The rule's score threshold passed AND none of the dimensions it reads
   * is "insufficient_data" for this audit. */
  scoreSignal: boolean;
}

/** What a rule decided for this audit. Any field left out falls back to
 * the template's own. */
interface RuleOutcome {
  key?: string;
  title?: string;
  action?: string;
  basis: ConfidenceBasis;
  evidenceRefs?: EvidenceRef[];
}

interface RuleTemplate {
  key: string;
  /**
   * The Action Center grouping tag stored in action_items.dimension (a
   * plain text column). Usually one of the five scoring DimensionKeys, but
   * it is display-only -- see ACTION_GROUP_LABELS in
   * lib/scoring/dimension-labels.ts for the extra "content" bucket.
   */
  dimension: string;
  title: string;
  action: string;
  expectedImpactScore: "high" | "medium" | "low";
  /** Every scoring dimension `threshold` reads -- the insufficient-data
   * gate (see scoreSignalFor) is driven by this list, so it must be exact. */
  reads: readonly DimensionKey[];
  threshold: (ctx: TriggerContext) => boolean;
  /** Rules with a real checker decide from evidence. Rules without one
   * fire on `scoreSignal` alone, at basis "inferred". */
  evaluate?: (input: RuleInput) => RuleOutcome | null;
}

const score = (v: string | null | undefined): number => parseFloat(v ?? "100");

const DIMENSION_CTX_FIELD: Record<DimensionKey, keyof TriggerContext> = {
  frequency: "scoreFrequency",
  position: "scorePosition",
  sentiment: "scoreSentimentNumeric",
  context: "scoreContextNumeric",
  accuracy: "scoreAccuracy",
};

/**
 * Insufficient-data gate, applied to ALL rules: a dimension computed from
 * zero brand-mention rows is not a measurement (the 0 stored for it means
 * "nothing to measure"), so a rule whose threshold reads it must not fire
 * on that 0. Delegates to the shared contract in
 * lib/scoring/dimension-result.ts rather than re-deciding which dimensions
 * are mention-dependent -- Frequency is always scored there (0 mentions
 * out of N calls is itself the measurement).
 */
function isInsufficient(dim: DimensionKey, ctx: TriggerContext): boolean {
  if (ctx.mentionRowCount === undefined || ctx.mentionRowCount === null) return false;
  // Vunnara (19 Oct, post-aa83b3a): the headline's (Frequency's) own
  // insufficient_data gate is now about SAMPLE size (successful organic
  // answers -- resolveHeadline), not mention count -- a different
  // number this trigger context doesn't carry. Recommendations only
  // ever run against a completed audit, which by definition had at
  // least one successful answer to reach "complete" at all, so
  // Frequency is still, in practice, never insufficient here -- same
  // as the old alwaysScored: true behaviour this replaces.
  if (dim === "frequency") return false;
  const value = score(ctx[DIMENSION_CTX_FIELD[dim]] as string | null);
  return resolveDimension(value, { lower: 0, upper: 0 }, ctx.mentionRowCount).status === "insufficient_data";
}

/**
 * Task #46 Phase 3, Part C: Sentiment and Context have no real classifier
 * behind their stored values at all (lib/scoring/dimension-result.ts's top
 * comment) -- unconditionally "not_measured", never just "insufficient
 * data" (which is about whether there's data to measure; this is that
 * nothing real measures either dimension regardless). Any rule whose
 * `reads` includes "sentiment" or "context" must never fire from a score
 * signal -- UNCONDITIONALLY, not gated on ctx.mentionRowCount the way
 * isInsufficient is. Affected today: "faq-content" (reads context) and
 * "press-mentions" (reads frequency, sentiment) -- both permanently
 * disabled until a real classifier exists.
 */
function isNotMeasured(dim: DimensionKey): boolean {
  return dim === "sentiment" || dim === "context";
}

function scoreSignalFor(rule: RuleTemplate, ctx: TriggerContext): boolean {
  if (rule.reads.some((d) => isNotMeasured(d) || isInsufficient(d, ctx))) return false;
  return rule.threshold(ctx);
}

/** "A", "A and B", "A, B and C". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function checkerRef(source: string, summary: string, url: string | null = null): EvidenceRef {
  return { source, url: url ?? "", summary, sourceType: "checker" };
}

// ---------------------------------------------------------------------------
// au-local-citations -- checker: checkAuDirectories
// (lib/brand-entity/au-directory-aggregate.ts)
// ---------------------------------------------------------------------------

function evaluateAuDirectories({ evidence, scoreSignal }: RuleInput): RuleOutcome | null {
  const dirs = evidence.directories;
  const unverifiedFallback = (detail: string): RuleOutcome | null =>
    scoreSignal
      ? {
          title: "Check your AU local directory listings",
          action: `${detail} Make sure your business is listed on Hipages, Yellow Pages AU, ServiceSeeking and Word of Mouth with the same name, address and phone number as your website.`,
          basis: "inferred",
        }
      : null;

  if (dirs.status !== "ok") {
    return unverifiedFallback("We couldn't verify your directory listings this audit.");
  }

  const missing = dirs.data.results.filter((r) => r.status === "not_listed");
  const unverifiable = dirs.data.results.filter((r) => r.status === "unverifiable");
  const refsFor = (rs: DirectoryFinding[]) => rs.map((r) => checkerRef(r.name, r.finding, r.url));

  if (missing.length > 0) {
    const names = joinNames(missing.map((r) => r.name));
    const target = missing.length === 1 ? "it" : missing.length === 2 ? "both" : "each of them";
    const unverifiedNote =
      unverifiable.length > 0
        ? ` We couldn't verify ${joinNames(unverifiable.map((r) => r.name))} this time (the directory blocked our check), so check ${unverifiable.length === 1 ? "that one" : "those"} yourself.`
        : "";
    return {
      title: `You're not listed on ${names}`,
      action: `You're not listed on ${names} — add your business to ${target}, using exactly the same business name, address and phone number as your website and Google Business Profile.${unverifiedNote}`,
      basis: "verified",
      evidenceRefs: refsFor([...missing, ...unverifiable]),
    };
  }

  if (unverifiable.length > 0) {
    // Nothing confirmed missing, but some directories couldn't be checked:
    // inconclusive, never reported as "not listed".
    const outcome = unverifiedFallback(
      `We couldn't verify your listing on ${joinNames(unverifiable.map((r) => r.name))} this audit (the directory blocked our check).`,
    );
    return outcome ? { ...outcome, evidenceRefs: refsFor(unverifiable) } : null;
  }

  // Every directory confirmed the listing (or there was nothing to check).
  return null;
}

// ---------------------------------------------------------------------------
// stale-content -- data source: the Content Structure Audit crawl
// (content_structure_audits.last_modified, the page's real HTTP
// Last-Modified header), classified by classifyFreshness from
// lib/retrieval/content-auditor.ts ("stale" = 90+ days).
// ---------------------------------------------------------------------------

const MAX_LISTED_PAGES = 5;
const MAX_PAGE_REFS = 20;

function evaluateStaleContent({ evidence }: RuleInput): RuleOutcome | null {
  // Fires ONLY on stale pages actually found. No crawl, or a crawl whose
  // pages carry no Last-Modified date, is an unknown age -- not stale --
  // and there is no score that measures page age to fall back on, so the
  // rule stays silent rather than guessing.
  if (evidence.pageFreshness.status !== "ok") return null;
  const stale = evidence.pageFreshness.data.datedPages
    .filter((p) => p.freshnessRisk === "stale")
    .sort((a, b) => b.daysSinceModified - a.daysSinceModified);
  if (stale.length === 0) return null;

  const describe = (p: DatedPage) => `${p.url} (${p.daysSinceModified} days)`;
  const listed = stale.slice(0, MAX_LISTED_PAGES).map(describe);
  const more = stale.length - listed.length;
  const pageList = more > 0 ? `${listed.join(", ")}, and ${more} more` : joinNames(listed);
  const plural = stale.length === 1 ? "page hasn't" : `${stale.length} pages haven't`;

  return {
    title:
      stale.length === 1
        ? "Refresh a page that hasn't changed in 90+ days"
        : `Refresh ${stale.length} pages that haven't changed in 90+ days`,
    action: `This ${plural} changed in 90+ days, going by the Last-Modified date your server reports: ${pageList}. Refresh the pricing, availability and contact details on ${stale.length === 1 ? "it" : "each"}, and add a visible "Last updated" date.`,
    basis: "verified",
    evidenceRefs: stale
      .slice(0, MAX_PAGE_REFS)
      .map((p) =>
        checkerRef(
          "Your website",
          `Last modified ${p.lastModified.slice(0, 10)} (${p.daysSinceModified} days ago).`,
          p.url,
        ),
      ),
  };
}

// ---------------------------------------------------------------------------
// wikipedia-article / entity-profiles -- checker: checkWikipediaAuStatus
// (lib/brand-entity/wikipedia-au.ts)
//
// Wikipedia's notability guideline for companies, WP:NCORP:
//   https://en.wikipedia.org/wiki/Wikipedia:Notability_(organizations_and_companies)
// (read 2026-10-16). In short: an organization is presumed notable only
// with "significant coverage in multiple reliable secondary sources that
// are independent of the subject"; "at least one regional, statewide,
// provincial, national, or international source is necessary" (local
// media alone is not enough -- where coverage is only local the guideline
// suggests a section in the article on the local area instead); trivial
// coverage -- routine announcements, directory-style listings, "coverage
// of purely local events" -- does not count; and "articles about very
// small 'garage' or local companies are typically unacceptable". Being
// small doesn't disqualify a business, but nor do size, age or employee
// counts establish notability.
//
// So the Wikipedia ask is gated on passesNotabilityGate below (>= 2
// distinct independent outlets, >= 1 of them non-local). There is NO real
// press/notability checker in this codebase yet -- the "press-mentions"
// rule is a score threshold with nothing behind it, and the Wikidata
// check (lib/trust/stub-implementation-status.ts) is a stub -- so today
// the notability signal is always "not_run" and every brand without an
// article gets the realistic alternatives (entity-profiles) instead.
//
// Wikidata's own inclusion rule (https://www.wikidata.org/wiki/Wikidata:Notability,
// criterion 2) needs "a clearly identifiable conceptual or material
// entity" that "can be described using serious and publicly available
// references" -- hence the copy's "referenced to public records".
// ---------------------------------------------------------------------------

export function passesNotabilityGate(n: NotabilityEvidence): boolean {
  const outlets = new Set(n.qualifyingSources.map((s) => s.outlet.toLowerCase()));
  return outlets.size >= 2 && n.qualifyingSources.some((s) => s.scope !== "local");
}

const ENTITY_PROFILES_STEPS =
  "(1) complete your Google Business Profile — categories, service areas, hours and photos; (2) create a Wikidata item for your business, referenced to public records such as your ABN Lookup entry (Wikidata removes items it can't verify); (3) pitch a story to local and regional press. Coverage beyond your local paper is also what could make a Wikipedia article possible later.";

const NCORP_SUMMARY =
  "Wikipedia only accepts company articles backed by significant coverage in multiple independent, reliable sources, including at least one regional or national outlet — local coverage on its own usually isn't enough";

function evaluateWikipedia({ evidence, scoreSignal }: RuleInput): RuleOutcome | null {
  // Relevance gate: Wikipedia/entity profiles are a visibility lever, so
  // every path still needs the low-Frequency signal.
  if (!scoreSignal) return null;
  const wiki = evidence.wikipedia;

  if (wiki.status !== "ok") {
    return {
      key: "entity-profiles",
      title: "Strengthen your business's entity profile",
      action: `We couldn't check Wikipedia this audit. For most local businesses Wikipedia isn't the realistic route — ${NCORP_SUMMARY}. Instead: ${ENTITY_PROFILES_STEPS}`,
      basis: "inferred",
    };
  }

  // Never recommend creating a page that already exists.
  if (wiki.data.articleExists) return null;

  const searchRef = checkerRef(
    "Wikipedia",
    `Searched Wikipedia for "${wiki.data.query}": no article found.`,
  );
  const notability = evidence.notability;
  if (notability.status === "ok" && passesNotabilityGate(notability.data)) {
    const outlets = joinNames([...new Set(notability.data.qualifyingSources.map((s) => s.outlet))]);
    return {
      action: `There's no Wikipedia article for your business, and you have independent coverage from ${outlets} — the kind Wikipedia's notability guideline asks for (significant coverage in multiple independent, reliable sources, at least one beyond local media). Draft a neutral article cited only to those sources, and because you have a conflict of interest, submit it through Wikipedia's Articles for Creation review rather than publishing it yourself.`,
      basis: "verified",
      evidenceRefs: [
        searchRef,
        ...notability.data.qualifyingSources.map((s) =>
          checkerRef(s.outlet, `Independent ${s.scope} coverage.`, s.url),
        ),
      ],
    };
  }

  return {
    key: "entity-profiles",
    title: "Build your entity profile beyond Wikipedia",
    action: `We checked: there's no Wikipedia article for your business. That's normal for a local business — ${NCORP_SUMMARY}, so we don't recommend writing one yet. Instead: ${ENTITY_PROFILES_STEPS}`,
    basis: "verified",
    evidenceRefs: [searchRef],
  };
}

// ---------------------------------------------------------------------------

const UNIVERSAL_TEMPLATES: RuleTemplate[] = [
  {
    key: "wikipedia-article",
    dimension: "frequency",
    title: "Draft a Wikipedia article for your business",
    action:
      "Draft a neutral, citation-backed Wikipedia article about your business, cited only to independent coverage.",
    expectedImpactScore: "high",
    reads: ["frequency"],
    threshold: (ctx) => score(ctx.scoreFrequency) < 40,
    evaluate: evaluateWikipedia,
  },
  {
    key: "au-local-citations",
    dimension: "frequency",
    title: "Your AU local directory listings are incomplete",
    action:
      "Submit your business to hipages, Yellow Pages AU, ServiceSeeking, and Word of Mouth with consistent NAP data.",
    expectedImpactScore: "high",
    reads: ["frequency"],
    // Only gates the UNVERIFIED fallback -- a directory the checker
    // confirmed missing fires regardless of score.
    threshold: (ctx) => score(ctx.scoreFrequency) < 50,
    evaluate: evaluateAuDirectories,
  },
  {
    key: "faq-content",
    dimension: "context",
    title: "Add FAQ schema to your main service page",
    action:
      'Add a FAQPage schema block answering "What suburbs do you service?" and "What is your call-out fee?".',
    expectedImpactScore: "medium",
    // Task #46 Phase 3, Part C: Context is permanently not_measured --
    // this rule's threshold is unreachable (isNotMeasured's gate in
    // scoreSignalFor short-circuits it to false), so it never fires, until
    // a real classifier exists for Context.
    reads: ["context"],
    threshold: (ctx) => score(ctx.scoreContextNumeric) < 50,
  },
  {
    key: "expert-quotes",
    dimension: "accuracy",
    title: "Add attributed expert quotes to your about page",
    action:
      "Add 2-3 quotes from industry bodies (e.g. Master Plumbers AU) with attribution and date.",
    expectedImpactScore: "medium",
    reads: ["accuracy"],
    threshold: (ctx) => score(ctx.scoreAccuracy) < 60,
  },
  {
    key: "cited-statistics",
    dimension: "accuracy",
    title: "Cite verifiable statistics on your service pages",
    action: "Add 1-2 industry statistics with source links (e.g. WaterNSW, ABS building permits).",
    expectedImpactScore: "medium",
    reads: ["accuracy"],
    threshold: (ctx) => score(ctx.scoreAccuracy) < 70,
  },
  {
    key: "stale-content",
    // Was "accuracy" (Source citation rate), which has nothing to do with
    // page age. "content" is a display-only Action Center group, not a
    // scoring dimension -- see ACTION_GROUP_LABELS.
    dimension: "content",
    title: "Update pages that haven't changed in 90+ days",
    action: 'Add a "Last updated" date and refresh pricing, availability, and contact details.',
    expectedImpactScore: "high",
    // No score measures page age, so there is no score threshold at all.
    reads: [],
    threshold: () => false,
    evaluate: evaluateStaleContent,
  },
  {
    key: "comparison-article",
    dimension: "position",
    title: "Write a service comparison guide",
    action:
      "Publish a 600-word guide comparing your service type with alternatives, citing pros/cons.",
    expectedImpactScore: "medium",
    reads: ["position"],
    threshold: (ctx) => score(ctx.scorePosition) < 40,
  },
  {
    key: "reddit-absence",
    dimension: "frequency",
    title: "Get mentioned in relevant Reddit threads",
    action:
      "Identify 3 active subreddits (r/sydney, r/ausfinance, r/homeimprovement) and contribute helpful answers.",
    expectedImpactScore: "medium",
    reads: ["frequency"],
    threshold: (ctx) => score(ctx.scoreFrequency) < 45,
  },
  {
    key: "medium-presence",
    dimension: "frequency",
    title: "Publish a how-to article on Medium",
    action:
      "Write a 500-word practical guide on a common customer question. Link back to your service page.",
    expectedImpactScore: "low",
    reads: ["frequency"],
    threshold: (ctx) => score(ctx.scoreFrequency) < 35,
  },
  {
    key: "linkedin-presence",
    dimension: "frequency",
    title: "Create or update your LinkedIn company page",
    action: "Complete all sections: about, services, location. Post one update per fortnight.",
    expectedImpactScore: "low",
    reads: ["frequency"],
    threshold: (ctx) => score(ctx.scoreFrequency) < 30,
  },
  {
    key: "press-mentions",
    dimension: "frequency",
    title: "Pitch your business story to local AU media",
    action:
      "Contact one AU trade publication or local news outlet with a newsworthy angle (e.g. milestone, award).",
    expectedImpactScore: "medium",
    // Score-only: there is no real press-coverage checker behind this.
    // Task #46 Phase 3, Part C: Sentiment is permanently not_measured --
    // this rule's threshold is unreachable (isNotMeasured's gate in
    // scoreSignalFor short-circuits it to false), so it never fires, until
    // a real classifier exists for Sentiment.
    reads: ["frequency", "sentiment"],
    threshold: (ctx) => score(ctx.scoreFrequency) < 40 && score(ctx.scoreSentimentNumeric) > 50,
  },
];

export const UNIVERSAL_RULE_KEYS: readonly string[] = UNIVERSAL_TEMPLATES.map((t) => t.key);

export function evaluateTriggers(
  ctx: TriggerContext,
  evidence: RecommendationEvidence = NO_EVIDENCE,
): TriggeredRecommendation[] {
  const out: TriggeredRecommendation[] = [];
  for (const rule of UNIVERSAL_TEMPLATES) {
    const scoreSignal = scoreSignalFor(rule, ctx);
    const outcome: RuleOutcome | null = rule.evaluate
      ? rule.evaluate({ ctx, evidence, scoreSignal })
      : scoreSignal
        ? { basis: "inferred" }
        : null;
    if (!outcome) continue;
    out.push({
      recommendationKey: outcome.key ?? rule.key,
      dimension: rule.dimension,
      title: outcome.title ?? rule.title,
      action: outcome.action ?? rule.action,
      expectedImpactScore: rule.expectedImpactScore,
      evidenceRefs: outcome.evidenceRefs ?? [],
      confidenceBasis: outcome.basis,
    });
  }
  return out;
}
