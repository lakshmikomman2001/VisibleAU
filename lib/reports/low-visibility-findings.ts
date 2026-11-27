import { citedSourcesOf, isBrandDomain } from "@/lib/audit/extract-citations";
import { formatAbn } from "@/lib/brands/abn";
import { linkOrCreateProfilesAction, wasCitedInAnswers } from "@/lib/directories/cited-in-answers";
import { directoryProfileStatus, PROFILE_NOT_LINKED_LABEL } from "@/lib/directories/profile-status";
import { findDirectoryForSource } from "@/lib/directories/registry";
import { isGoogleGroundingRedirect } from "@/lib/llm/web-search-config";
import { classifySourceTypeWithBrand } from "@/lib/visibility/citation-source-classifier";
import { couldNotFindQuote } from "./could-not-find";
import type { FindingsData } from "./report-data";
import type { EvidenceLine, Finding } from "./report-findings";
import { formatCheckDate, plural } from "./report-format";

/**
 * S01 part 3 (LLD 8.1.5, T5): the finding rules g-j, for an audit where AI rarely or never names the business.
 * NumbaTek IT's audit #52 (0%) had no finding at all, so the PDF said "No finding rule matched this audit" and the
 * audit page had no recommended action. Each rule reads only what the audit (or a dated check) measured, and every
 * card shows that evidence:
 *   (g) others are named instead: mentioned in at most 10% of everyday answers, and at least half of them cite
 *       other businesses' own sites (counted by site, not by a model reading names);
 *   (h) AI couldn't find the business: an engine said so, in an answer to a question that names it (appendix C1);
 *   (i) directories where we can't see the listings (S01C, LLD amendment 59): a registry directory outside the
 *       brand's own type that AI cited in at least two
 *       everyday answers, with no linked profile (the brand's own type's directories are rule a, as before);
 *   (j) identity not verified: the ABN isn't verified on the ABR, or no Google Business Profile is linked. By cause
 *       since S01B part 6d (LLD amendment 56): "Your business identity isn't verified yet" for the ABN, "Your Google
 *       Business Profile isn't linked yet" when the ABN is verified and only the profile is missing.
 * Shown only while report_v2 is on for the workspace (the evidence is built only then).
 */

/** What rules g-j read, beyond FindingsData: built by basisAuditEvidence when report_v2 is on. */
export interface LowVisibilityEvidence {
  /** The brand's name, as rule h's title says it. */
  brandName: string;
  /** Successful everyday answers, and how many cited at least one other business's own site. */
  everydayAnswers: number;
  answersCitingOtherBusinesses: number;
  /** Other businesses' sites cited in everyday answers, by the number of answers citing each, most first. */
  businessSites: Array<{ domain: string; answers: number }>;
  /** Each answer to a question that names the business in which an engine said it couldn't find it. */
  couldNotFind: Array<{ engine: string; engineName: string; question: string; quote: string }>;
  /** The brand's identity checks, as last measured. */
  identity: {
    abn: string | null;
    abnVerified: boolean;
    /** The ABR's status ("Active", "Cancelled"), "check_skipped" / "check_failed", or null when never checked. */
    abnStatus: string | null;
    checkedAt: string | null;
    gbpLinked: boolean;
    /** Engines (display names) whose answers in this audit cited abr.business.gov.au. */
    abrCitedBy: string[];
  };
}

/** FindingsData, whose optional `lowVisibility` is set only while report_v2 is on. */
export type LowVisibilityData = FindingsData;

/** Social, maps, search and Q&A hosts: never "another business's site" (rule g). */
const NOT_A_BUSINESS_SITE =
  /(^|\.)(facebook|instagram|twitter|x|tiktok|pinterest|quora|threads|snapchat|whatsapp|messenger|youtube|youtu|google|bing|yahoo|duckduckgo|apple|maps|wikipedia|wikimedia|reddit|medium|substack|tumblr|nextdoor|yelp|trustpilot|tripadvisor|seek|indeed|glassdoor|abr|gov)\.[a-z.]+$|\.gov(\.[a-z]{2})?$|\.edu(\.[a-z]{2})?$/i;

/** The host of a cited business's own site ("kangaroo-it.com.au"), or null for anything else. */
export function otherBusinessSite(
  domain: string | null,
  url: string | null,
  brandDomain: string,
): string | null {
  if (!url || !domain) return null;
  if (isGoogleGroundingRedirect(url)) return null;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  if (!host.includes(".")) return null;
  if (classifySourceTypeWithBrand(url, brandDomain) !== "other") return null;
  if (isBrandDomain(url, brandDomain)) return null;
  if (findDirectoryForSource(domain, url)) return null;
  if (NOT_A_BUSINESS_SITE.test(host)) return null;
  return host;
}

