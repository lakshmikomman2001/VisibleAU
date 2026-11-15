"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CompetitiveBenchmarkPanel } from "@/components/domain/visibility/competitive-benchmark-panel";
import { FanOutTree } from "@/components/domain/visibility/fan-out-tree";
import { MentionsAndSourcesCard } from "@/components/domain/visibility/mentions-and-sources-card";
import { SovDonut } from "@/components/domain/visibility/sov-donut";
import { EmptyState } from "@/components/phase2/empty-state";
import { LayerBadge } from "@/components/phase2/layer-badge";
import type { MentionsAndSources } from "@/lib/visibility/mentions-and-sources";
import type { SovPayload } from "@/lib/visibility/share-of-voice-display";

interface VisibilityData {
  /** One Share of Voice (7 Nov): the shared counter's figures for the latest complete audit. */
  shareOfVoice: SovPayload | null;
  /** 17 Nov, part 1: the same audit's mentions and sources, by the audit page's definitions. */
  mentionsAndSources: MentionsAndSources | null;
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
  // "Pause query simulation" (Sri's decision, 23 Oct) -- true while
  // QUERY_SIMULATION_ENABLED is false. fanOut is always [] in that
  // state (the route never reads stale, wrong-vertical rows), but
  // "paused" vs. "genuinely no fan-out data yet" need different copy.
  fanOutPaused: boolean;
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
  };
  /** The audit whose head-to-head questions these are. */
  audit: { number: number; completedAt: string | null } | null;
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
        // 17 Nov, part 3: no topical gaps -- topical_coverage_gaps isn't a measurement ("No content" was a default
        // for every question the calculator couldn't match, and "improves N prompts" counted library prompts of
        // every vertical: inngest/functions/calculate-topical-gaps.ts).
        const [visRes, fanOutRes] = await Promise.all([
          fetch(`/api/brands/${brandId}/visibility`),
          fetch(`/api/brands/${brandId}/fan-out`),
        ]);

        if (!visRes.ok || !fanOutRes.ok) {
          setError("Failed to load visibility data");
          return;
        }

        const vis = await visRes.json();
        const fanOut = await fanOutRes.json();

        setData({
          shareOfVoice: vis.shareOfVoice ?? null,
          mentionsAndSources: vis.mentionsAndSources ?? null,
          fanOut: fanOut.groups ?? [],
          fanOutPaused: fanOut.paused === true,
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
          // 17 Nov, part 3: no zeros made up for a missing summary.
          if (bm.summary)
            setBenchmarkData({
              competitors: bm.competitors ?? [],
              summary: bm.summary,
              audit: bm.audit ?? null,
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

  const hasData =
    !loading &&
    data &&
    ((data.mentionsAndSources && data.mentionsAndSources.state !== "no_audit") ||
      data.shareOfVoice?.measured);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LayerBadge layer="visibility" />
          <h1 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            Visibility Intelligence
          </h1>
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

      {!hasData && !loading && <EmptyState message="Run an audit to see visibility intelligence" />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SovDonut sov={data?.shareOfVoice ?? null} loading={loading} />
        <MentionsAndSourcesCard data={data?.mentionsAndSources ?? null} loading={loading} />
      </div>

      {/* 17 Nov, part 2: query simulation is paused (QUERY_SIMULATION_ENABLED): the section isn't shown at all --
          no "being rebuilt and will return soon" -- until it works. */}
      {!loading && data && !data.fanOutPaused && data.fanOut.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {data.fanOut.slice(0, 2).map((group) => (
            <FanOutTree
              key={group.originalPrompt}
              originalPrompt={group.originalPrompt}
              results={group.results}
            />
          ))}
        </div>
      )}

      <CompetitiveBenchmarkPanel
        data={benchmarkData}
        tier={data?.tier ?? "starter"}
        loading={loading || benchmarkLoading}
      />
    </div>
  );
}
