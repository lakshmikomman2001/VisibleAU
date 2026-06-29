"use client";

interface FanOutLiftProps {
  fanOutBefore: number | null;
  fanOutAfter: number | null;
}

export function FanOutLift({ fanOutBefore, fanOutAfter }: FanOutLiftProps) {
  if (fanOutBefore == null) return null;

  return (
    <div
      className="flex items-center gap-1.5 text-xs"
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      <span style={{ color: "var(--text-tertiary)" }}>Fan-out:</span>
      <span style={{ color: "var(--text-secondary)" }}>
        {fanOutBefore.toFixed(1)}
      </span>
      <span style={{ color: "var(--text-tertiary)" }}>→</span>
      {fanOutAfter != null ? (
        <span
          style={{
            color:
              fanOutAfter > fanOutBefore ? "var(--success)" : "var(--danger)",
          }}
        >
          {fanOutAfter.toFixed(1)}
        </span>
      ) : (
        <span style={{ color: "var(--text-tertiary)" }}>—</span>
      )}
    </div>
  );
}