/** The answers rules g and j read, with their cited sources; branded ones with their text. */
export interface LowVisibilityAnswer {
  engine: string;
  engineName: string;
  prompt: string;
  organic: boolean;
  citedSources: unknown;
  responseText: string | null;
}

/** Rules g, h and the citation part of j, counted from the basis audit's run-1 answers. */
export function countLowVisibilityEvidence(
  answers: readonly LowVisibilityAnswer[],
  brandDomain: string,
): Pick<
  LowVisibilityEvidence,
  "everydayAnswers" | "answersCitingOtherBusinesses" | "businessSites" | "couldNotFind"
> & { abrCitedBy: string[] } {
  const bySite = new Map<string, number>();
  const abrCitedBy = new Set<string>();
  let everydayAnswers = 0;
  let answersCitingOtherBusinesses = 0;
  const couldNotFind: LowVisibilityEvidence["couldNotFind"] = [];
  for (const a of answers) {
    const entries = citedSourcesOf<{ domain?: unknown; url?: unknown }>(a.citedSources);
    for (const e of entries) {
      const url = typeof e.url === "string" ? e.url : "";
      if (/(^|\/\/|\.)abr\.business\.gov\.au/i.test(url)) abrCitedBy.add(a.engineName);
    }
    if (a.organic) {
      everydayAnswers += 1;
      const sites = new Set<string>();
      for (const e of entries) {
        const site = otherBusinessSite(
          typeof e.domain === "string" ? e.domain : null,
          typeof e.url === "string" ? e.url : null,
          brandDomain,
        );
        if (site) sites.add(site);
      }
      if (sites.size > 0) answersCitingOtherBusinesses += 1;
      for (const s of sites) bySite.set(s, (bySite.get(s) ?? 0) + 1);
    } else {
      const quote = couldNotFindQuote(a.responseText);
      if (quote)
        couldNotFind.push({
          engine: a.engine,
          engineName: a.engineName,
          question: a.prompt,
          quote,
        });
    }
  }
  const businessSites = [...bySite.entries()]
    .map(([domain, n]) => ({ domain, answers: n }))
    .sort((x, y) => y.answers - x.answers || x.domain.localeCompare(y.domain));
  return {
    everydayAnswers,
    answersCitingOtherBusinesses,
    businessSites,
    couldNotFind,
    abrCitedBy: [...abrCitedBy].sort(),
  };
}

const HIGH = { label: "High impact", short: "High", tone: "high" } as const;
const MEDIUM = { label: "Medium impact", short: "Medium", tone: "med" } as const;

/** Rule g's thresholds (LLD 8.1.5): mentioned in at most 10%, others cited in at least half. */
export const OTHERS_NAMED_MAX_MENTION_SHARE = 0.1;
export const OTHERS_NAMED_MIN_ANSWER_SHARE = 0.5;
/** Rule i: cited in at least this many everyday answers (rule a's threshold too). */
export const DIRECTORY_MIN_CITED = 2;

/** "your profile: not linked yet": the evidence lines' words, in lower case (LLD amendment 56). */
const NOT_LINKED_YET = PROFILE_NOT_LINKED_LABEL.toLowerCase();

function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function othersNamedFinding(data: LowVisibilityData): Finding | null {
  const lv = data.lowVisibility;
  if (!lv || data.sampleCount === 0 || lv.everydayAnswers === 0) return null;
  if (data.mentionedCount / data.sampleCount > OTHERS_NAMED_MAX_MENTION_SHARE) return null;
  if (lv.answersCitingOtherBusinesses / lv.everydayAnswers < OTHERS_NAMED_MIN_ANSWER_SHARE)
    return null;
  const top = lv.businessSites.slice(0, 3);
  if (top.length === 0) return null;
  const sites = top.map((s, i) =>
    i === 0
      ? `${s.domain} (${s.answers} ${plural(s.answers, "answer")})`
      : `${s.domain} (${s.answers})`,
  );
  return {
    rule: "g",
    kind: "risk",
    icon: "competitor",
    title: "AI recommends other providers instead",
    explanation: `AI named you in ${data.mentionedCount} of ${data.sampleCount} everyday answers, and ${lv.answersCitingOtherBusinesses} of ${lv.everydayAnswers} cited other businesses' own sites: the sites it cited most were ${list(sites)}.`,
    severity: HIGH,
    evidenceLabel: `Evidence · Audit #${data.basis.auditNumber} · ${lv.everydayAnswers} everyday answers`,
    evidence: top.map(
      (s): EvidenceLine => [
        { text: `${s.domain} → `, tone: "plain" },
        { text: `cited in ${s.answers} of ${lv.everydayAnswers} answers`, tone: "cmp" },
      ],
    ),
    fix: "Compare these providers' pages and listings with yours: the services, suburbs and reviews they show",
    recommendation: {
      title: "See why AI recommends other providers",
      detail: `The sites AI cited most were ${list(sites)}; you were named in ${data.mentionedCount} of ${data.sampleCount} answers.`,
    },
  };
}

