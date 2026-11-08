"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { usePlanTier } from "@/components/domain/plan-tier-context";
import { PlanLockBadge } from "@/components/domain/pricing/plan-lock";
import { RetrievalScoreSummary } from "@/components/domain/retrieval/retrieval-score-summary";
import { LayerBadge } from "@/components/phase2/layer-badge";
import { type BrandFeature, brandFeatureLockedFor } from "@/lib/pricing/brand-features";
import { measured } from "@/lib/scoring/measured";

interface RetrievalData {
  agentReadiness: { totalScore: number | null } | null;
  contentPages: Array<{ citationProbabilityScore: string | null }>;
  recentVisits: Array<Record<string, unknown>>;
}

// A tile whose page needs a plan (lib/pricing/brand-features.ts) shows the lock and the plan's name where
// the workspace's plan doesn't have it; the page shows the locked card.
const RETRIEVAL_TILES: ReadonlyArray<{
  key: string;
  label: string;
  href: string;
  lock?: BrandFeature;
}> = [
  {
    key: "agent-analytics",
    label: "Agent Analytics",
    href: "agent-analytics",
    lock: "agent_analytics",
  },
  { key: "crawler-logs", label: "Crawler Logs", href: "crawler-logs" },
  { key: "content-structure", label: "Content Structure", href: "content-structure" },
  {
    key: "agent-readiness",
    label: "Agent Readiness",
    href: "agent-readiness",
    lock: "agent_readiness",
  },
  { key: "entity-home", label: "Entity Home", href: "entity-home" },
  { key: "llmstxt", label: "llms.txt", href: "llmstxt" },
];

export default function RetrievalHubPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const [data, setData] = useState<RetrievalData | null>(null);
  const [loading, setLoading] = useState(true);
  const planTier = usePlanTier();

  useEffect(() => {
    fetch(`/api/brands/${brandId}/retrieval-audit`)
      .then(async (res) => {
        if (res.ok) setData(await res.json());
      })
      .finally(() => setLoading(false));
  }, [brandId]);

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="retrieval" />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-lg"
              style={{ backgroundColor: "color-mix(in srgb, var(--foreground) 8%, transparent)" }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="retrieval" />
        <div
          className="flex flex-col items-center gap-2 py-12 text-center"
          style={{ color: "var(--muted)" }}
        >
          <p className="text-lg font-medium">Run an audit to see retrieval intelligence</p>
        </div>
      </div>
    );
  }

  // 9 Nov (part 9): the average is over the pages that were scored; with none scored it is null ("Not
  // measured yet"), never 0% (lib/scoring/measured.ts).
  const scoredProbs = data.contentPages.flatMap((p) => {
    const m = measured(p.citationProbabilityScore);
    return m.measured ? [m.value] : [];
  });
  const avgCitProb =
    scoredProbs.length > 0 ? scoredProbs.reduce((s, v) => s + v, 0) / scoredProbs.length : null;

  return (
    <div className="space-y-6 p-6">
      <LayerBadge layer="retrieval" />
      <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
        Retrieval Intelligence
      </h1>

      <RetrievalScoreSummary
        agentReadiness={data.agentReadiness?.totalScore ?? null}
        avgCitationProbability={avgCitProb}
        crawlerVisitCount={data.recentVisits.length}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {RETRIEVAL_TILES.map((tile) => (
          <Link
            key={tile.key}
            href={`/brands/${brandId}/retrieval/${tile.href}`}
            className="group rounded-lg border p-4 transition-all"
            style={{
              borderColor: "color-mix(in srgb, var(--foreground) 12%, transparent)",
              backgroundColor: "var(--background)",
            }}
          >
            <p className="font-medium" style={{ color: "var(--foreground)" }}>
              {tile.label}
              {tile.lock && brandFeatureLockedFor(planTier, tile.lock) && (
                <PlanLockBadge feature={tile.lock} />
              )}
            </p>
            <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
              View details &rarr;
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
