"use client";

import type { JourneyTurnChip } from "@/lib/conversational/journey-results";
import { ENGINE_DISPLAY_NAMES } from "@/lib/llm/interface";
import { measured, NOT_MEASURED } from "@/lib/scoring/measured";
import { displayDate } from "@/lib/trust/display-dates";

interface JourneyResultCardProps {
  journeyName: string;
  engine: string;
  journeyScore: number | null;
  firstMentionTurn: number | null;
  turnResults: JourneyTurnChip[];
  /** 17 Nov, part 3: when this run happened; repeat runs looked identical without it. */
  runAt?: string;
  /** This engine's newest run (the page lists those first). */
  latestForEngine?: boolean;
}

function chipTitle(chip: JourneyTurnChip): string {
  if (chip.brandMentioned === null) return `Turn ${chip.turn}: not recorded`;
  return chip.brandMentioned
    ? `Turn ${chip.turn}: the answer named the business`
    : `Turn ${chip.turn}: the answer didn't name the business`;
}

export function JourneyResultCard({
  journeyName,
  engine,
  journeyScore,
  firstMentionTurn,
  turnResults,
  runAt,
  latestForEngine,
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
          {runAt && (
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }} data-journey-run-date>
              {latestForEngine === false ? "Earlier run" : "Latest run"}, {displayDate(runAt)}
            </p>
          )}
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

      {/* 17 Nov, part 3: the chips read the stored `brand_mentioned` (lib/conversational/journey-results.ts);
          they read a key the rows don't have, so every one was grey. Green: that turn's answer contained the
          business name (a text match on this journey's own answers, not the audit's verified mention). */}
      <div className="flex items-center gap-1 mb-2">
        {turnResults.map((t) => (
          <div
            key={t.turn}
            title={chipTitle(t)}
            aria-label={chipTitle(t)}
            data-turn-named={t.brandMentioned === null ? "unknown" : String(t.brandMentioned)}
            className="h-5 flex-1 rounded-sm flex items-center justify-center text-[10px] font-medium"
            style={{
              backgroundColor: t.brandMentioned
                ? "color-mix(in srgb, var(--success) 20%, transparent)"
                : "color-mix(in srgb, var(--text-disabled) 15%, transparent)",
              color: t.brandMentioned ? "var(--success)" : "var(--text-disabled)",
              borderStyle: t.brandMentioned === null ? "dashed" : undefined,
              borderWidth: t.brandMentioned === null ? 1 : undefined,
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
