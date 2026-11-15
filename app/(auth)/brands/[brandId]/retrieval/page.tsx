"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { usePlanTier } from "@/components/domain/plan-tier-context";
import { PlanLockBadge } from "@/components/domain/pricing/plan-lock";
import { RetrievalScoreSummary } from "@/components/domain/retrieval/retrieval-score-summary";
import { LayerBadge } from "@/components/phase2/layer-badge";
import { LoadError } from "@/components/shared/load-error";
import { useJson } from "@/lib/hooks/use-load";
import { type BrandFeature, brandFeatureLockedFor } from "@/lib/pricing/brand-features";
import { measured } from "@/lib/scoring/measured";

interface RetrievalData {
  agentReadiness: { totalScore: number | null; scoredAt?: string } | null;
  /** The readiness score from its measured parts (17 Nov, part 3), out of the points measured. */
  agentReadinessMeasured?: { points: number; measuredMax: number } | null;
  /** One row per page: each page's latest content structure check. */
  contentPages: Array<{ citationProbabilityScore: string | null; auditedAt?: string }>;
  /** Crawler visits recorded in the last `days` days. */
  crawlerVisits?: { count: number; days: number };
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
  const planTier = usePlanTier();
  // Follow-ups from af8de42..d1eb5a1, part 1: a failed fetch fell through to "Run an audit to see retrieval
  // intelligence". It says it couldn't load now, with Try again.
  const loaded = useJson<RetrievalData>(`/api/brands/${brandId}/retrieval-audit`);
  const data = loaded.data;

  if (loaded.status === "error") {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="retrieval" />
        <LoadError what="your retrieval summary" detail={loaded.detail} onRetry={loaded.retry} />
      </div>
    );
  }

  if (loaded.status === "loading") {
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
          style={{ color: "var(--text-secondary)" }}
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
  // 17 Nov, part 3: the readiness score out of the points that were measured, never the stored total with its
  // free points and unmeasured zeros.
  const readiness = data.agentReadinessMeasured;
  const readinessPoints = readiness && readiness.measuredMax > 0 ? readiness.points : null;

  return (
    <div className="space-y-6 p-6">
      <LayerBadge layer="retrieval" />
      <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
        Retrieval Intelligence
      </h1>

      <RetrievalScoreSummary
        agentReadiness={readinessPoints}
        agentReadinessMax={readiness?.measuredMax}
        avgCitationProbability={avgCitProb}
        citationPagesScored={scoredProbs.length}
        crawlerVisitCount={data.crawlerVisits?.count ?? null}
        crawlerVisitDays={data.crawlerVisits?.days}
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
            <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
              View details &rarr;
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
