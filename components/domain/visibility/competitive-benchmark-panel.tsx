"use client";

import { TierGate } from "@/components/phase2/tier-gate";

interface ComparisonVerdict {
  engine: string;
  brandWon: boolean | null;
  brandMentioned: boolean;
  competitorMentioned: boolean;
}

interface CompetitorBenchmark {
  competitorDomain: string;
  verdicts: ComparisonVerdict[];
  wins: number;
  losses: number;
  inconclusive: number;
}

interface CompetitiveBenchmarkData {
  competitors: CompetitorBenchmark[];
  summary: {
    totalWins: number;
    totalLosses: number;
    totalInconclusive: number;
    topicalGapsOwned: number;
    fastestPath: string | null;
  };
}

interface CompetitiveBenchmarkPanelProps {
  data: CompetitiveBenchmarkData | null;
  tier: string;
  loading?: boolean;
}

export function CompetitiveBenchmarkPanel({
  data,
  tier,
  loading,
}: CompetitiveBenchmarkPanelProps) {
  if (loading) {
    return (
      <div
        className="rounded-lg p-4"
        style={{
          backgroundColor: "var(--bg-elevated)",
          boxShadow: "var(--elevation-rest)",
        }}
        aria-busy="true"
      >
        <div
          className="h-3 w-44 rounded anim-shimmer mb-4"
          style={{ backgroundColor: "var(--bg-hover)" }}
        />
        <div
          className="h-24 w-full rounded anim-shimmer"
          style={{ backgroundColor: "var(--bg-hover)" }}
        />
      </div>
    );
  }

  if (tier === "starter" || tier === "free") {
    return (
      <TierGate requiredTier="Growth" locked>
        <div
          className="rounded-lg p-6 text-center"
          style={{
            backgroundColor: "var(--bg-elevated)",
            boxShadow: "var(--elevation-rest)",
          }}
        >
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            See how you compare against competitors in AI search
          </p>
        </div>
      </TierGate>
    );
  }

  if (!data || data.competitors.length === 0) {
    return (
      <div
        className="rounded-lg p-6 text-center"
        style={{
          backgroundColor: "var(--bg-elevated)",
          boxShadow: "var(--elevation-rest)",
        }}
      >
        <p className="text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
          No comparison data yet
        </p>
        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          Run an audit with competitors to see head-to-head results
        </p>
      </div>
    );
  }

  const { summary, competitors } = data;

  return (
    <div
      className="rounded-lg p-4 space-y-4"
      style={{
        backgroundColor: "var(--bg-elevated)",
        boxShadow: "var(--elevation-rest)",
      }}
    >
      <p
        className="text-xs font-medium"
        style={{ color: "var(--text-secondary)" }}
      >
        Competitive Benchmark
      </p>

      <div className="flex flex-wrap items-center gap-4 sm:gap-6">
        <MiniStat label="Wins" value={summary.totalWins} color="var(--success)" />
        <MiniStat label="Losses" value={summary.totalLosses} color="var(--danger)" />
        <MiniStat label="Draw" value={summary.totalInconclusive} color="var(--warning)" />
        <InfoChip label="Topics they own" value={String(summary.topicalGapsOwned)} />
        {summary.fastestPath && (
          <InfoChip label="Fastest path" value={summary.fastestPath} />
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {competitors.map((comp) => (
          <div
            key={comp.competitorDomain}
            className="rounded-md border p-3"
            style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-surface)" }}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                vs {comp.competitorDomain}
              </p>
              <div className="flex gap-2">
                <span className="text-xs font-semibold" style={{ color: "var(--success)" }}>
                  {comp.wins}W
                </span>
                <span className="text-xs font-semibold" style={{ color: "var(--danger)" }}>
                  {comp.losses}L
                </span>
                {comp.inconclusive > 0 && (
                  <span className="text-xs font-semibold" style={{ color: "var(--warning)" }}>
                    {comp.inconclusive}D
                  </span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {comp.verdicts.map((v) => (
                <span
                  key={v.engine}
                  className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs"
                  style={{
                    backgroundColor: "var(--bg-elevated)",
                    color:
                      v.brandWon === true
                        ? "var(--success)"
                        : v.brandWon === false
                          ? "var(--danger)"
                          : "var(--warning)",
                  }}
                >
                  <span className="capitalize">{v.engine}</span>
                  <span className="font-semibold">
                    {v.brandWon === true ? "W" : v.brandWon === false ? "L" : "D"}
                  </span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-sm font-semibold" style={{ color, fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
      <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{label}</span>
    </div>
  );
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{label}:</span>
      <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>{value}</span>
    </div>
  );
}
