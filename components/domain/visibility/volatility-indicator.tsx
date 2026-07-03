"use client";

interface VolatilityIndicatorProps {
  score: number | null;
  loading?: boolean;
}

const VOLATILITY_THRESHOLD = 15.0;

export function VolatilityIndicator({ score, loading }: VolatilityIndicatorProps) {
  if (loading) {
    return (
      <div
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1"
        style={{ backgroundColor: "var(--bg-hover)" }}
        aria-busy="true"
      >
        <div className="h-2.5 w-12 rounded anim-shimmer" style={{ backgroundColor: "var(--bg-elevated)" }} />
      </div>
    );
  }

  if (score === null) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs"
        style={{
          backgroundColor: `color-mix(in srgb, var(--text-secondary) 10%, transparent)`,
          color: "var(--text-tertiary)",
        }}
      >
        Volatility: N/A
      </span>
    );
  }

  const isVolatile = score > VOLATILITY_THRESHOLD;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
      style={{
        backgroundColor: isVolatile ? "var(--danger-soft)" : "var(--success-soft)",
        color: isVolatile ? "var(--danger)" : "var(--success)",
      }}
      role="status"
      aria-label={`Citation volatility: ${score.toFixed(1)} — ${isVolatile ? "volatile" : "stable"}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${isVolatile ? "animate-pulse" : ""}`}
        style={{
          backgroundColor: isVolatile ? "var(--danger)" : "var(--success)",
        }}
      />
      Volatility: {score.toFixed(1)}
      {isVolatile && " ⚠"}
    </span>
  );
}