/** Rule h's quotes, one per engine and sentence, each with every question it answered, in the order first met. */
function sameQuoteOnce(
  quotes: LowVisibilityEvidence["couldNotFind"],
): Array<{ engineName: string; quote: string; questions: string[] }> {
  const groups = new Map<string, { engineName: string; quote: string; questions: string[] }>();
  for (const c of quotes) {
    const key = `${c.engine}\u0000${c.quote}`;
    const group = groups.get(key);
    if (group) {
      if (!group.questions.includes(c.question)) group.questions.push(c.question);
    } else groups.set(key, { engineName: c.engineName, quote: c.quote, questions: [c.question] });
  }
  return [...groups.values()];
}

function couldNotFindFinding(data: LowVisibilityData): Finding | null {
  const lv = data.lowVisibility;
  if (!lv || lv.couldNotFind.length === 0) return null;
  const brandName = lv.brandName;
  const first = lv.couldNotFind[0];
  const engines = [...new Set(lv.couldNotFind.map((c) => c.engineName))];
  return {
    rule: "h",
    kind: "risk",
    icon: "silent",
    title: `${list(engines)} couldn't find information about ${brandName}`,
    explanation: `Asked about ${brandName} by name, ${first.engineName} said: “${first.quote}”`,
    severity: HIGH,
    evidenceLabel: `Evidence · Audit #${data.basis.auditNumber} · questions that name the business`,
    // S01B part 6f (LLD amendment 56): an engine that gave the same sentence to several questions is quoted once,
    // followed by the questions (Kurrajong's printed one Claude sentence three times).
    evidence: sameQuoteOnce(lv.couldNotFind)
      .slice(0, 3)
      .map(
        (c): EvidenceLine => [
          { text: `${c.engineName} → `, tone: "plain" },
          { text: `“${c.quote}”`, tone: "abs" },
          { text: ` · asked ${list(c.questions.map((q) => `“${q}”`))}`, tone: "plain" },
        ],
      ),
    fix: "Make your business easy to confirm: the same name, address and services on your site, Google Business Profile and directory listings",
    recommendation: {
      title: `Help AI find ${brandName}`,
      detail: `${first.engineName}, asked “${first.question}”, said: “${first.quote}”`,
    },
  };
}

/**
 * Rule i's directories: beyond the brand's type, cited at least DIRECTORY_MIN_CITED times, profile not linked; most
 * cited first, at most 4. None while report_v2 is off. S04 part 0g: rule b leaves out the ones this names.
 */
export function directoriesNotOnRows(data: LowVisibilityData) {
  if (!data.lowVisibility) return [];
  return data.directories.rows
    .filter(
      (r) =>
        r.relevantToBrand === false && r.citedCount >= DIRECTORY_MIN_CITED && !r.ownerProfileLinked,
    )
    .sort((a, b) => b.citedCount - a.citedCount || a.name.localeCompare(b.name))
    .slice(0, 4);
}

function directoriesNotOnFinding(data: LowVisibilityData): Finding | null {
  if (!data.lowVisibility) return null;
  const total = data.directories.totalAnswers;
  const rows = directoriesNotOnRows(data);
  if (rows.length === 0) return null;
  const names = rows.map((r) => r.name);
  return {
    rule: "i",
    kind: "risk",
    icon: "directory",
    // S01C part 2a (LLD amendment 59): we only know a profile isn't linked, never that the business isn't listed.
    title: "AI also cites directories where we can't see your listings yet",
    explanation: `Beyond the usual directories for your type of business, AI cited ${list(names)} for these questions.`,
    severity: MEDIUM,
    evidenceLabel: `Evidence · Audit #${data.basis.auditNumber} · ${total} everyday answers`,
    evidence: rows.map((r): EvidenceLine => {
      const status = directoryProfileStatus(r);
      return [
        { text: `${r.name} → `, tone: "plain" },
        { text: `cited in ${r.citedCount} of ${total} answers`, tone: "cmp" },
        { text: " · ", tone: "plain" },
        {
          // S01B part 6e (LLD amendment 56): "your profile: not linked yet" in lower case, as rule a prints it.
          text: `your profile: ${status.kind === "not_linked" ? NOT_LINKED_YET : status.label}`,
          tone: "abs",
        },
      ];
    }),
    fix: linkOrCreateProfilesAction(names),
    // S01C part 2a: Recommended next in item 1's style ("Local Business Guide and Whereis were each cited in 5 of 40
    // answers and Birdeye in 4; none of them is linked yet"); it repeated "was cited in ... of 40 answers" per
    // directory and said "Get listed on ...".
    recommendation: {
      title: `Link or create your ${list(names)} ${plural(names.length, "profile")}`,
      detail: `${wasCitedInAnswers(rows, total)}; ${rows.length === 1 ? "it isn't linked yet" : "none of them is linked yet"}.`,
    },
  };
}

