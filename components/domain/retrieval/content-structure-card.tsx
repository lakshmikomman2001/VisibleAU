"use client";

import { measured, NOT_MEASURED, scoreText } from "@/lib/scoring/measured";

interface ContentAudit {
  id: string;
  pageUrl: string;
  /** 0-100 (lib/retrieval/content-auditor.ts): 20 per question heading, +20 FAQ block, +10 FAQ schema. */
  answerCapsuleScore: number | null;
  faqBlockPresent: boolean | null;
  faqSchemaPresent: boolean | null;
  wordCount: number | null;
  optimalPassageCount: number | null;
  freshnessRisk: string | null;
  contentFormatDetected: string | null;
  citationProbabilityScore: string | null;
  hasAuthorAttribution: boolean | null;
  auditedAt: string;
  /**
   * The page's Last-Modified header, and the days since it. Both null when the page sent none: the stored
   * freshnessRisk then defaults to "stale" (content-auditor.ts), which isn't evidence of anything.
   */
  lastModified?: string | null;
  daysSincePublished?: number | null;
}

interface ContentStructureCardProps {
  audit: ContentAudit;
}

const FRESHNESS_COLORS: Record<string, string> = {
  fresh: "var(--success)",
  aging: "var(--warning)",
  at_risk: "var(--danger)",
  stale: "var(--danger)",
};

/** The capsule score's scale: content-auditor.ts caps it at 100. It read "N/4". */
export const ANSWER_CAPSULE_SCORE_MAX = 100;

/**
 * 17 Nov, part 3: a page with no Last-Modified date (both stored null) shows a neutral "no date" -- it showed a
 * red "stale" badge, the default the auditor stores when there's no date to judge.
 */
export function freshnessBadge(
  audit: Pick<ContentAudit, "freshnessRisk" | "lastModified" | "daysSincePublished">,
): { label: string; color: string } | null {
  if (audit.lastModified === null && audit.daysSincePublished === null) {
    return { label: "no date", color: "var(--text-secondary)" };
  }
  if (!audit.freshnessRisk) return null;
  return {
    label: audit.freshnessRisk,
    color: FRESHNESS_COLORS[audit.freshnessRisk] ?? "var(--text-secondary)",
  };
}

export function ContentStructureCard({ audit }: ContentStructureCardProps) {
  // 9 Nov (part 9): an unscored page reads "Not measured yet" in muted text -- not a red 0%
  // (lib/scoring/measured.ts).
  const cit = measured(audit.citationProbabilityScore);
  const citProb = cit.measured ? cit.value : null;
  const freshness = freshnessBadge(audit);
  const citColor =
    citProb === null
      ? "var(--text-secondary)"
      : citProb >= 0.7
        ? "var(--success)"
        : citProb >= 0.4
          ? "var(--warning)"
          : "var(--danger)";

  return (
    <div
      className="rounded-lg border p-4"
      style={{
        borderColor: "color-mix(in srgb, var(--foreground) 12%, transparent)",
        backgroundColor: "var(--background)",
      }}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate" style={{ color: "var(--foreground)" }}>
            {audit.pageUrl}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
            {audit.contentFormatDetected ?? "unknown"} &middot;{" "}
            {audit.wordCount === null ? "word count not measured" : `${audit.wordCount} words`}
          </p>
        </div>
        <div className="text-right ml-3">
          {citProb === null ? (
            <div className="text-sm font-medium" style={{ color: citColor }}>
              {NOT_MEASURED}
            </div>
          ) : (
            <div className="text-lg font-bold" style={{ color: citColor }}>
              {(citProb * 100).toFixed(0)}%
            </div>
          )}
          {/* 17 Nov, part 3: a weighted score from the page's structure
              (lib/retrieval/citation-probability-scorer.ts), not a measured probability. */}
          <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Citation estimate
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {audit.faqBlockPresent && (
          <span
            className="text-xs px-1.5 py-0.5 rounded-full"
            style={{
              backgroundColor: "color-mix(in srgb, var(--success) 9%, transparent)",
              color: "var(--success)",
            }}
          >
            FAQ Block
          </span>
        )}
        {audit.faqSchemaPresent && (
          <span
            className="text-xs px-1.5 py-0.5 rounded-full"
            style={{
              backgroundColor: "color-mix(in srgb, var(--success) 9%, transparent)",
              color: "var(--success)",
            }}
          >
            FAQ Schema
          </span>
        )}
        {audit.hasAuthorAttribution && (
          <span
            className="text-xs px-1.5 py-0.5 rounded-full"
            style={{
              backgroundColor: "color-mix(in srgb, var(--success) 9%, transparent)",
              color: "var(--success)",
            }}
          >
            Author
          </span>
        )}
        {freshness && (
          <span
            className="text-xs px-1.5 py-0.5 rounded-full"
            style={{
              backgroundColor: `color-mix(in srgb, ${freshness.color} 15%, transparent)`,
              color: freshness.color,
            }}
          >
            {freshness.label}
          </span>
        )}
      </div>

      <div
        className="mt-2 flex items-center gap-4 text-xs"
        style={{ color: "var(--text-secondary)" }}
      >
        <span>Capsule: {scoreText(audit.answerCapsuleScore, ANSWER_CAPSULE_SCORE_MAX)}</span>
        <span>
          Passages: {audit.optimalPassageCount === null ? NOT_MEASURED : audit.optimalPassageCount}
        </span>
      </div>
    </div>
  );
}
