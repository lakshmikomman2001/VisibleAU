"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useBrandFeatureGate } from "@/components/domain/pricing/brand-feature-gate";
import { PlanLockedCard } from "@/components/domain/pricing/plan-lock";
import { AgentAnalyticsCrawlerCard } from "@/components/domain/retrieval/agent-analytics-crawler-card";
import { AgentAnalyticsPagesCoverage } from "@/components/domain/retrieval/agent-analytics-pages-coverage";
import { AgentAnalyticsSection } from "@/components/domain/retrieval/agent-analytics-section";
import { AgentAnalyticsSetupPanel } from "@/components/domain/retrieval/agent-analytics-setup-panel";
import { LayerBadge } from "@/components/phase2/layer-badge";
import { LoadError } from "@/components/shared/load-error";

interface OverviewData {
  overview: {
    volumeByVendor: Array<{
      vendor: string;
      crawlerTier: string;
      total: number;
      retrieval: number;
      indexing: number;
      training: number;
    }>;
    volumeByPurpose: Array<{ purpose: string; count: number; percentage: number }>;
    verificationRates: Array<{
      vendor: string;
      verified: number;
      unverified: number;
      spoofed: number;
      total: number;
      unverifiedRate: number;
      spoofedRate: number;
    }>;
    periodStart: string;
    periodEnd: string;
  };
}

interface RatioData {
  ratio: {
    results: Array<{
      vendor: string;
      verifiedCrawls: number;
      referralSessions: number;
      ratio: number | null;
      ratioLabel: string;
      benchmark: number | null;
    }>;
    caveat: string;
    periodStart: string;
    periodEnd: string;
  };
}

export default function AgentAnalyticsPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [ratioData, setRatioData] = useState<RatioData | null>(null);
  // Follow-ups from af8de42..d1eb5a1, part 1: a failed ratio fetch was `return null`, which the crawler card
  // showed as "No referral data available yet". It's the card's own "Couldn't load" now; the rest still shows.
  const [ratioFailed, setRatioFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [fetchKey, setFetchKey] = useState(0);
  const { locked, planRefused } = useBrandFeatureGate("agent_analytics");
  const ratioGate = useBrandFeatureGate("crawl_referral_ratio");
  const ratioLocked = ratioGate.locked;

  const handleUploadComplete = useCallback(() => {
    setTimeout(() => setFetchKey((k) => k + 1), 2000);
  }, []);

  useEffect(() => {
    if (locked) return;
    setLoading(true);
    setError(false);
    setRatioFailed(false);
    Promise.all([
      fetch(`/api/brands/${brandId}/agent-analytics/overview`).then(async (r) => {
        if (await planRefused(r)) return null;
        if (!r.ok) throw new Error("overview failed");
        return r.json();
      }),
      ratioLocked
        ? null
        : fetch(`/api/brands/${brandId}/agent-analytics/ratio`).then(
            async (r) => {
              if (await ratioGate.planRefused(r)) return null;
              if (!r.ok) {
                setRatioFailed(true);
                return null;
              }
              return r.json();
            },
            () => {
              setRatioFailed(true);
              return null;
            },
          ),
    ])
      .then(([overviewRes, ratioRes]) => {
        if (overviewRes) setOverview(overviewRes);
        if (ratioRes) setRatioData(ratioRes);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [brandId, fetchKey, locked, planRefused, ratioLocked, ratioGate.planRefused]);

  if (locked) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="retrieval" />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
          Agent Analytics
        </h1>
        <PlanLockedCard feature="agent_analytics" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="retrieval" />
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-lg"
              style={{ backgroundColor: "color-mix(in srgb, var(--foreground) 8%, transparent)" }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="retrieval" />
        <LoadError what="your Agent Analytics" onRetry={() => setFetchKey((k) => k + 1)} />
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="space-y-6 p-6">
        <LayerBadge layer="retrieval" />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
          Agent Analytics
        </h1>
        <AgentAnalyticsSetupPanel
          brandId={brandId}
          totalHits={0}
          onUploadComplete={handleUploadComplete}
        />
      </div>
    );
  }

  const totalHits = overview.overview.volumeByPurpose.reduce((s, p) => s + p.count, 0);
  const retrievalHits =
    overview.overview.volumeByPurpose.find((p) => p.purpose === "retrieval")?.count ?? 0;
  const indexingHits =
    overview.overview.volumeByPurpose.find((p) => p.purpose === "indexing")?.count ?? 0;
  const trainingHits =
    overview.overview.volumeByPurpose.find((p) => p.purpose === "training")?.count ?? 0;

  const totalVerified = overview.overview.verificationRates.reduce((s, r) => s + r.verified, 0);
  const totalUnverified = overview.overview.verificationRates.reduce((s, r) => s + r.unverified, 0);
  const totalSpoofed = overview.overview.verificationRates.reduce((s, r) => s + r.spoofed, 0);

  return (
    <div className="space-y-6 p-6">
      <LayerBadge layer="retrieval" />
      <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
        Agent Analytics
      </h1>

      <AgentAnalyticsSetupPanel
        brandId={brandId}
        totalHits={totalHits}
        onUploadComplete={handleUploadComplete}
      />

      {/* The S9 crawler card — COUNT card, not score card (AA-P7) */}
      <AgentAnalyticsCrawlerCard
        retrievalHits={retrievalHits}
        indexingHits={indexingHits}
        trainingHits={trainingHits}
        totalHits={totalHits}
        verified={totalVerified}
        unverified={totalUnverified}
        spoofed={totalSpoofed}
        ratioData={ratioData?.ratio ?? null}
        ratioLocked={ratioLocked}
        ratioFailed={ratioFailed}
        onRetryRatio={() => setFetchKey((k) => k + 1)}
      />

      {/* Full metrics section */}
      <AgentAnalyticsSection
        overview={overview.overview}
        ratioData={ratioData?.ratio ?? null}
        ratioLocked={ratioLocked}
        brandId={brandId}
      />

      {/* Pages & Coverage: locks itself on a plan without it, before fetching */}
      <AgentAnalyticsPagesCoverage brandId={brandId} />
    </div>
  );
}