function identityFinding(data: LowVisibilityData): Finding | null {
  const lv = data.lowVisibility;
  if (!lv) return null;
  const id = lv.identity;
  if (id.abnVerified && id.gbpLinked) return null;
  // S01B part 6e (LLD amendment 56): the ABN in groups ("51 824 753 557"), not "ABN → ABN 51824753557".
  const abn = id.abn ? formatAbn(id.abn) : null;
  const notChecked =
    id.abnStatus === "check_skipped" || id.abnStatus === "check_failed" || id.abnStatus === null;
  const abnLine = !abn
    ? "No ABN on file"
    : notChecked
      ? `${abn}: not checked yet`
      : id.abnVerified
        ? `${abn}: ${id.abnStatus} on the ABR`
        : `${abn}: ${id.abnStatus} on the ABR, not verified`;
  // S01B part 6d (LLD amendment 56): the title and sentence say which check failed, and nothing claims what AI
  // engines read (the earlier "AI engines read the ABR" is gone; an engine that cited the ABR is in the evidence).
  // ABN verified, no Google Business Profile: the profile, never "identity isn't verified" beside a tile that says
  // "ABN verified" (Bluegum's PDFs).
  const gbpOnly = id.abnVerified;
  const abrResult = !abn
    ? "There's no ABN in brand settings yet, so we can't check your business on the Australian Business Register"
    : notChecked
      ? "Your ABN hasn't been checked on the Australian Business Register yet"
      : `The Australian Business Register lists your ABN as ${id.abnStatus}, so it isn't verified`;
  const sentence = gbpOnly
    ? "Your ABN is active on the Australian Business Register, but no Google Business Profile is linked in brand settings."
    : `${abrResult}${id.gbpLinked ? "" : ", and no Google Business Profile is linked in brand settings"}.`;
  return {
    rule: "j",
    kind: "watch",
    icon: "failed",
    title: gbpOnly
      ? "Your Google Business Profile isn't linked yet"
      : "Your business identity isn't verified yet",
    explanation: sentence,
    severity: MEDIUM,
    evidenceLabel: "Evidence · identity checks",
    evidence: [
      [
        { text: "ABN → ", tone: "plain" },
        { text: abnLine, tone: id.abnVerified ? "pos" : "abs" },
        // S01B part 6e: dates as "22 Nov 2026", as the identity tile prints them.
        ...(id.checkedAt
          ? [{ text: ` · checked ${formatCheckDate(id.checkedAt)}`, tone: "plain" as const }]
          : []),
      ],
      [
        { text: "Google Business Profile → ", tone: "plain" },
        { text: id.gbpLinked ? "linked" : "not linked yet", tone: id.gbpLinked ? "pos" : "abs" },
      ],
      ...(id.abrCitedBy.length > 0
        ? [
            [
              { text: "abr.business.gov.au → ", tone: "plain" as const },
              { text: `cited by ${list(id.abrCitedBy)}`, tone: "cmp" as const },
            ],
          ]
        : []),
    ],
    fix: !id.abnVerified
      ? "Add your ABN in brand settings so we can check it on the Australian Business Register"
      : "Link your Google Business Profile in brand settings",
    // S01C part 2c (LLD amendment 61): the title follows the cause. The real report said "Verify your ABN" for a
    // brand with no ABN.
    recommendation: {
      title: !abn
        ? `Add your ABN${id.gbpLinked ? "" : " and link your Google Business Profile"}`
        : id.abnVerified
          ? "Link your Google Business Profile"
          : "Verify your ABN",
      detail: sentence,
    },
  };
}

/** Rules g, h, i, j in that order, each only when its condition holds and report_v2 built the evidence. */
export function lowVisibilityFindings(data: LowVisibilityData): Finding[] {
  return [
    othersNamedFinding(data),
    couldNotFindFinding(data),
    directoriesNotOnFinding(data),
    identityFinding(data),
  ].filter((f): f is Finding => f !== null);
}
