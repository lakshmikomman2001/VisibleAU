"use client";

import { ENGINE_DISPLAY_NAMES } from "@/lib/llm/interface";
import { measured, NOT_MEASURED } from "@/lib/scoring/measured";

interface TurnResult {
  turn: number;
  brandMentioned: boolean;
}

interface JourneyResultCardProps {
  journeyName: string;
  engine: string;
  journeyScore: number | null;
  firstMentionTurn: number | null;
  turnResults: TurnResult[];
}

export function JourneyResultCard({
  journeyName,
  engine,
  journeyScore,
  firstMentionTurn,
  turnResults,
}: JourneyResultCardProps) {
  // 9 Nov (part 9): an unscored run reads "Not measured yet" -- no number, no "/ 100", no red band
  // (lib/scoring/measured.ts).
  const score = measured(journeyScore);
  const scoreColor = !score.measured
    ? "var(--text-tertiary)"
    : score.value >= 70
      ? "var(--success)"
      : score.value >= 40
        ? "var(--warning)"
        : "var(--danger)";

  return (
    <div
      className="rounded-lg border p-4"
      style={{
        borderColor: "var(--border-default)",
        backgroundColor: "var(--bg-elevated)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {journeyName}
          </p>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            {ENGINE_DISPLAY_NAMES[engine as keyof typeof ENGINE_DISPLAY_NAMES] ?? engine}
          </p>
        </div>
        {score.measured ? (
          <div className="text-right">
            <p className="text-xl font-bold" style={{ color: scoreColor }}>
              {score.value.toFixed(0)}
            </p>
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              / 100
            </p>
          </div>
        ) : (
          <p className="text-right text-xs font-medium" style={{ color: scoreColor }}>
            {NOT_MEASURED}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1 mb-2">
        {turnResults.map((t) => (
          <div
            key={t.turn}
            className="h-5 flex-1 rounded-sm flex items-center justify-center text-[10px] font-medium"
            style={{
              backgroundColor: t.brandMentioned
                ? "color-mix(in srgb, var(--success) 20%, transparent)"
                : "color-mix(in srgb, var(--text-disabled) 15%, transparent)",
              color: t.brandMentioned ? "var(--success)" : "var(--text-disabled)",
            }}
          >
            {t.turn}
          </div>
        ))}
      </div>

      {firstMentionTurn != null && (
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          First mention: turn {firstMentionTurn}
        </p>
      )}
    </div>
  );
}
