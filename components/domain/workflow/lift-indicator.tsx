"use client";

interface LiftIndicatorProps {
  scoreBefore: number | null;
  scoreAfter: number | null;
}

export function LiftIndicator({ scoreBefore, scoreAfter }: LiftIndicatorProps) {
  if (scoreBefore == null) return null;

  return (
    <div
      className="flex items-center gap-1.5 text-sm"
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      <span style={{ color: "var(--text-secondary)" }}>
        {scoreBefore.toFixed(0)}
      </span>
      <span style={{ color: "var(--text-tertiary)" }}>→</span>
      {scoreAfter != null ? (
        <span
          style={{
            color:
              scoreAfter > scoreBefore ? "var(--success)" : "var(--danger)",
          }}
        >
          {scoreAfter.toFixed(0)}
          <span className="text-xs ml-0.5">
            ({scoreAfter > scoreBefore ? "+" : ""}
            {(scoreAfter - scoreBefore).toFixed(1)})
          </span>
        </span>
      ) : (
        <span style={{ color: "var(--text-tertiary)" }}>—</span>
      )}
    </div>
  );
}
