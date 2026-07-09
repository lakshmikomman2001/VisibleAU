"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { LayerBadge } from "@/components/phase2/layer-badge";
import { AgentReadinessCard } from "@/components/domain/retrieval/agent-readiness-card";

interface AgentReadinessScore {
  id: string;
  totalScore: number | null;
  techScore: number | null;
  entityClarityScore: number | null;
  verifyScore: number | null;
  authorityScore: number | null;
  taskScore: number | null;
  localAiTrustScore: number | null;
  techMcpEndpointPresent: boolean | null;
  gaps: string[];
  scoredAt: string;
}

export default function AgentReadinessPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const [latest, setLatest] = useState<AgentReadinessScore | null>(null);
  const [llmstxtDepthScore, setLlmstxtDepthScore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = () => {
    setLoading(true);
    fetch(`/api/brands/${brandId}/agent-readiness`)
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setLatest(data.latest);
          setLlmstxtDepthScore(data.llmstxtDepthScore ?? null);
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [brandId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetch(`/api/brands/${brandId}/agent-readiness/refresh`, { method: "POST" });
    setTimeout(() => {
      load();
      setRefreshing(false);
    }, 3000);
  };

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="retrieval" />
        <div className="h-48 animate-pulse rounded-lg" style={{ backgroundColor: "color-mix(in srgb, var(--foreground) 8%, transparent)" }} />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <LayerBadge layer="retrieval" />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>Agent Readiness</h1>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="rounded-md px-3 py-1.5 text-sm font-medium"
          style={{
            backgroundColor: refreshing ? "color-mix(in srgb, var(--foreground) 10%, transparent)" : "var(--accent-primary)",
            color: refreshing ? "var(--muted)" : "var(--accent-primary-fg)",
            cursor: refreshing ? "not-allowed" : "pointer",
          }}
        >
          {refreshing ? "Scoring..." : "Refresh Score"}
        </button>
      </div>

      {latest ? (
        <AgentReadinessCard
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
        />
      ) : (
        <div className="text-center py-12" style={{ color: "var(--muted)" }}>
          No agent readiness score yet. Click &quot;Refresh Score&quot; to run an assessment.
        </div>
      )}
    </div>
  );
}
