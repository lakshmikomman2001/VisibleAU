"use client";

import { TierGate } from "@/components/phase2/tier-gate";

interface CompetitiveBenchmarkData {
  brandShare: number;
  competitorShare: number;
  competitorDomain: string;
  topicalGapsOwned: number;
  fastestPath: string | null;
  comparisonData: Record<string, unknown> | null;
  competitorNarrative: string | null;
  dataAvailableFrom: string | null;
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
    const teaser = data
      ? `${data.competitorDomain} appears 2× more than you in AI search — see full breakdown`
      : "See how you compare against competitors in AI search";
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
            {teaser}
          </p>
        </div>
      </TierGate>
    );
  }

  if (!data) {
    return (
      <div
        className="rounded-lg p-6 text-center"
        style={{
          backgroundColor: "var(--bg-elevated)",
          boxShadow: "var(--elevation-rest)",
        }}
      >
        <p className="text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
          Coming soon
        </p>
        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          Head-to-head comparison available after next audit cycle
        </p>
      </div>
    );
  }

  const gap = data.brandShare - data.competitorShare;

  return (
    <div
      className="rounded-lg p-4"
      style={{
        backgroundColor: "var(--bg-elevated)",
        boxShadow: "var(--elevation-rest)",
      }}
    >
      <p
        className="text-xs font-medium mb-3"
        style={{ color: "var(--text-secondary)" }}
      >
        Competitive Benchmark
      </p>

      <div className="flex flex-wrap items-center gap-4 sm:gap-6 mb-4">
        <StatBlock label="You" value={`${data.brandShare.toFixed(1)}%`} primary />
        <span style={{ color: "var(--text-tertiary)" }} className="text-sm">
          vs
        </span>
        <StatBlock
          label={data.competitorDomain}
          value={`${data.competitorShare.toFixed(1)}%`}
        />
        <StatBlock
          label="Gap"
          value={`${gap > 0 ? "+" : ""}${gap.toFixed(1)}%`}
          highlight={gap > 0 ? "positive" : "negative"}
        />
      </div>

      {data.comparisonData === null && data.dataAvailableFrom && (
        <div
          className="rounded-md px-4 py-3 mb-3"
          style={{
            backgroundColor: `color-mix(in srgb, var(--text-secondary) 8%, transparent)`,
          }}
        >
          <p className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
            Coming soon
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
            Detailed comparison data available from {data.dataAvailableFrom}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <InfoCard label="Topics they own" value={String(data.topicalGapsOwned)} />
        {data.fastestPath && (
          <InfoCard label="Your fastest path" value={data.fastestPath} />
        )}
      </div>
    </div>
  );
}

function StatBlock({
  label,
  value,
  primary,
  highlight,
}: {
  label: string;
  value: string;
  primary?: boolean;
  highlight?: "positive" | "negative";
}) {
  let valueColor = "var(--text-primary)";
  if (highlight === "positive") valueColor = "var(--success)";
  if (highlight === "negative") valueColor = "var(--danger)";

  return (
    <div>
      <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
        {label}
      </p>
      <p
        className={`text-lg font-semibold ${primary ? "" : ""}`}
        style={{
          fontVariantNumeric: "tabular-nums",
          color: valueColor,
        }}
      >
        {value}
      </p>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-md px-3 py-2"
      style={{ backgroundColor: "var(--bg-surface)" }}
    >
      <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
        {label}
      </p>
      <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
        {value}
      </p>
    </div>
  );
}
