"use client";

interface TrustScoreCardProps {
  label: string;
  score: number;
  maxScore: number;
  lowerIsBetter?: boolean;
  rationale: string;
  confidenceLabel: string | null;
}

export function TrustScoreCard({
  label,
  score,
  maxScore,
  lowerIsBetter = false,
  rationale,
  confidenceLabel,
}: TrustScoreCardProps) {
  const pct = (score / maxScore) * 100;
  const isGood = lowerIsBetter ? pct <= 20 : pct >= 80;
  const isBad = lowerIsBetter ? pct >= 50 : pct <= 30;

  const barColor = isGood
    ? "var(--success)"
    : isBad
      ? "var(--destructive)"
      : "var(--warning)";

  return (
    <div
      className="rounded-lg border p-4"
      style={{
        borderColor: "color-mix(in srgb, var(--foreground) 12%, transparent)",
        backgroundColor: "var(--background)",
      }}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium" style={{ color: "var(--muted)" }}>{label}</p>
        {confidenceLabel && (
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-medium"
            style={{
              backgroundColor: "color-mix(in srgb, var(--accent-primary) 15%, transparent)",
              color: "var(--accent-primary)",
            }}
          >
            {confidenceLabel}
          </span>
        )}
      </div>
      <p
        className="mt-1 text-3xl font-bold"
        style={{ color: "var(--foreground)", fontVariantNumeric: "tabular-nums" }}
      >
        {score}<span className="text-lg font-normal" style={{ color: "var(--muted)" }}>/{maxScore}</span>
      </p>
      {lowerIsBetter && (
        <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>Lower is better (0 = safe)</p>
      )}
      <div
        className="mt-3 h-2 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: "color-mix(in srgb, var(--foreground) 8%, transparent)" }}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: barColor }}
        />
      </div>
      <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>{rationale}</p>
    </div>
  );
}
