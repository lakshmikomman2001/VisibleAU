"use client";

import { ENGINE_DISPLAY_NAMES } from "@/lib/llm/interface";
import { displayDate } from "@/lib/trust/display-dates";

interface ComparisonVerdictCardProps {
  competitorDomain: string;
  engine: string;
  brandWon: boolean | null;
  brandMentioned: boolean;
  competitorMentioned: boolean;
  /** 17 Nov, part 3: when this comparison ran. */
  runAt?: string;
  /** Only the start of the answer was kept (a row from before 17 Nov), so it has no verdict. */
  answerCutOff?: boolean;
}

/**
 * 17 Nov, part 3: "Brand mentioned: Yes/No" read as the audit's verified mention. It's a text match in this
 * separate head-to-head answer, so it says that: "Named in this answer". The verdict is the comparisons API's,
 * judged again from the stored answer (lib/conversational/comparison-verdict.ts).
 */
export function ComparisonVerdictCard({
  competitorDomain,
  engine,
  brandWon,
  brandMentioned,
  competitorMentioned,
  runAt,
  answerCutOff = false,
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
      <p className="text-xs mb-2" style={{ color: "var(--text-tertiary)" }}>
        {ENGINE_DISPLAY_NAMES[engine as keyof typeof ENGINE_DISPLAY_NAMES] ?? engine}
        {runAt ? ` · Ran ${displayDate(runAt)}` : ""}
      </p>
      <div className="flex flex-wrap gap-3 text-xs" style={{ color: "var(--text-secondary)" }}>
        <span>Named in this answer: {brandMentioned ? "Yes" : "No"}</span>
        <span>Competitor named: {competitorMentioned ? "Yes" : "No"}</span>
      </div>
      {answerCutOff && (
        <p className="mt-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
          Only the start of this answer was kept, so its verdict can&apos;t be read.
        </p>
      )}
    </div>
  );
}
