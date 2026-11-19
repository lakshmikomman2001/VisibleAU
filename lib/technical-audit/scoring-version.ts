import type { TechnicalAuditDimensions } from "./types";

/**
 * 20 Nov (Sri's decision): which scoring rules a technical audit was scored under. From version 4 every new audit
 * stores its version in its findings (`findings.scoringVersion`, lib/technical-audit/orchestrate.ts); an older row's
 * is read from what it stored. A score is only ever compared with another under the same version: across a change,
 * both are shown with "Scoring updated on <date>" (scoringChangeNote), like the Visibility score's
 * "Detection updated" (lib/llm/methodology.ts). The Visibility score doesn't use any of this.
 *
 * 1 = before 21 Oct 2026: out of 100 (Brand & Entity out of 10).
 * 2 = from 21 Oct 2026 (b828203): out of 98 (Brand & Entity out of 8, the directory signal removed).
 * 3 = from 19 Nov 2026 (41794f8): out of 95. The three /ai/ files earn nothing (their findings say
 *     `aiDiscovery.optionalFilesScored: false`); AI Discovery is ai.txt's 3.
 * 4 = from 20 Nov 2026: out of 74. llms.txt and ai.txt earn nothing either (no AI provider has said its engine reads
 *     llms.txt; ai.txt is an individual Internet-Draft, not a standard: lib/methodology/verified-citations.ts), and
 *     robots.txt is scored on the crawlers that put a site in AI answers (search crawlers and Googlebot), not the
 *     training ones (lib/robots-txt/analyze.ts). One version covers both changes: they ship together.
 */
export const TECHNICAL_SCORING_VERSION = 4;

export type TechnicalScoringVersion = 1 | 2 | 3 | 4;

/** When the maximum dropped from 100 to 98 (b828203, 21 Oct 2026 11:37 Sydney). */
export const MAX_98_FROM = new Date("2026-10-21T00:37:14Z");

export type TechnicalDimensionKey = keyof TechnicalAuditDimensions;

const VERSION_1_MAXIMA: Record<TechnicalDimensionKey, number> = {
  scoreRobots: 18,
  scoreLlmsTxt: 18,
  scoreSchema: 16,
  scoreMeta: 14,
  scoreContent: 12,
  scoreBrandEntity: 10,
  scoreSignals: 6,
  scoreAiDiscovery: 6,
};

/** Each check's maximum under each version. A check out of 0 isn't scored: it's checked and shown, never counted. */
export const DIMENSION_MAXIMA: Record<
  TechnicalScoringVersion,
  Record<TechnicalDimensionKey, number>
> = {
  1: VERSION_1_MAXIMA,
  2: { ...VERSION_1_MAXIMA, scoreBrandEntity: 8 },
  3: { ...VERSION_1_MAXIMA, scoreBrandEntity: 8, scoreAiDiscovery: 3 },
  4: { ...VERSION_1_MAXIMA, scoreBrandEntity: 8, scoreAiDiscovery: 0, scoreLlmsTxt: 0 },
};

function isScoringVersion(value: unknown): value is TechnicalScoringVersion {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

/** What a technical audit row offers to work out its version from. */
export interface TechnicalAuditScoringRow {
  createdAt: Date | string;
  findings: unknown;
}

/**
 * The version an audit was scored under: the one it stored (from 4 on), else what its findings show (3: the /ai/
 * files marked unscored), else its date (1 before 21 Oct, 2 after).
 */
export function technicalScoringVersionOf(row: TechnicalAuditScoringRow): TechnicalScoringVersion {
  const findings = (row.findings ?? null) as {
    scoringVersion?: unknown;
    aiDiscovery?: { optionalFilesScored?: unknown } | null;
  } | null;
  if (isScoringVersion(findings?.scoringVersion)) return findings.scoringVersion;
  if (findings?.aiDiscovery?.optionalFilesScored === false) return 3;
  return new Date(row.createdAt).getTime() < MAX_98_FROM.getTime() ? 1 : 2;
}

export interface TechnicalScoring {
  version: TechnicalScoringVersion;
  /** What the composite is out of: 100, 98, 95 or 74. */
  compositeMax: number;
  /** Each check's maximum (0 = checked, not scored). */
  dimensionMax: Record<TechnicalDimensionKey, number>;
}

export function scoringForVersion(version: TechnicalScoringVersion): TechnicalScoring {
  const dimensionMax = DIMENSION_MAXIMA[version];
  return {
    version,
    compositeMax: Object.values(dimensionMax).reduce((sum, max) => sum + max, 0),
    dimensionMax,
  };
}

/** The rules an audit was scored under. */
export function technicalScoringOf(row: TechnicalAuditScoringRow): TechnicalScoring {
  return scoringForVersion(technicalScoringVersionOf(row));
}

/** A check that earns points under this version (llms.txt and AI Discovery don't from version 4). */
export function isScoredCheck(scoring: TechnicalScoring, key: TechnicalDimensionKey): boolean {
  return scoring.dimensionMax[key] > 0;
}

/** Said wherever "Scoring updated" is: these changes are the Technical score's alone. */
export const VISIBILITY_SCORE_NOT_AFFECTED = "Your Visibility score isn't affected.";

/**
 * "Scoring updated on 20 Nov 2026": where a technical score meets one scored under other rules, dated by the first
 * audit under the newer ones. Null when both are under the same version.
 */
export function scoringChangeNote(
  previousVersion: TechnicalScoringVersion,
  version: TechnicalScoringVersion,
  firstAuditAt: Date | string,
  timeZone = "Australia/Sydney",
): string | null {
  if (previousVersion === version) return null;
  const date = new Date(firstAuditAt).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  });
  return `Scoring updated on ${date}`;
}
