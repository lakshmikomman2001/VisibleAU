import { type DimensionKey, resolveDimension } from "@/lib/scoring/dimension-result";
import {
  ENTITY_PROFILES_IMPACT,
  ENTITY_PROFILES_TITLE,
  entityProfilesAction,
} from "./entity-profiles";
import {
  type DatedPage,
  type DirectoryVisibilityFinding,
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
  /** Sri, 21 Oct follow-up: a rule template's own expectedImpactScore is
   * a static per-RULE ceiling -- fine for a rule whose severity doesn't
   * vary, wrong for one like directory-visibility whose real urgency
   * depends on THIS audit's own measured share (1 of 37 answers isn't
   * the same finding as 20 of 37). Overrides the template's static
   * value for this one instance; omitted, every other rule is
   * unaffected. */
  expectedImpactScore?: "high" | "medium" | "low";
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
// directory-visibility -- real evidence only: Part D's read-time citation
// count (lib/directories/citation-counts.ts) + the owner's own confirmed
// status (brand_directory_listings, Part C). Replaces au-local-citations
// (retired -- its checker, checkAuDirectories, requested a hipages
// trade-category page as if it were a business-name search and 404'd for
// almost any real brand; deleted, not fixed, in Part A).
//
// Never says "you're not listed" unless the owner told us so -- a
// directory AI is citing for this brand's category, where the owner has
// never confirmed anything, is framed as "check your status", not as a
// gap. Score-independent by design (reads: [], like stale-content below):
// AI citing someone else's listing on a directory the owner could be on
// is worth flagging whatever today's Frequency score happens to be.
// ---------------------------------------------------------------------------

/** YYYY-MM-DD from an ISO timestamp -- the same plain, locale-independent
 * slice stale-content's own date formatting uses below, never
 * toLocaleDateString() (this runs server-side; the reader's locale isn't
 * available here, and the stored action text must be deterministic). */
function isoDate(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * Sri, 21 Oct follow-up: "A directory cited in 1 of 37 answers
 * shouldn't be 'High' unless the rule justifies it." Priority is now
 * the MEASURED SHARE of this audit's own organic/run-1 answers that
 * cited the directory -- never a flat per-rule guess. A share, not a
 * raw count, so a bigger or smaller prompt pack doesn't move priority
 * on its own. Thresholds are named constants, not inline numbers, so
 * they're one obvious place to revisit (and the one place
 * directory-visibility-priority.test.ts checks them against).
 */
export const DIRECTORY_VISIBILITY_HIGH_SHARE = 0.2; // >= 1 in 5 organic answers
export const DIRECTORY_VISIBILITY_MEDIUM_SHARE = 0.05; // >= 1 in 20 organic answers

export function directoryVisibilityPriority(
  citedCount: number,
  totalAnswers: number,
): "high" | "medium" | "low" {
  if (totalAnswers <= 0) return "low";
  const share = citedCount / totalAnswers;
  if (share >= DIRECTORY_VISIBILITY_HIGH_SHARE) return "high";
  if (share >= DIRECTORY_VISIBILITY_MEDIUM_SHARE) return "medium";
  return "low";
}

const IMPACT_RANK: Record<"high" | "medium" | "low", number> = { high: 2, medium: 1, low: 0 };

/**
 * "The directory recommendation leads with the most-cited directory"
 * (23 Oct), item 3 -- highest share first; totalAnswers is the same
 * audit-wide value for every finding, so citedCount alone already
 * orders by share. Ties broken by name (localeCompare, not `<`, same
 * as components/domain/audit/directories-cited-panel.tsx's own
 * comparator) so two directories cited equally often still sort
 * deterministically, never "whatever order the registry happened to
 * list them in". Returns a new array -- never mutates the caller's.
 */
function byShareThenName(findings: DirectoryVisibilityFinding[]): DirectoryVisibilityFinding[] {
  return [...findings].sort((a, b) => b.citedCount - a.citedCount || a.name.localeCompare(b.name));
}

function evaluateDirectoryVisibility({ evidence }: RuleInput): RuleOutcome | null {
  if (evidence.directories.status !== "ok") return null;
  const { computedAt, findings } = evidence.directories.data;

  // Owner's own profile IS among what AI cited -- nothing to flag,
  // whatever the owner's confirmed status is.
  const flagged = findings.filter((f) => !f.ownerProfileCited);
  if (flagged.length === 0) return null;

  const notListed = flagged.filter((f) => f.ownerStatus === "not_listed");
  const listedNotYours = flagged.filter((f) => f.ownerStatus === "listed");
  const unsureOrNone = flagged.filter((f) => f.ownerStatus === "unsure" || f.ownerStatus === null);

  // Sri, 21 Oct follow-up, item 2: every firing states its own measured
  // n of N -- the SAME organic/run-1/successful sample the headline
  // itself comes from (lib/directories/citation-counts.ts, fed by the
  // identical ORGANIC_ONLY + run_number = 1 predicate
  // resolve-audit-dimensions.ts uses) -- never a vaguer "AI is citing
  // X" with the number left out.
  const citationSummary = (f: (typeof flagged)[number]) =>
    `${f.name} was cited in ${f.citedCount} of ${f.totalAnswers} answers to everyday customer questions (questions that don't name your business) (checked ${isoDate(computedAt)}).`;

  const evidenceRefs: EvidenceRef[] = [];
  for (const f of flagged) {
    for (const citedUrl of f.citedUrls) {
      // The real, un-normalized URL -- an evidence ref is a link to
      // follow, not display copy (citation-counts.ts's own displayUrl
      // is for that, in the panel component instead).
      evidenceRefs.push(checkerRef(f.name, citationSummary(f), citedUrl.url));
    }
    if (f.ownerStatus && f.ownerConfirmedAt) {
      const confirmedSummary =
        f.ownerStatus === "not_listed"
          ? `You told us on ${isoDate(f.ownerConfirmedAt)} that you're not listed on ${f.name}.`
          : `You confirmed your ${f.name} status on ${isoDate(f.ownerConfirmedAt)}.`;
      evidenceRefs.push(checkerRef(f.name, confirmedSummary, null));
    }
  }

  // One sentence per non-empty bucket -- every flagged directory is
  // covered exactly once, whichever bucket it's actually in. Sri, 21
  // Oct follow-up, item 1: the "a mismatch is the most common reason…"
  // line is gone -- we've never measured a cause, only the citation and
  // the owner's own confirmation, so the copy states only those two.
  const sentences: string[] = [];
  if (notListed.length > 0) {
    const names = joinNames(notListed.map((f) => f.name));
    const target = notListed.length === 1 ? "it" : notListed.length === 2 ? "both" : "each of them";
    sentences.push(
      `${notListed.map(citationSummary).join(" ")} You told us you're not listed on ${names} — add your business to ${target}, using exactly the same business name, address and phone number as your website, so AI has a real shot at citing your own listing next time.`,
    );
  }
  if (listedNotYours.length > 0) {
    const names = joinNames(listedNotYours.map((f) => f.name));
    sentences.push(
      `${listedNotYours.map(citationSummary).join(" ")} Your own confirmed ${names} profile was not among those citations. Check that it uses exactly the same business name, address and phone number as your website.`,
    );
  }
  if (unsureOrNone.length > 0) {
    const names = joinNames(unsureOrNone.map((f) => f.name));
    sentences.push(
      `${unsureOrNone.map(citationSummary).join(" ")} You haven't told us whether you're listed on ${names} — confirm your status on the Directory listings card on your brand page, so we can tell you whether AI is citing your own profile.`,
    );
  }
  sentences.push("See the cited pages linked under this recommendation's evidence.");

  // Title: the task's own measured-count format, from the single
  // highest-priority flagged directory (not_listed > listed-not-yours >
  // unsure-or-none, the same order the body covers them in) -- "and N
  // more" when other directories also fired, so the headline number is
  // always one real directory's own count, never a blended one.
  //
  // "The directory recommendation leads with the most-cited directory"
  // (23 Oct), item 3 -- WITHIN whichever status group wins (unchanged:
  // that precedence is deliberate, not a bug this item touches), the
  // one actually NAMED must be the highest-share member of that group,
  // not whichever one lib/directories/registry.ts happens to declare
  // first (hipages at index 0 -- the real production bug: Word of
  // Mouth had the higher count for the SAME audit). totalAnswers is one
  // audit-wide value shared by every finding
  // (lib/directories/citation-counts.ts), so sorting by citedCount
  // alone already sorts by share. Ties broken by name, same comparator
  // components/domain/audit/directories-cited-panel.tsx already uses
  // for the identical reason.
  const lead =
    byShareThenName(notListed)[0] ?? byShareThenName(listedNotYours)[0] ?? byShareThenName(unsureOrNone)[0];
  const leadIsOwnerStatement = notListed.includes(lead) || listedNotYours.includes(lead);
  const leadClause = notListed.includes(lead)
    ? "you told us you're not listed"
    : listedNotYours.includes(lead)
      ? "not your own listing"
      : "confirm your status";
  const moreCount = flagged.length - 1;
  const title = `AI cited ${lead.name} in ${lead.citedCount} of ${lead.totalAnswers} answers — ${leadClause}${
    moreCount > 0 ? `, and ${moreCount} more director${moreCount === 1 ? "y" : "ies"}` : ""
  }`;

  // Priority: the worst (highest) share-based tier across every
  // flagged directory -- see directoryVisibilityPriority's own comment.
  const expectedImpactScore = flagged.reduce<"high" | "medium" | "low">((worst, f) => {
    const p = directoryVisibilityPriority(f.citedCount, f.totalAnswers);
    return IMPACT_RANK[p] > IMPACT_RANK[worst] ? p : worst;
  }, "low");

  return {
    key: "directory-visibility",
    title,
    action: sentences.join(" "),
    // "Honest estimates and labels" (23 Oct), item 2 -- production bug:
    // this was an unconditional "verified", so the unsure-or-none case
    // (lead.ownerStatus is null -- the owner confirmed NOTHING; the
    // title itself only asks them to "confirm your status") still
    // resolved to the "confirmed" ceiling (CONFIDENCE_LEVELS below).
    // "verified" now means what it says: the LEAD finding is one the
    // owner actually told us something about (not_listed or listed-
    // not-yours). The measured-but-unconfirmed case is "inferred" --
    // real evidence (a real citation count), just not a confirmed
    // claim -- which correctly caps it at "likely", never "confirmed".
    basis: leadIsOwnerStatement ? "verified" : "inferred",
    evidenceRefs,
    expectedImpactScore,
  };
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
// The alternatives' copy lives in ./entity-profiles.ts. It no longer
// suggests a Wikidata item: Wikidata has its own notability bar
// (https://www.wikidata.org/wiki/Wikidata:Notability) that a local trade's
// item may not meet.
// ---------------------------------------------------------------------------

export function passesNotabilityGate(n: NotabilityEvidence): boolean {
  const outlets = new Set(n.qualifyingSources.map((s) => s.outlet.toLowerCase()));
  return outlets.size >= 2 && n.qualifyingSources.some((s) => s.scope !== "local");
}

/** The directories this audit's answers cited, most-cited first -- none when the evidence is missing. */
function citedDirectoryNames(evidence: RecommendationEvidence): string[] {
  if (evidence.directories.status !== "ok") return [];
  return byShareThenName(evidence.directories.data.findings).map((f) => f.name);
}

function evaluateWikipedia({ evidence, scoreSignal }: RuleInput): RuleOutcome | null {
  // Relevance gate: Wikipedia/entity profiles are a visibility lever, so
  // every path still needs the low-Frequency signal.
  if (!scoreSignal) return null;
  const wiki = evidence.wikipedia;

  if (wiki.status !== "ok") {
    return {
      key: "entity-profiles",
      title: ENTITY_PROFILES_TITLE,
      action: entityProfilesAction("inferred", citedDirectoryNames(evidence)),
      basis: "inferred",
      expectedImpactScore: ENTITY_PROFILES_IMPACT,
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
    title: ENTITY_PROFILES_TITLE,
    action: entityProfilesAction("verified", citedDirectoryNames(evidence)),
    basis: "verified",
    evidenceRefs: [searchRef],
    expectedImpactScore: ENTITY_PROFILES_IMPACT,
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
    key: "directory-visibility",
    dimension: "frequency",
    title: "AI is citing a directory where your own listing isn't showing up",
    action:
      "Confirm your status on each relevant directory and make sure your profile uses consistent NAP data.",
    expectedImpactScore: "high",
    // Entirely evidence-driven (Part D's real citation count + Part C's
    // owner confirmation) -- no score measures this, so there is no
    // score threshold at all, same as stale-content below.
    reads: [],
    threshold: () => false,
    evaluate: evaluateDirectoryVisibility,
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
      expectedImpactScore: outcome.expectedImpactScore ?? rule.expectedImpactScore,
      evidenceRefs: outcome.evidenceRefs ?? [],
      confidenceBasis: outcome.basis,
    });
  }
  return out;
}
