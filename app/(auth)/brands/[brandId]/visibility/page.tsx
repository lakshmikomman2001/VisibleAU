"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { LayerBadge } from "@/components/phase2/layer-badge";
import { EmptyState } from "@/components/phase2/empty-state";
import { SovDonut } from "@/components/domain/visibility/sov-donut";
import { MentionSourceMatrix } from "@/components/domain/visibility/mention-source-matrix";
import { FanOutTree } from "@/components/domain/visibility/fan-out-tree";
import { TopicalGapList } from "@/components/domain/visibility/topical-gap-list";
import { VolatilityIndicator } from "@/components/domain/visibility/volatility-indicator";
import { CompetitiveBenchmarkPanel } from "@/components/domain/visibility/competitive-benchmark-panel";
import type { BrandArchetype } from "@/lib/visibility/types";

interface VisibilityData {
  trends: {
    mentionRate: number;
    citationRate: number;
    mentionSourceRatio: number | null;
    brandArchetype: BrandArchetype;
    citationVolatilityScore: number | null;
    scoreCompositeAvg: number | null;
  } | null;
  sov: Array<{
    competitorDomain: string;
    brandShare: number;
    competitorShare: number;
    engine?: string;
  }>;
  fanOut: Array<{
    originalPrompt: string;
    results: Array<{
      subQuery: string;
      subQueryRank: number;
      brandAppeared: boolean;
      brandPosition: number | null;
      contentSimilarityScore: string | null;
      aboveThreshold: boolean;
    }>;
  }>;
  gaps: Array<{
    id: string;
    topicCluster: string;
    topicLabel: string;
    brandHasContent: boolean;
    crossPromptImpact: number | null;
    estimatedCitationImpact: string | null;
    competitorCoverage: Array<{ domain: string; has_content: boolean; depth: number }>;
  }>;
  tier: string;
  brandDomain: string;
}

interface BenchmarkData {
  competitors: Array<{
    competitorDomain: string;
    verdicts: Array<{
      engine: string;
      brandWon: boolean | null;
      brandMentioned: boolean;
      competitorMentioned: boolean;
    }>;
    wins: number;
    losses: number;
    inconclusive: number;
  }>;
  summary: {
    totalWins: number;
    totalLosses: number;
    totalInconclusive: number;
    topicalGapsOwned: number;
    fastestPath: string | null;
  };
}

export default function VisibilityPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const [data, setData] = useState<VisibilityData | null>(null);
  const [benchmarkData, setBenchmarkData] = useState<BenchmarkData | null>(null);
  const [benchmarkLoading, setBenchmarkLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [visRes, fanOutRes, gapsRes] = await Promise.all([
          fetch(`/api/brands/${brandId}/visibility`),
          fetch(`/api/brands/${brandId}/fan-out`),
          fetch(`/api/brands/${brandId}/topical-gaps`),
        ]);

        if (!visRes.ok || !fanOutRes.ok || !gapsRes.ok) {
          setError("Failed to load visibility data");
          return;
        }

        const vis = await visRes.json();
        const fanOut = await fanOutRes.json();
        const gaps = await gapsRes.json();

        setData({
          trends: vis.trends,
          sov: vis.sov ?? [],
          fanOut: fanOut.groups ?? [],
          gaps: gaps.gaps ?? [],
          tier: vis.tier ?? "starter",
          brandDomain: vis.brandDomain ?? "",
        });
      } catch {
        setError("Failed to load visibility data");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [brandId]);

  useEffect(() => {
    if (!data) return;
    fetch(`/api/brands/${brandId}/competitive-benchmark`)
      .then(async (res) => {
        if (res.ok) {
          const bm = await res.json();
          setBenchmarkData({
            competitors: bm.competitors ?? [],
            summary: bm.summary ?? { totalWins: 0, totalLosses: 0, totalInconclusive: 0, topicalGapsOwned: 0, fastestPath: null },
          });
        }
      })
      .finally(() => setBenchmarkLoading(false));
  }, [data, brandId]);

  if (error) {
    return (
      <div className="p-6">
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      </div>
    );
  }

  const hasData = !loading && data && (data.trends || data.sov.length > 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LayerBadge layer="visibility" />
          <h1
            className="text-lg font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            Visibility Intelligence
          </h1>
          {data?.trends?.citationVolatilityScore != null && (
            <VolatilityIndicator
              score={data.trends.citationVolatilityScore}
              loading={loading}
            />
          )}
        </div>
        <Link
          href={`/brands/${brandId}/visibility/citation-failure`}
          className="text-xs font-medium px-3 py-1.5 rounded-md"
          style={{
            background: "var(--bg-elevated)",
            color: "var(--text-secondary)",
            border: "1px solid var(--border-default)",
          }}
        >
          Citation Failure Diagnosis
        </Link>
      </div>

      {!hasData && !loading && (
        <EmptyState message="Run an audit to see visibility intelligence" />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SovDonut
          entries={data?.sov ?? []}
          brandDomain={data?.brandDomain ?? ""}
          loading={loading}
        />
        <MentionSourceMatrix
          mentionRate={data?.trends?.mentionRate ?? 0}
          citationRate={data?.trends?.citationRate ?? 0}
          mentionSourceRatio={data?.trends?.mentionSourceRatio ?? null}
          brandArchetype={data?.trends?.brandArchetype ?? "invisible"}
          loading={loading}
        />
      </div>

      {(loading || (data?.fanOut?.length ?? 0) > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {(data?.fanOut ?? []).slice(0, 2).map((group, i) => (
            <FanOutTree
              key={i}
              originalPrompt={group.originalPrompt}
              results={group.results}
              loading={loading}
            />
          ))}
          {loading && !data && (
            <>
              <FanOutTree originalPrompt="" results={[]} loading />
              <FanOutTree originalPrompt="" results={[]} loading />
            </>
          )}
        </div>
      )}

      <TopicalGapList gaps={data?.gaps ?? []} loading={loading} />

      <CompetitiveBenchmarkPanel
        data={benchmarkData}
        tier={data?.tier ?? "starter"}
        loading={loading || benchmarkLoading}
      />
    </div>
  );
}
