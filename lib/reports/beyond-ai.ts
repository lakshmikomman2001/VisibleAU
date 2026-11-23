import { and, count, desc, eq, gt, lte } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import {
  brandEntityScores,
  crawlerVisitLogs,
  technicalAudits,
  youtubePresenceAudits,
} from "@/db/schema";
import { getDirectoryCitationsForAudit } from "@/lib/directories/citation-counts";
import { SEARCH_CRAWLERS } from "@/lib/robots-txt/evaluate";
import { crawlReach } from "@/lib/technical-audit/crawl-status";
import {
  isScoredCheck,
  type TechnicalDimensionKey,
  technicalScoringOf,
} from "@/lib/technical-audit/scoring-version";
import { TRUST_CHECK_IMPLEMENTED } from "@/lib/trust/stub-implementation-status";

/**
 * S01 part 6 (LLD 8.1.4, contract P07.beyond / P09.beyond): the checks outside AI answers -- business identity, YouTube,
 * AI crawlers, the website's technical score and (PDF only) the brand's directory profiles -- each from its module's
 * latest real result at or before `asOf` (the report's generation time; now on the audit page). One server function
 * (`getBeyondAiAnswers`) feeds the audit page card, the PDF page and the client portal, and one copy function
 * (`beyondTileView`) words every tile for all three. None of it is ever counted in the Visibility score.
 *
 * "Not checked" is never shown as a measured zero: a tile with no result says so, with how to get one. A result older
 * than 30 days before `asOf` says "Last checked {date}, may be out of date". A check that ran and didn't complete
 * prints "Couldn't check on {date}: {reason}".
 */

export const BEYOND_STALE_DAYS = 30;
export const BEYOND_FOOTER =
  "These checks are separate from the Visibility score and don't change it.";
const DAY_MS = 24 * 60 * 60 * 1000;
const VISIT_WINDOW_DAYS = 30;

export type BeyondTileStatus = "measured" | "not_checked" | "failed";

interface TileBase {
  status: BeyondTileStatus;
  /** When the result was produced (ISO); null when there is none. */
  checkedAt: string | null;
  /** Older than BEYOND_STALE_DAYS before asOf. */
  stale: boolean;
  /** Why the check didn't complete (status "failed"), in plain words. */
  failure: string | null;
}

export interface IdentityTile extends TileBase {
  /** The brand has an ABN on file (brands.abn) or the last check carried one. */
  abnOnFile: boolean;
  abn: string | null;
  abnStatus: string | null;
  abnVerified: boolean;
  entity: string | null;
  auDomain: boolean;
  wikipedia: boolean | null;
}

export type YoutubeState = "found" | "not_linked" | "mismatch" | "unconfirmed" | "unavailable";

export interface YoutubeTile extends TileBase {
  state: YoutubeState;
  channelTitle: string | null;
  videos: number | null;
  lastUploadAt: string | null;
}

export interface CrawlersTile extends TileBase {
  searchAllowed: string[];
  searchBlocked: string[];
  total: number;
  visits: {
    status: "measured" | "not_measured";
    total: number;
    byCrawler: Array<{ name: string; visits: number }>;
  };
}

export interface TechnicalTile extends TileBase {
  score: number | null;
  max: number | null;
  scoringVersion: number | null;
  /** The two checks furthest from their maximum (scored checks only). */
  weakest: Array<{ label: string; score: number; max: number }>;
}

export interface DirectoriesTile {
  basisAuditId: string;
  linked: number;
  cited: number;
  /** Top 6 by citations, each cited in at least one answer. */
  items: Array<{ name: string; linked: boolean; citedIn: number }>;
}

