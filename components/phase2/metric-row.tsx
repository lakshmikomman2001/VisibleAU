"use client";

interface MetricRowProps {
  label: string;
  value: string | number;
  bar?: number;
  maxBar?: number;
}

export function MetricRow({ label, value, bar, maxBar = 100 }: MetricRowProps) {
  const pct = bar != null ? Math.min((bar / maxBar) * 100, 100) : null;
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span
        className="text-sm flex-shrink-0 w-28"
        style={{ color: "var(--text-secondary)" }}
      >
        {label}
      </span>
      {pct != null && (
        <div
          className="flex-1 h-1.5 rounded-full overflow-hidden"
          style={{ backgroundColor: "var(--bg-hover)" }}
        >
          <div
            className="h-full rounded-full"
            style={{
              width: `${pct}%`,
              backgroundColor: "var(--accent-blue)",
            }}
            role="img"
            aria-label={`${label}: ${value}`}
          />
        </div>
      )}
      <span
        className="text-sm font-medium min-w-[3rem] text-right"
        style={{
          fontVariantNumeric: "tabular-nums",
          color: "var(--text-primary)",
        }}
      >
        {value}
      </span>
    </div>
  );
}
