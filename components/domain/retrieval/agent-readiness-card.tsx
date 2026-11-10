"use client";

import { checkText, measured, NOT_MEASURED, scoreText } from "@/lib/scoring/measured";

interface AgentReadinessCardProps {
  totalScore: number | null;
  techScore: number | null;
  entityClarityScore: number | null;
  verifyScore: number | null;
  authorityScore: number | null;
  taskScore: number | null;
  localAiTrustScore: number | null;
  gaps: string[];
  llmstxtDepthScore?: number | null;
  mcpEndpointPresent?: boolean | null;
  /** Whether the score run found an llms.txt on the site: false = checked, none; null = not checked. */
  llmstxtPresent?: boolean | null;
}

const DIMENSIONS = [
  { key: "techScore", label: "Technical", max: 20 },
  { key: "entityClarityScore", label: "Entity Clarity", max: 20 },
  { key: "verifyScore", label: "Verifiability", max: 20 },
  { key: "authorityScore", label: "Authority", max: 20 },
  { key: "taskScore", label: "Task-Fit", max: 20 },
] as const;

function bandColor(pct: number): string {
  return pct >= 0.7 ? "var(--success)" : pct >= 0.4 ? "var(--warning)" : "var(--danger)";
}

export function AgentReadinessCard(props: AgentReadinessCardProps) {
  // 9 Nov (part 9): an unscored total or dimension reads "Not measured yet" -- no number, no bar, no
  // red band (lib/scoring/measured.ts). A measured 0 is still 0/100.
  const totalM = measured(props.totalScore);
  const pct = totalM.measured ? totalM.value / 100 : null;
  const color = pct === null ? "var(--text-secondary)" : bandColor(pct);

  return (
    <div
      className="rounded-lg border p-5"
      style={{
        borderColor: "color-mix(in srgb, var(--foreground) 12%, transparent)",
        backgroundColor: "var(--background)",
      }}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>
          Agent Readiness Score
        </h3>
        {totalM.measured ? (
          <span className="text-2xl font-bold" style={{ color }}>
            {totalM.value}/100
          </span>
        ) : (
          <span className="text-sm font-medium" style={{ color }}>
            {NOT_MEASURED}
          </span>
        )}
      </div>

      {pct !== null && (
        <div
          className="mt-2 h-2 rounded-full overflow-hidden"
          style={{ backgroundColor: "color-mix(in srgb, var(--foreground) 10%, transparent)" }}
        >
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct * 100}%`, backgroundColor: color }}
          />
        </div>
      )}

      <div className="mt-4 grid grid-cols-3 sm:grid-cols-5 gap-2">
        {DIMENSIONS.map((dim) => {
          const m = measured(props[dim.key]);
          const dimColor = m.measured ? bandColor(m.value / dim.max) : "var(--text-secondary)";
          return (
            <div key={dim.key} className="text-center">
              <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {dim.label}
              </div>
              <div className="text-sm font-semibold" style={{ color: dimColor }}>
                {scoreText(props[dim.key], dim.max)}
              </div>
            </div>
          );
        })}
      </div>

      {(props.llmstxtDepthScore !== undefined || props.mcpEndpointPresent !== undefined) && (
        <div
          className="mt-3 rounded px-3 py-2 text-sm"
          style={{ backgroundColor: "color-mix(in srgb, var(--foreground) 4%, transparent)" }}
        >
          <div className="text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
            Technical sub-signals
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1" style={{ color: "var(--foreground)" }}>
            {/* 9 Nov, part 6: "absent" only when the check ran and found nothing (lib/scoring/measured.ts). */}
            <span>
              llms.txt depth:{" "}
              {props.llmstxtDepthScore != null
                ? `${props.llmstxtDepthScore}/18`
                : checkText(props.llmstxtPresent, "present, depth not scored")}
            </span>
            <span>MCP: {checkText(props.mcpEndpointPresent)}</span>
          </div>
        </div>
      )}

      {props.localAiTrustScore !== null && (
        <div className="mt-3 text-sm" style={{ color: "var(--text-secondary)" }}>
          Local AI Trust:{" "}
          <span className="font-medium" style={{ color: "var(--foreground)" }}>
            {props.localAiTrustScore}/100
          </span>
        </div>
      )}

      {props.gaps.length > 0 && (
        <div className="mt-4 space-y-1">
          <div className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
            Top Gaps
          </div>
          {props.gaps.slice(0, 3).map((gap, i) => (
            <div
              key={i}
              className="text-sm rounded px-2 py-1"
              style={{
                backgroundColor: "color-mix(in srgb, var(--warning) 10%, transparent)",
                color: "var(--foreground)",
              }}
            >
              {gap}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
