"use client";

interface LiftIndicatorProps {
  scoreBefore: number | null;
  scoreAfter: number | null;
  // Task #46 Phase 2: true when the re-audit this lift would be computed
  // from had zero organic, run-1 brand-mention rows -- scoreAfter is never
  // set to a fabricated 0 in that case (lib/workflow/validation-
  // scheduler.ts's recordReauditInsufficientData), so this flag is what
  // distinguishes "insufficient data" from the plain "—" (no re-audit at
  // all yet) rendered when it's false and scoreAfter is still null.
  insufficientData?: boolean;
}

export function LiftIndicator({ scoreBefore, scoreAfter, insufficientData }: LiftIndicatorProps) {
  if (scoreBefore == null) return null;

  return (
    <div
      className="flex items-center gap-1.5 text-sm"
      style={{ fontVariantNumeric: "tabular-nums" }}
    >
      <span style={{ color: "var(--text-secondary)" }}>{scoreBefore.toFixed(0)}</span>
      <span style={{ color: "var(--text-tertiary)" }}>→</span>
      {insufficientData ? (
        <span style={{ color: "var(--text-tertiary)" }}>insufficient data</span>
      ) : scoreAfter != null ? (
        <span
          style={{
            color: scoreAfter > scoreBefore ? "var(--success)" : "var(--danger)",
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