export interface BeyondAiAnswers {
  asOf: string;
  identity: IdentityTile;
  youtube: YoutubeTile;
  crawlers: CrawlersTile;
  technical: TechnicalTile;
  /** The PDF's fifth tile: only when a basis audit is given. */
  directories: DirectoriesTile | null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Raw rows (what the loader reads) and the pure builder.

export interface BeyondAiRaw {
  brand: { abn: string | null; youtubeChannelUrl: string | null; domain: string };
  entity: {
    abnVerified: boolean;
    abnNumber: string | null;
    abnEntityName: string | null;
    abnStatus: string | null;
    wikipediaAuPresent: boolean;
    auTldDomains: unknown;
    checkedAt: Date;
  } | null;
  youtube: {
    checkStatus: string | null;
    unavailableReason: string | null;
    channelTitle: string | null;
    channelTotalVideos: number | null;
    lastUploadAt: Date | null;
    gaps: unknown;
    auditedAt: Date;
  } | null;
  /** Whether the YouTube check runs at all (TRUST_CHECK_IMPLEMENTED.youtubePresence). */
  youtubeGateOn: boolean;
  technical: {
    scoreComposite: string | null;
    findings: unknown;
    createdAt: Date;
    dims: Partial<Record<TechnicalDimensionKey, string | null>>;
  } | null;
  visits: Array<{ name: string; visits: number }>;
  directories: DirectoriesTile | null;
}

const TECHNICAL_LABELS: Record<TechnicalDimensionKey, string> = {
  scoreRobots: "Robots.txt",
  scoreLlmsTxt: "llms.txt",
  scoreSchema: "Schema markup",
  scoreMeta: "Meta tags",
  scoreContent: "Content quality",
  scoreBrandEntity: "Brand & Entity",
  scoreSignals: "Signals",
  scoreAiDiscovery: "AI Discovery",
};

const YOUTUBE_FAILURE: Record<string, string> = {
  quota_exceeded: "YouTube's daily lookup limit was reached",
  network_error: "YouTube didn't answer",
};

function isStale(checkedAt: Date | null, asOf: Date): boolean {
  return checkedAt !== null && asOf.getTime() - checkedAt.getTime() > BEYOND_STALE_DAYS * DAY_MS;
}

function base(
  checkedAt: Date | null,
  asOf: Date,
  status: BeyondTileStatus,
  failure: string | null = null,
): TileBase {
  return {
    status,
    checkedAt: checkedAt?.toISOString() ?? null,
    stale: isStale(checkedAt, asOf),
    failure,
  };
}

function auDomainOf(domain: string, stored: unknown): boolean {
  if (Array.isArray(stored) && stored.length > 0) return true;
  const lower = domain.toLowerCase();
  return [".com.au", ".net.au", ".org.au", ".edu.au", ".gov.au", ".asn.au", ".id.au"].some((t) =>
    lower.endsWith(t),
  );
}

function buildIdentity(raw: BeyondAiRaw, asOf: Date): IdentityTile {
  const e = raw.entity;
  const brandAbn = raw.brand.abn?.replace(/\s/g, "") || null;
  const abn = brandAbn ?? (e?.abnNumber || null);
  const common = {
    abnOnFile: abn !== null,
    abn,
    abnStatus: e?.abnStatus ?? null,
    abnVerified: e?.abnVerified ?? false,
    entity: e?.abnEntityName ?? null,
    auDomain: auDomainOf(raw.brand.domain, e?.auTldDomains),
    wikipedia: e ? e.wikipediaAuPresent : null,
  };
  if (!e) return { ...base(null, asOf, "not_checked"), ...common };
  if (e.abnStatus === "check_failed") {
    return {
      ...base(e.checkedAt, asOf, "failed", "the Australian Business Register didn't answer"),
      ...common,
    };
  }
  // No GUID, or ABN_LOOKUP_BYPASS: the lookup never ran (operator log, not a customer reason).
  if (e.abnStatus === "check_skipped")
    return { ...base(e.checkedAt, asOf, "not_checked"), ...common };
  return { ...base(e.checkedAt, asOf, "measured"), ...common };
}

function buildYoutube(raw: BeyondAiRaw, asOf: Date): YoutubeTile {
  const y = raw.youtube;
  const empty = { channelTitle: null, videos: null, lastUploadAt: null };
  if (!raw.youtubeGateOn)
    return { ...base(null, asOf, "not_checked"), state: "unavailable", ...empty };
  if (!y) {
    return raw.brand.youtubeChannelUrl
      ? { ...base(null, asOf, "not_checked"), state: "unavailable", ...empty }
      : { ...base(null, asOf, "measured"), state: "not_linked", ...empty };
  }
  const at = y.auditedAt;
  if (y.checkStatus === "unavailable") {
    const failure = y.unavailableReason ? (YOUTUBE_FAILURE[y.unavailableReason] ?? null) : null;
    return failure
      ? { ...base(at, asOf, "failed", failure), state: "unavailable", ...empty }
      : { ...base(null, asOf, "not_checked"), state: "unavailable", ...empty };
  }
  if (y.checkStatus === "confirmed") {
    return {
      ...base(at, asOf, "measured"),
      state: "found",
      channelTitle: y.channelTitle,
      videos: y.channelTotalVideos,
      lastUploadAt: y.lastUploadAt?.toISOString() ?? null,
    };
  }
  if (y.checkStatus === "unconfirmed") {
    const gaps = Array.isArray(y.gaps) ? y.gaps : [];
    return {
      ...base(at, asOf, "measured"),
      state: gaps[0] === "domain_mismatch" ? "mismatch" : "unconfirmed",
      channelTitle: y.channelTitle,
      videos: null,
      lastUploadAt: null,
    };
  }
  // not_found, or a row from before check_status existed: no channel is linked to the brand.
  return { ...base(at, asOf, "measured"), state: "not_linked", ...empty };
}

interface RobotsFindingsLike {
  aiBotsAllowed?: unknown;
  aiBotsBlocked?: unknown;
  fetchStatus?: unknown;
  botVerdicts?: unknown;
}

function stringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function buildCrawlers(raw: BeyondAiRaw, asOf: Date): CrawlersTile {
  const total = SEARCH_CRAWLERS.length;
  const visitsTotal = raw.visits.reduce((s, v) => s + v.visits, 0);
  const visits: CrawlersTile["visits"] =
    visitsTotal > 0
      ? { status: "measured", total: visitsTotal, byCrawler: raw.visits }
      : { status: "not_measured", total: 0, byCrawler: [] };
  const t = raw.technical;
  const robots = (t?.findings as { robots?: RobotsFindingsLike } | null)?.robots;
  if (!t || !robots) {
    return {
      ...base(null, asOf, "not_checked"),
      searchAllowed: [],
      searchBlocked: [],
      total,
      visits,
    };
  }
  if (robots.fetchStatus === "unreachable") {
    return {
      ...base(t.createdAt, asOf, "failed", "your robots.txt didn't answer"),
      searchAllowed: [],
      searchBlocked: [],
      total,
      visits,
    };
  }
  // A site with no robots.txt allows every crawler (RFC 9309): read the evaluator's verdicts when they exist.
  const verdicts = Array.isArray(robots.botVerdicts)
    ? (robots.botVerdicts as Array<{ userAgent?: unknown; verdict?: unknown }>)
    : null;
  const searchAllowed = verdicts
    ? SEARCH_CRAWLERS.filter((ua) =>
        verdicts.some((v) => v.userAgent === ua && v.verdict === "allowed"),
      )
    : stringList(robots.aiBotsAllowed);
  const searchBlocked = stringList(robots.aiBotsBlocked);
  return { ...base(t.createdAt, asOf, "measured"), searchAllowed, searchBlocked, total, visits };
}

function buildTechnical(raw: BeyondAiRaw, asOf: Date): TechnicalTile {
  const t = raw.technical;
  const empty = { score: null, max: null, scoringVersion: null, weakest: [] };
  if (!t) return { ...base(null, asOf, "not_checked"), ...empty };
  const scoring = technicalScoringOf({ createdAt: t.createdAt, findings: t.findings });
  if (t.scoreComposite === null) {
    const siteReached = crawlReach(t.findings).kind !== "unreached";
    return {
      ...base(
        t.createdAt,
        asOf,
        "failed",
        siteReached ? "one of its checks couldn't be measured" : "we couldn't reach your website",
      ),
      ...empty,
      max: scoring.compositeMax,
      scoringVersion: scoring.version,
    };
  }
  const weakest = (Object.keys(TECHNICAL_LABELS) as TechnicalDimensionKey[])
    .filter((k) => isScoredCheck(scoring, k) && t.dims[k] != null)
    .map((k) => ({
      label: TECHNICAL_LABELS[k],
      score: Number(t.dims[k]),
      max: scoring.dimensionMax[k],
    }))
    .sort((a, b) => a.score / a.max - b.score / b.max || b.max - a.max)
    .slice(0, 2)
    .map((w) => ({ ...w, score: Math.round(w.score) }));
  return {
    ...base(t.createdAt, asOf, "measured"),
    score: Math.round(Number(t.scoreComposite)),
    max: scoring.compositeMax,
    scoringVersion: scoring.version,
    weakest,
  };
}

export function buildBeyondAiAnswers(raw: BeyondAiRaw, asOf: Date): BeyondAiAnswers {
  return {
    asOf: asOf.toISOString(),
    identity: buildIdentity(raw, asOf),
    youtube: buildYoutube(raw, asOf),
    crawlers: buildCrawlers(raw, asOf),
    technical: buildTechnical(raw, asOf),
    directories: raw.directories,
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// The loader: one indexed query per module (LLD 13: "Beyond-AI data read with 4 indexed queries"), plus the basis
// audit's directory citations for the PDF tile. `db` must already be RLS-scoped to the brand's workspace.

export interface BeyondAiBrand {
  id: string;
  name: string;
  domain: string;
  region: string;
  categories: readonly string[];
  abn: string | null;
  youtubeChannelUrl: string | null;
  suburb?: string | null;
  state?: string | null;
  postcode?: string | null;
}

export async function getBeyondAiAnswers(
  db: DbClient,
  input: { brand: BeyondAiBrand; asOf: Date; basisAuditId?: string | null },
): Promise<BeyondAiAnswers> {
  const { brand, asOf } = input;
  const visitsFrom = new Date(asOf.getTime() - VISIT_WINDOW_DAYS * DAY_MS);
  const [[entity], [youtube], [technical], visitRows, directoryCitations] = await Promise.all([
    db
      .select({
        abnVerified: brandEntityScores.abnVerified,
        abnNumber: brandEntityScores.abnNumber,
        abnEntityName: brandEntityScores.abnEntityName,
        abnStatus: brandEntityScores.abnStatus,
        wikipediaAuPresent: brandEntityScores.wikipediaAuPresent,
        auTldDomains: brandEntityScores.auTldDomains,
        checkedAt: brandEntityScores.checkedAt,
      })
      .from(brandEntityScores)
      .where(and(eq(brandEntityScores.brandId, brand.id), lte(brandEntityScores.checkedAt, asOf)))
      .orderBy(desc(brandEntityScores.checkedAt))
      .limit(1),
    db
      .select({
        checkStatus: youtubePresenceAudits.checkStatus,
        unavailableReason: youtubePresenceAudits.unavailableReason,
        channelTitle: youtubePresenceAudits.channelTitle,
        channelTotalVideos: youtubePresenceAudits.channelTotalVideos,
        lastUploadAt: youtubePresenceAudits.lastUploadAt,
        gaps: youtubePresenceAudits.gaps,
        auditedAt: youtubePresenceAudits.auditedAt,
      })
      .from(youtubePresenceAudits)
      .where(
        and(
          eq(youtubePresenceAudits.brandId, brand.id),
          lte(youtubePresenceAudits.auditedAt, asOf),
        ),
      )
      .orderBy(desc(youtubePresenceAudits.auditedAt))
      .limit(1),
    db
      .select({
        scoreComposite: technicalAudits.scoreComposite,
        findings: technicalAudits.findings,
        createdAt: technicalAudits.createdAt,
        scoreRobots: technicalAudits.scoreRobots,
        scoreLlmsTxt: technicalAudits.scoreLlmsTxt,
        scoreSchema: technicalAudits.scoreSchema,
        scoreMeta: technicalAudits.scoreMeta,
        scoreContent: technicalAudits.scoreContent,
        scoreBrandEntity: technicalAudits.scoreBrandEntity,
        scoreSignals: technicalAudits.scoreSignals,
        scoreAiDiscovery: technicalAudits.scoreAiDiscovery,
      })
      .from(technicalAudits)
      .where(and(eq(technicalAudits.brandId, brand.id), lte(technicalAudits.createdAt, asOf)))
      .orderBy(desc(technicalAudits.createdAt))
      .limit(1),
    db
      .select({ name: crawlerVisitLogs.crawlerName, visits: count() })
      .from(crawlerVisitLogs)
      .where(
        and(
          eq(crawlerVisitLogs.brandId, brand.id),
          gt(crawlerVisitLogs.visitedAt, visitsFrom),
          lte(crawlerVisitLogs.visitedAt, asOf),
        ),
      )
      .groupBy(crawlerVisitLogs.crawlerName),
    input.basisAuditId
      ? getDirectoryCitationsForAudit(db, input.basisAuditId, brand, asOf)
      : Promise.resolve(null),
  ]);

  const directories: DirectoriesTile | null =
    input.basisAuditId && directoryCitations
      ? (() => {
          const cited = directoryCitations.results
            .filter((r) => r.citedCount > 0)
            .sort(
              (a, b) =>
                b.citedCount - a.citedCount || a.directory.name.localeCompare(b.directory.name),
            );
          return {
            basisAuditId: input.basisAuditId,
            linked: cited.filter((r) => r.ownerProfileLinked).length,
            cited: cited.length,
            items: cited.slice(0, 6).map((r) => ({
              name: r.directory.name,
              linked: r.ownerProfileLinked,
              citedIn: r.citedCount,
            })),
          };
        })()
      : null;

  const answers = buildBeyondAiAnswers(
    {
      brand: { abn: brand.abn, youtubeChannelUrl: brand.youtubeChannelUrl, domain: brand.domain },
      entity: entity ?? null,
      youtube: youtube ?? null,
      youtubeGateOn: TRUST_CHECK_IMPLEMENTED.youtubePresence,
      technical: technical
        ? {
            scoreComposite: technical.scoreComposite,
            findings: technical.findings,
            createdAt: technical.createdAt,
            dims: {
              scoreRobots: technical.scoreRobots,
              scoreLlmsTxt: technical.scoreLlmsTxt,
              scoreSchema: technical.scoreSchema,
              scoreMeta: technical.scoreMeta,
              scoreContent: technical.scoreContent,
              scoreBrandEntity: technical.scoreBrandEntity,
              scoreSignals: technical.scoreSignals,
              scoreAiDiscovery: technical.scoreAiDiscovery,
            },
          }
        : null,
      visits: visitRows
        .map((r) => ({ name: r.name, visits: Number(r.visits) }))
        .sort((a, b) => b.visits - a.visits || a.name.localeCompare(b.name)),
      directories,
    },
    asOf,
  );
  logNotChecked(brand.id, answers, entity?.abnStatus ?? null, youtube?.unavailableReason ?? null);
  return answers;
}

/** Operator log: why a check shows "Not checked" (the customer sees no reason; LLD 8.1.4, S01 part 6). */
function logNotChecked(
  brandId: string,
  answers: BeyondAiAnswers,
  abnStatus: string | null,
  youtubeReason: string | null,
): void {
  const reasons: Array<{ check: string; reason: string }> = [];
  if (answers.identity.status === "not_checked" && abnStatus === "check_skipped") {
    reasons.push({
      check: "identity",
      reason: "abn_lookup_skipped (ABN_LOOKUP_GUID unset or ABN_LOOKUP_BYPASS set)",
    });
  }
  if (answers.youtube.status === "not_checked") {
    reasons.push({
      check: "youtube",
      reason: !TRUST_CHECK_IMPLEMENTED.youtubePresence
        ? "youtube_check_gate_off"
        : (youtubeReason ?? "no_result_for_linked_channel"),
    });
  }
  if (reasons.length > 0) {
    console.info(JSON.stringify({ event: "beyond_ai_not_checked", brandId, reasons }));
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Copy: one wording for the audit page card, the PDF page and the portal (contract P07.beyond, P09.beyond).

export type BeyondTone = "good" | "warn" | "bad" | "neutral";

export interface BeyondTileView {
  key: "identity" | "youtube" | "crawlers" | "technical";
  label: string;
  pill: { text: string; tone: BeyondTone } | null;
  /** The technical tile's figure: "{score}" and "of {max}". */
  value: { main: string; of: string } | null;
  lines: Array<{ text: string; tone?: "warn" }>;
  action: { text: string; href: string } | null;
}

export function formatCheckDate(iso: string, timeZone = "Australia/Sydney"): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  });
}

function dateLines(tile: TileBase): Array<{ text: string; tone?: "warn" }> {
  if (!tile.checkedAt) return [];
  if (tile.status === "failed")
    return [
      {
        text: `Couldn't check on ${formatCheckDate(tile.checkedAt)}: ${tile.failure}`,
        tone: "warn",
      },
    ];
  return tile.stale
    ? [
        {
          text: `Last checked ${formatCheckDate(tile.checkedAt)}, may be out of date`,
          tone: "warn",
        },
      ]
    : [];
}

function formatAbn(abn: string): string {
  return /^\d{11}$/.test(abn)
    ? `${abn.slice(0, 2)} ${abn.slice(2, 5)} ${abn.slice(5, 8)} ${abn.slice(8)}`
    : abn;
}

const NOT_CHECKED = { text: "Not checked yet", tone: "neutral" as const };

export function identityView(t: IdentityTile, brandId: string): BeyondTileView {
  const label = "Business identity";
  const extras = `.au domain ${t.auDomain ? "✓" : "no"} · Wikipedia: ${t.wikipedia === null ? "not checked" : t.wikipedia ? "article found" : "no article"}`;
  if (!t.abnOnFile) {
    return {
      key: "identity",
      label,
      pill: { text: "No ABN on file", tone: "neutral" },
      value: null,
      lines: t.checkedAt ? [{ text: extras }] : [],
      action: { text: "Add your ABN", href: `/brands/${brandId}` },
    };
  }
  if (t.status === "not_checked") {
    return {
      key: "identity",
      label,
      pill: NOT_CHECKED,
      value: null,
      lines: [{ text: `ABN ${formatAbn(t.abn ?? "")}` }],
      action: null,
    };
  }
  if (t.status === "failed") {
    return {
      key: "identity",
      label,
      pill: { text: "Not checked", tone: "neutral" },
      value: null,
      lines: [{ text: `ABN ${formatAbn(t.abn ?? "")}` }, ...dateLines(t)],
      action: null,
    };
  }
  const checked = t.checkedAt ? ` · checked ${formatCheckDate(t.checkedAt)}` : "";
  const facts = [t.abnStatus, t.entity].filter(Boolean).join(" · ");
  return {
    key: "identity",
    label,
    pill: t.abnVerified
      ? { text: "ABN verified", tone: "good" }
      : { text: "ABN not verified", tone: "warn" },
    value: null,
    lines: [
      { text: `${facts || `ABN ${formatAbn(t.abn ?? "")}`}${checked}` },
      { text: extras },
      ...dateLines(t),
    ],
    action: null,
  };
}

export function youtubeView(t: YoutubeTile, brandId: string): BeyondTileView {
  const label = "YouTube";
  const href = `/brands/${brandId}/trust/youtube-presence`;
  const checked = t.checkedAt ? [{ text: `checked ${formatCheckDate(t.checkedAt)}` }] : [];
  if (t.status === "not_checked")
    return {
      key: "youtube",
      label,
      pill: { text: "Not checked", tone: "neutral" },
      value: null,
      lines: [],
      action: null,
    };
  if (t.status === "failed") {
    return {
      key: "youtube",
      label,
      pill: { text: "Not checked", tone: "neutral" },
      value: null,
      lines: dateLines(t),
      action: null,
    };
  }
  if (t.state === "found") {
    const parts = [
      t.videos !== null ? `${t.videos} ${t.videos === 1 ? "video" : "videos"}` : null,
      t.lastUploadAt ? `last upload ${formatCheckDate(t.lastUploadAt)}` : null,
    ].filter(Boolean);
    return {
      key: "youtube",
      label,
      pill: { text: "Channel found", tone: "good" },
      value: null,
      lines: [
        ...(parts.length > 0 ? [{ text: parts.join(" · ") }] : []),
        ...checked,
        ...dateLines(t),
      ],
      action: null,
    };
  }
  if (t.state === "mismatch") {
    return {
      key: "youtube",
      label,
      pill: { text: "Not confirmed", tone: "warn" },
      value: null,
      lines: [
        { text: "Channel found but its website doesn't match yours" },
        ...checked,
        ...dateLines(t),
      ],
      action: { text: "Check your channel", href },
    };
  }
  if (t.state === "unconfirmed") {
    return {
      key: "youtube",
      label,
      pill: { text: "Not confirmed", tone: "neutral" },
      value: null,
      lines: [{ text: "We found a channel that might be yours" }, ...checked, ...dateLines(t)],
      action: { text: "Confirm your channel", href },
    };
  }
  return {
    key: "youtube",
    label,
    pill: { text: "No channel linked", tone: "neutral" },
    value: null,
    lines: [...checked, ...dateLines(t)],
    action: { text: "Add your channel", href },
  };
}

export function crawlersView(t: CrawlersTile, brandId: string): BeyondTileView {
  const label = "AI crawlers";
  const visitsLine =
    t.visits.status === "measured"
      ? {
          text: `Visits in 30 days: ${t.visits.total} (${t.visits.byCrawler
            .slice(0, 3)
            .map((v) => v.name)
            .join(", ")})`,
        }
      : { text: "Visits: not measured · upload server logs" };
  const action =
    t.visits.status === "measured"
      ? null
      : { text: "Upload server logs", href: `/brands/${brandId}/retrieval/crawler-logs` };
  if (t.status === "not_checked") {
    return {
      key: "crawlers",
      label,
      pill: NOT_CHECKED,
      value: null,
      lines: [visitsLine],
      action: { text: "Run check", href: `/brands/${brandId}/technical-audit` },
    };
  }
  if (t.status === "failed") {
    return {
      key: "crawlers",
      label,
      pill: { text: "Not checked", tone: "neutral" },
      value: null,
      lines: [...dateLines(t), visitsLine],
      action,
    };
  }
  const blocked = t.searchBlocked.length;
  return {
    key: "crawlers",
    label,
    pill:
      blocked > 0
        ? {
            text: `${blocked} search ${blocked === 1 ? "crawler" : "crawlers"} blocked`,
            tone: "warn",
          }
        : { text: "Search crawlers allowed", tone: "good" },
    value: null,
    lines: [
      {
        text: `${t.searchAllowed.length} of ${t.total} · checked ${formatCheckDate(t.checkedAt ?? "")}`,
      },
      ...(blocked > 0 ? [{ text: `Blocked: ${t.searchBlocked.join(", ")}` }] : []),
      ...dateLines(t),
      visitsLine,
    ],
    action,
  };
}

export function technicalView(t: TechnicalTile, brandId: string): BeyondTileView {
  const label = "Website technical";
  if (t.status === "not_checked") {
    return {
      key: "technical",
      label,
      pill: NOT_CHECKED,
      value: null,
      lines: [],
      action: { text: "Run check", href: `/brands/${brandId}/technical-audit` },
    };
  }
  if (t.status === "failed") {
    return {
      key: "technical",
      label,
      pill: { text: "Not checked", tone: "neutral" },
      value: null,
      lines: dateLines(t),
      action: { text: "Run check", href: `/brands/${brandId}/technical-audit` },
    };
  }
  return {
    key: "technical",
    label,
    pill: null,
    value: { main: String(t.score), of: `of ${t.max}` },
    lines: [
      { text: `checked ${formatCheckDate(t.checkedAt ?? "")} · v${t.scoringVersion} scoring` },
      ...dateLines(t),
    ],
    action: null,
  };
}

/** The four tiles in contract order (P07.beyond: identity, YouTube, crawlers, technical). */
export function beyondTileViews(answers: BeyondAiAnswers, brandId: string): BeyondTileView[] {
  return [
    identityView(answers.identity, brandId),
    youtubeView(answers.youtube, brandId),
    crawlersView(answers.crawlers, brandId),
    technicalView(answers.technical, brandId),
  ];
}

/** The PDF's directory tile lines (P09.beyond.directories). */
export function directoriesLines(d: DirectoriesTile): string[] {
  if (d.cited === 0) return ["AI didn't cite a directory for your questions in this audit."];
  const head =
    d.linked === 0
      ? "No profiles linked yet."
      : `Linked ${d.linked} of ${d.cited} directories AI cites for your questions.`;
  return [
    head,
    ...d.items.map((i) =>
      i.linked
        ? `${i.name}: linked · cited in ${i.citedIn} ${i.citedIn === 1 ? "answer" : "answers"}`
        : `${i.name}: not linked (cited in ${i.citedIn} ${i.citedIn === 1 ? "answer" : "answers"})`,
    ),
  ];
}
