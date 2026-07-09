"use client";

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
}

const DIMENSIONS = [
  { key: "techScore", label: "Technical", max: 20 },
  { key: "entityClarityScore", label: "Entity Clarity", max: 20 },
  { key: "verifyScore", label: "Verifiability", max: 20 },
  { key: "authorityScore", label: "Authority", max: 20 },
  { key: "taskScore", label: "Task-Fit", max: 20 },
] as const;

export function AgentReadinessCard(props: AgentReadinessCardProps) {
  const total = props.totalScore ?? 0;
  const pct = total / 100;
  const color = pct >= 0.7 ? "var(--success)" : pct >= 0.4 ? "var(--warning)" : "var(--destructive)";

  return (
    <div className="rounded-lg border p-5" style={{ borderColor: "color-mix(in srgb, var(--foreground) 12%, transparent)", backgroundColor: "var(--background)" }}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>Agent Readiness Score</h3>
        <span className="text-2xl font-bold" style={{ color }}>{total}/100</span>
      </div>

      <div className="mt-2 h-2 rounded-full overflow-hidden" style={{ backgroundColor: "color-mix(in srgb, var(--foreground) 10%, transparent)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct * 100}%`, backgroundColor: color }} />
      </div>

      <div className="mt-4 grid grid-cols-5 gap-2">
        {DIMENSIONS.map((dim) => {
          const val = props[dim.key] ?? 0;
          const dimPct = val / dim.max;
          const dimColor = dimPct >= 0.7 ? "var(--success)" : dimPct >= 0.4 ? "var(--warning)" : "var(--destructive)";
          return (
            <div key={dim.key} className="text-center">
              <div className="text-xs" style={{ color: "var(--muted)" }}>{dim.label}</div>
              <div className="text-sm font-semibold" style={{ color: dimColor }}>{val}/{dim.max}</div>
            </div>
          );
        })}
      </div>

      {(props.llmstxtDepthScore !== undefined || props.mcpEndpointPresent !== undefined) && (
        <div className="mt-3 rounded px-3 py-2 text-sm" style={{ backgroundColor: "color-mix(in srgb, var(--foreground) 4%, transparent)" }}>
          <div className="text-xs font-medium mb-1" style={{ color: "var(--muted)" }}>Technical sub-signals</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1" style={{ color: "var(--foreground)" }}>
            <span>llms.txt depth: {props.llmstxtDepthScore != null ? `${props.llmstxtDepthScore}/18` : "absent"}</span>
            <span>MCP: {props.mcpEndpointPresent ? "detected" : "absent"}</span>
          </div>
        </div>
      )}

      {props.localAiTrustScore !== null && (
        <div className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
          Local AI Trust: <span className="font-medium" style={{ color: "var(--foreground)" }}>{props.localAiTrustScore}/100</span>
        </div>
      )}

      {props.gaps.length > 0 && (
        <div className="mt-4 space-y-1">
          <div className="text-xs font-medium" style={{ color: "var(--muted)" }}>Top Gaps</div>
          {props.gaps.slice(0, 3).map((gap, i) => (
            <div key={i} className="text-sm rounded px-2 py-1" style={{ backgroundColor: "color-mix(in srgb, var(--warning) 10%, transparent)", color: "var(--foreground)" }}>
              {gap}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
