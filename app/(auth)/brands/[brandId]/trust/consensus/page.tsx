"use client";

import { useParams } from "next/navigation";
import { useBrandFeatureGate } from "@/components/domain/pricing/brand-feature-gate";
import { PlanLockedCard } from "@/components/domain/pricing/plan-lock";
import { ConsensusDiscrepancyCard } from "@/components/domain/trust/consensus-discrepancy-card";
import { NotYetMeasuredCard } from "@/components/domain/trust/not-yet-measured-card";
import { LayerBadge } from "@/components/phase2/layer-badge";
import { ActionError, LoadError } from "@/components/shared/load-error";
import { usePostAction } from "@/lib/hooks/use-action";
import { useGatedJson } from "@/lib/hooks/use-load";

interface ConsensusRow {
  id: string;
  sourceType: string;
  sourceUrl: string | null;
  nameMatch: boolean;
  serviceMatch: boolean;
  locationMatch: boolean;
  differentiatorsMatch: boolean;
  consistencyScore: number | null;
  discrepancies: Array<{ field: string; thisSource: string; websiteValue: string }>;
}

interface ConsensusData {
  implemented?: false;
  checks: ConsensusRow[];
  avgScore: number;
  rationale: string;
  confidence_label: string | null;
  scoreLevel: "Low" | "Medium" | "High" | null;
  top_action: string | null;
}

export default function ConsensusPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const { locked, planRefused } = useBrandFeatureGate("consensus_score");
  // Follow-ups from af8de42..d1eb5a1, part 1: a failed fetch fell through to "Not yet available", and a
  // failed Refresh reloaded the old data saying nothing. Each says so now.
  const loaded = useGatedJson<ConsensusData>(
    `/api/brands/${brandId}/consensus-score`,
    planRefused,
    { enabled: !locked },
  );
  const data = loaded.data;
  const refresh = usePostAction(`/api/brands/${brandId}/consensus-score/refresh`, {
    planRefused,
    onDone: loaded.retry,
    failure: "The consensus check couldn't be run.",
  });
  const refreshing = refresh.running;
  const handleRefresh = () => refresh.run();

  if (locked) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="trust" />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
          Cross-Platform Consensus
        </h1>
        <PlanLockedCard feature="consensus_score" />
      </div>
    );
  }

  if (loaded.status === "error") {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="trust" />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
          Cross-Platform Consensus
        </h1>
        <LoadError what="the consensus score" detail={loaded.detail} onRetry={loaded.retry} />
      </div>
    );
  }

  if (loaded.status === "loading") {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="trust" />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
          Cross-Platform Consensus
        </h1>
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-lg"
            style={{ backgroundColor: "color-mix(in srgb, var(--foreground) 8%, transparent)" }}
          />
        ))}
      </div>
    );
  }

  if (!data || data.implemented === false) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="trust" />
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
            Cross-Platform Consensus
          </h1>
          <button
            disabled
            className="rounded px-3 py-1.5 text-sm font-medium opacity-50"
            style={{ backgroundColor: "var(--accent-primary)", color: "var(--accent-primary-fg)" }}
          >
            Not yet available
          </button>
        </div>
        <NotYetMeasuredCard metric="Cross-platform consensus" />
      </div>
    );
  }

  if (data.checks.length === 0) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="trust" />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
          Cross-Platform Consensus
        </h1>
        <div
          className="flex flex-col items-center gap-2 py-12 text-center"
          style={{ color: "var(--muted)" }}
        >
          <p className="text-lg font-medium">No consensus checks yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <LayerBadge layer="trust" />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
          Cross-Platform Consensus
        </h1>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="rounded px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
          style={{ backgroundColor: "var(--accent-primary)", color: "var(--accent-primary-fg)" }}
        >
          {refreshing ? "Checking..." : "Refresh"}
        </button>
      </div>
      <ActionError message={refresh.error} />

      <div
        className="rounded-lg border p-4"
        style={{
          borderColor: "color-mix(in srgb, var(--foreground) 12%, transparent)",
          backgroundColor: "var(--background)",
        }}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium" style={{ color: "var(--muted)" }}>
            Average Consistency Score
          </p>
          {data.scoreLevel && (
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: `color-mix(in srgb, var(${data.scoreLevel === "High" ? "--success" : data.scoreLevel === "Medium" ? "--warning" : "--destructive"}) 15%, transparent)`,
                color: `var(${data.scoreLevel === "High" ? "--success" : data.scoreLevel === "Medium" ? "--warning" : "--destructive"})`,
              }}
            >
              {data.scoreLevel}
            </span>
          )}
        </div>
        <p
          className="text-3xl font-bold"
          style={{ color: "var(--foreground)", fontVariantNumeric: "tabular-nums" }}
        >
          {data.avgScore}
          <span className="text-lg font-normal" style={{ color: "var(--muted)" }}>
            /100
          </span>
        </p>
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
          {data.rationale}
        </p>
      </div>

      <div className="space-y-3">
        {data.checks.map((check) => (
          <ConsensusDiscrepancyCard key={check.id} check={check} />
        ))}
      </div>
    </div>
  );
}
