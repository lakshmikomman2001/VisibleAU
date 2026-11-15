"use client";

import { measured, NOT_MEASURED } from "@/lib/scoring/measured";

interface RetrievalScoreSummaryProps {
  agentReadiness: number | null;
  /** What the readiness score is out of: the points that were measured (17 Nov, part 3). Default 100. */
  agentReadinessMax?: number;
  /** Average over the scored pages; null when no page was scored. */
  avgCitationProbability: number | null;
  /** How many pages that average is over: every page's latest content structure check. */
  citationPagesScored?: number;
  /** Crawler visits recorded over `crawlerVisitDays`; null when the count wasn't loaded. */
  crawlerVisitCount: number | null;
  crawlerVisitDays?: number;
}

export function RetrievalScoreSummary(props: RetrievalScoreSummaryProps) {
  // 9 Nov (part 9): a score that wasn't measured reads "Not measured yet" with no "/100" or "%" -- not
  // "—/100" or 0% (lib/scoring/measured.ts). A visit count is a count: 0 visits is 0.
  const agentReadiness = measured(props.agentReadiness);
  const avgCitation = measured(props.avgCitationProbability);
  const readinessMax = props.agentReadinessMax ?? 100;

  // 17 Nov, part 3: each figure says what it's over. "Crawler Visits" was the length of a 10-row list, and
  // "Avg Citation Prob." averaged 5 rows picked at random; the readiness score counted parts nothing measured.
  const metrics: Array<{ key: string; label: string; value: string | null; basis: string | null }> =
    [
      {
        key: "agentReadiness",
        label: "Agent Readiness",
        value: agentReadiness.measured ? `${agentReadiness.value}/${readinessMax}` : null,
        basis:
          agentReadiness.measured && readinessMax !== 100
            ? "Out of the points we could measure"
            : null,
      },
      {
        key: "avgCitationProbability",
        label: "Avg Citation Prob.",
        value: avgCitation.measured ? `${(avgCitation.value * 100).toFixed(0)}%` : null,
        basis:
          avgCitation.measured && props.citationPagesScored !== undefined
            ? `Our estimate, across ${props.citationPagesScored} ${props.citationPagesScored === 1 ? "page" : "pages"}`
            : avgCitation.measured
              ? "Our estimate from page structure"
              : null,
      },
      {
        key: "crawlerVisitCount",
        label: "Crawler Visits",
        value: props.crawlerVisitCount === null ? null : String(props.crawlerVisitCount),
        basis: props.crawlerVisitDays ? `Last ${props.crawlerVisitDays} days` : null,
      },
    ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {metrics.map((m) => (
        <div
          key={m.key}
          className="rounded-lg border p-4 text-center"
          style={{
            borderColor: "color-mix(in srgb, var(--foreground) 12%, transparent)",
            backgroundColor: "var(--background)",
          }}
        >
          {m.value === null ? (
            <div className="text-sm font-medium py-1.5" style={{ color: "var(--text-secondary)" }}>
              {NOT_MEASURED}
            </div>
          ) : (
            <div className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>
              {m.value}
            </div>
          )}
          <div className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
            {m.label}
          </div>
          {m.basis && (
            <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              {m.basis}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
