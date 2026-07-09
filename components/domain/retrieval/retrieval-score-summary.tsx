"use client";

interface RetrievalScoreSummaryProps {
  agentReadiness: number | null;
  avgCitationProbability: number;
  crawlerVisitCount: number;
}

const METRICS = [
  { key: "agentReadiness", label: "Agent Readiness", suffix: "/100" },
  { key: "avgCitationProbability", label: "Avg Citation Prob.", suffix: "%" },
  { key: "crawlerVisitCount", label: "Crawler Visits", suffix: "" },
] as const;

export function RetrievalScoreSummary(props: RetrievalScoreSummaryProps) {
  const values: Record<string, string> = {
    agentReadiness: props.agentReadiness !== null ? String(props.agentReadiness) : "—",
    avgCitationProbability: (props.avgCitationProbability * 100).toFixed(0),
    crawlerVisitCount: String(props.crawlerVisitCount),
  };

  return (
    <div className="grid grid-cols-3 gap-3">
      {METRICS.map((m) => (
        <div key={m.key} className="rounded-lg border p-4 text-center" style={{ borderColor: "color-mix(in srgb, var(--foreground) 12%, transparent)", backgroundColor: "var(--background)" }}>
          <div className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>
            {values[m.key]}{m.suffix}
          </div>
          <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>{m.label}</div>
        </div>
      ))}
    </div>
  );
}
