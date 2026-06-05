"use client";

interface ScoreBarProps {
  score: number;
  ciLower?: number;
  ciUpper?: number;
  label: string;
  weight?: string;
}

export function ScoreBar({ score, ciLower, ciUpper, label, weight }: ScoreBarProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <div className="flex items-center gap-2">
          {weight && <span className="text-xs text-muted-foreground">{weight}</span>}
          <span className="font-semibold">{score.toFixed(1)}</span>
        </div>
      </div>
      <div
        className="relative h-2 w-full rounded-full bg-muted overflow-hidden"
        role="meter"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label} score: ${score.toFixed(0)} out of 100${ciLower != null && ciUpper != null ? `, 95% CI ${ciLower.toFixed(1)} to ${ciUpper.toFixed(1)}` : ""}`}
      >
        {ciLower != null && ciUpper != null && (
          <div
            className="absolute top-0 h-full rounded-full"
            style={{
              left: `${ciLower}%`,
              width: `${ciUpper - ciLower}%`,
              backgroundColor: "rgba(37,99,235,0.15)",
            }}
          />
        )}
        <div
          className="absolute top-0 h-full rounded-full bg-primary transition-all"
          style={{ width: `${Math.min(100, score)}%` }}
        />
      </div>
      {ciLower != null && ciUpper != null && (
        <p className="text-[11px] text-muted-foreground">
          95% CI: {ciLower.toFixed(1)} — {ciUpper.toFixed(1)}
        </p>
      )}
    </div>
  );
}
