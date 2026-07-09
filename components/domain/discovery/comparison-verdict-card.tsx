"use client";

interface ComparisonVerdictCardProps {
  competitorDomain: string;
  engine: string;
  brandWon: boolean | null;
  brandMentioned: boolean;
  competitorMentioned: boolean;
  rawResponse?: string;
}

export function ComparisonVerdictCard({
  competitorDomain,
  engine,
  brandWon,
  brandMentioned,
  competitorMentioned,
}: ComparisonVerdictCardProps) {
  const verdict = brandWon === true ? "Won" : brandWon === false ? "Lost" : "Inconclusive";
  const verdictColor =
    brandWon === true ? "var(--success)" : brandWon === false ? "var(--danger)" : "var(--warning)";

  return (
    <div
      className="rounded-lg border p-4"
      style={{
        borderColor: "var(--border-default)",
        backgroundColor: "var(--bg-elevated)",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          vs {competitorDomain}
        </p>
        <span
          className="rounded-full px-2.5 py-0.5 text-xs font-semibold"
          style={{
            backgroundColor: `color-mix(in srgb, ${verdictColor} 15%, transparent)`,
            color: verdictColor,
          }}
        >
          {verdict}
        </span>
      </div>
      <p className="text-xs mb-2" style={{ color: "var(--text-tertiary)" }}>{engine}</p>
      <div className="flex gap-3 text-xs" style={{ color: "var(--text-secondary)" }}>
        <span>Brand mentioned: {brandMentioned ? "Yes" : "No"}</span>
        <span>Competitor mentioned: {competitorMentioned ? "Yes" : "No"}</span>
      </div>
    </div>
  );
}
