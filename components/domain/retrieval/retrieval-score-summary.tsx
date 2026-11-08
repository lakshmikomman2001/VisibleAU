"use client";

import { measured, NOT_MEASURED } from "@/lib/scoring/measured";

interface RetrievalScoreSummaryProps {
  agentReadiness: number | null;
  /** Average over the scored pages; null when no page was scored. */
  avgCitationProbability: number | null;
  crawlerVisitCount: number;
}

const METRICS = [
  { key: "agentReadiness", label: "Agent Readiness", suffix: "/100" },
  { key: "avgCitationProbability", label: "Avg Citation Prob.", suffix: "%" },
  { key: "crawlerVisitCount", label: "Crawler Visits", suffix: "" },
] as const;

export function RetrievalScoreSummary(props: RetrievalScoreSummaryProps) {
  // 9 Nov (part 9): a score that wasn't measured reads "Not measured yet" with no "/100" or "%" -- not
  // "—/100" or 0% (lib/scoring/measured.ts). A visit count is a count: 0 visits is 0.
  const agentReadiness = measured(props.agentReadiness);
  const avgCitation = measured(props.avgCitationProbability);
  const values: Record<string, string | null> = {
    agentReadiness: agentReadiness.measured ? String(agentReadiness.value) : null,
    avgCitationProbability: avgCitation.measured ? (avgCitation.value * 100).toFixed(0) : null,
    crawlerVisitCount: String(props.crawlerVisitCount),
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {METRICS.map((m) => {
        const value = values[m.key];
        return (
          <div
            key={m.key}
            className="rounded-lg border p-4 text-center"
            style={{
              borderColor: "color-mix(in srgb, var(--foreground) 12%, transparent)",
              backgroundColor: "var(--background)",
            }}
          >
            {value === null ? (
              <div className="text-sm font-medium py-1.5" style={{ color: "var(--muted)" }}>
                {NOT_MEASURED}
              </div>
            ) : (
              <div className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>
                {value}
                {m.suffix}
              </div>
            )}
            <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
              {m.label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
