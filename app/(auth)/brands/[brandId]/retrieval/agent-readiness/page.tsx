"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useBrandFeatureGate } from "@/components/domain/pricing/brand-feature-gate";
import { PlanLockedCard } from "@/components/domain/pricing/plan-lock";
import { AgentReadinessCard } from "@/components/domain/retrieval/agent-readiness-card";
import { LayerBadge } from "@/components/phase2/layer-badge";
import {
  readinessFromStoredRow,
  type StoredReadinessParts,
} from "@/lib/retrieval/agent-readiness-breakdown";

// 17 Nov, part 3: the stored row's parts too (the API sends the whole row), so the card scores only what was
// measured (lib/retrieval/agent-readiness-breakdown.ts).
interface AgentReadinessScore extends StoredReadinessParts {
  id: string;
  totalScore: number | null;
  techScore: number | null;
  entityClarityScore: number | null;
  verifyScore: number | null;
  authorityScore: number | null;
  taskScore: number | null;
  localAiTrustScore: number | null;
  techMcpEndpointPresent: boolean | null;
  techLlmstxtPresent: boolean | null;
  gaps: string[];
  scoredAt: string;
}

export default function AgentReadinessPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const [latest, setLatest] = useState<AgentReadinessScore | null>(null);
  const [llmstxtDepthScore, setLlmstxtDepthScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const { locked, planRefused } = useBrandFeatureGate("agent_readiness");

  const load = () => {
    setLoading(true);
    fetch(`/api/brands/${brandId}/agent-readiness`)
      .then(async (res) => {
        if (await planRefused(res)) return;
        if (res.ok) {
          const data = await res.json();
          setLatest(data.latest);
          setLlmstxtDepthScore(data.llmstxtDepthScore ?? null);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (locked) return;
    load();
  }, [brandId, locked]);

  const handleRefresh = async () => {
    setRefreshing(true);
    const res = await fetch(`/api/brands/${brandId}/agent-readiness/refresh`, { method: "POST" });
    if (await planRefused(res)) {
      setRefreshing(false);
      return;
    }
    setTimeout(() => {
      load();
      setRefreshing(false);
    }, 3000);
  };

  if (locked) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="retrieval" />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
          Agent Readiness
        </h1>
        <PlanLockedCard feature="agent_readiness" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="retrieval" />
        <div
          className="h-48 animate-pulse rounded-lg"
          style={{ backgroundColor: "color-mix(in srgb, var(--foreground) 8%, transparent)" }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <LayerBadge layer="retrieval" />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
          Agent Readiness
        </h1>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="rounded-md px-3 py-1.5 text-sm font-medium"
          style={{
            backgroundColor: refreshing
              ? "color-mix(in srgb, var(--foreground) 10%, transparent)"
              : "var(--accent-primary)",
            color: refreshing ? "var(--text-secondary)" : "var(--accent-primary-fg)",
            cursor: refreshing ? "not-allowed" : "pointer",
          }}
        >
          {refreshing ? "Scoring..." : "Refresh Score"}
        </button>
      </div>

      {latest && (
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          Scored {new Date(latest.scoredAt).toLocaleDateString("en-AU")}
        </p>
      )}

      {latest ? (
        <AgentReadinessCard
          breakdown={readinessFromStoredRow(latest)}
          totalScore={latest.totalScore}
          techScore={latest.techScore}
          entityClarityScore={latest.entityClarityScore}
          verifyScore={latest.verifyScore}
          authorityScore={latest.authorityScore}
          taskScore={latest.taskScore}
          localAiTrustScore={latest.localAiTrustScore}
          gaps={latest.gaps ?? []}
          llmstxtDepthScore={llmstxtDepthScore}
          mcpEndpointPresent={latest.techMcpEndpointPresent}
          llmstxtPresent={latest.techLlmstxtPresent}
        />
      ) : (
        <div className="text-center py-12" style={{ color: "var(--text-secondary)" }}>
          No agent readiness score yet. Click &quot;Refresh Score&quot; to run an assessment.
        </div>
      )}
    </div>
  );
}
