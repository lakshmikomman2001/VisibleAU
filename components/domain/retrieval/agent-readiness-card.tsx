"use client";

import {
  type ReadinessBreakdown,
  type ReadinessDimension,
  readinessGapText,
} from "@/lib/retrieval/agent-readiness-breakdown";
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
  /** The depth of VisibleAU's own current llms.txt draft (llmstxt_versions), not the site's file. */
  llmstxtDepthScore?: number | null;
  mcpEndpointPresent?: boolean | null;
  /** Whether VisibleAU has a current llms.txt draft: false = none generated; null = not checked. */
  llmstxtPresent?: boolean | null;
  /**
   * 17 Nov, part 3: the score read back from its stored parts (lib/retrieval/agent-readiness-breakdown.ts),
   * without the parts nothing measured. When given, it replaces the stored totals above, which carry 6 free
   * points and 22 points of unmeasured zeros on every row the old writer stored.
   */
  breakdown?: ReadinessBreakdown;
}

const DIMENSIONS = [
  { key: "techScore", dim: "tech", label: "Technical", max: 20 },
  { key: "entityClarityScore", dim: "entity", label: "Entity Clarity", max: 20 },
  { key: "verifyScore", dim: "verify", label: "Verifiability", max: 20 },
  { key: "authorityScore", dim: "authority", label: "Authority", max: 20 },
  { key: "taskScore", dim: "task", label: "Task-Fit", max: 20 },
] as const satisfies ReadonlyArray<{
  key: string;
  dim: ReadinessDimension;
  label: string;
  max: number;
}>;

function bandColor(pct: number): string {
  return pct >= 0.7 ? "var(--success)" : pct >= 0.4 ? "var(--warning)" : "var(--danger)";
}

export function AgentReadinessCard(props: AgentReadinessCardProps) {
  // 9 Nov (part 9): an unscored total or dimension reads "Not measured yet" -- no number, no bar, no
  // red band (lib/scoring/measured.ts). A measured 0 is still 0/100.
  const b = props.breakdown;
  const totalM = b
    ? measured(b.total.measuredMax > 0 ? b.total.points : null)
    : measured(props.totalScore);
  const totalMax = b ? b.total.measuredMax : 100;
  const pct = totalM.measured && totalMax > 0 ? totalM.value / totalMax : null;
  const color = pct === null ? "var(--text-secondary)" : bandColor(pct);
  const notMeasuredPoints = b ? b.notMeasured.reduce((sum, p) => sum + p.points, 0) : 0;

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
            {totalM.value}/{totalMax}
          </span>
        ) : (
          <span className="text-sm font-medium" style={{ color }}>
            {NOT_MEASURED}
          </span>
        )}
      </div>
      {b && notMeasuredPoints > 0 && (
        <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Out of the {totalMax} points we could measure. {notMeasuredPoints} of the 100 points
          weren&apos;t measured, so they aren&apos;t counted either way.
        </p>
      )}

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
          const fromParts = b?.dimensions[dim.dim];
          const value = fromParts
            ? fromParts.measuredMax > 0
              ? fromParts.points
              : null
            : props[dim.key];
          const max = fromParts ? fromParts.measuredMax : dim.max;
          const m = measured(value);
          const dimColor =
            m.measured && max > 0 ? bandColor(m.value / max) : "var(--text-secondary)";
          return (
            <div key={dim.key} className="text-center">
              <div className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {dim.label}
              </div>
              <div className="text-sm font-semibold" style={{ color: dimColor }}>
                {scoreText(value, max)}
              </div>
            </div>
          );
        })}
      </div>

      {b && b.notMeasured.length > 0 && (
        <div className="mt-3 text-xs" style={{ color: "var(--text-secondary)" }}>
          <span className="font-medium">Not measured: </span>
          {b.notMeasured.map((p) => `${p.label} (${p.points})`).join(", ")}.
        </div>
      )}

      {(props.llmstxtDepthScore !== undefined || props.mcpEndpointPresent !== undefined) && (
        <div
          className="mt-3 rounded px-3 py-2 text-sm"
          style={{ backgroundColor: "color-mix(in srgb, var(--foreground) 4%, transparent)" }}
        >
          <div className="text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
            Technical sub-signals
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1" style={{ color: "var(--foreground)" }}>
            {/* 9 Nov, part 6: "absent" only when the check ran and found nothing (lib/scoring/measured.ts).
                17 Nov, part 3: this is llmstxtDepthScore, the coverage score of VisibleAU's own generated
                draft (the llms.txt page's "Draft coverage"), not the site's file, and it says so; the llms.txt
                generator page's "/18" scores the file on the site. */}
            <span>
              llms.txt draft coverage (ours, not your site&apos;s file):{" "}
              {props.llmstxtDepthScore != null
                ? `${props.llmstxtDepthScore}/18`
                : checkText(props.llmstxtPresent, "draft made, depth not scored")}
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
              {readinessGapText(gap)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
