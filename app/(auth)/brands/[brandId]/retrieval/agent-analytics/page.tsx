"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { LayerBadge } from "@/components/phase2/layer-badge";
import { TierGate } from "@/components/phase2/tier-gate";
import { AgentAnalyticsCrawlerCard } from "@/components/domain/retrieval/agent-analytics-crawler-card";
import { AgentAnalyticsSection } from "@/components/domain/retrieval/agent-analytics-section";
import { AgentAnalyticsSetupPanel } from "@/components/domain/retrieval/agent-analytics-setup-panel";
import { AgentAnalyticsPagesCoverage } from "@/components/domain/retrieval/agent-analytics-pages-coverage";

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
  const [ratioLocked, setRatioLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [fetchKey, setFetchKey] = useState(0);

  const handleUploadComplete = useCallback(() => {
    setTimeout(() => setFetchKey((k) => k + 1), 2000);
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/brands/${brandId}/agent-analytics/overview`).then(async (r) => {
        if (r.status === 403) return null;
        if (!r.ok) throw new Error("overview failed");
        return r.json();
      }),
      fetch(`/api/brands/${brandId}/agent-analytics/ratio`).then(async (r) => {
        if (r.status === 403) { setRatioLocked(true); return null; }
        if (!r.ok) return null;
        return r.json();
      }),
    ])
      .then(([overviewRes, ratioRes]) => {
        if (overviewRes) setOverview(overviewRes);
        if (ratioRes) setRatioData(ratioRes);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [brandId, fetchKey]);

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
        <div
          className="rounded-lg border p-6 text-center"
          style={{ borderColor: "color-mix(in srgb, var(--danger) 40%, transparent)", color: "var(--danger)" }}
        >
          <p className="font-medium">Failed to load Agent Analytics data</p>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>Please try again later.</p>
        </div>
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="space-y-6 p-6">
        <LayerBadge layer="retrieval" />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>Agent Analytics</h1>
        <AgentAnalyticsSetupPanel
          brandId={brandId}
          totalHits={0}
          onUploadComplete={handleUploadComplete}
        />
      </div>
    );
  }

  const totalHits = overview.overview.volumeByPurpose.reduce((s, p) => s + p.count, 0);
  const retrievalHits = overview.overview.volumeByPurpose.find((p) => p.purpose === "retrieval")?.count ?? 0;
  const indexingHits = overview.overview.volumeByPurpose.find((p) => p.purpose === "indexing")?.count ?? 0;
  const trainingHits = overview.overview.volumeByPurpose.find((p) => p.purpose === "training")?.count ?? 0;

  const totalVerified = overview.overview.verificationRates.reduce((s, r) => s + r.verified, 0);
  const totalUnverified = overview.overview.verificationRates.reduce((s, r) => s + r.unverified, 0);
  const totalSpoofed = overview.overview.verificationRates.reduce((s, r) => s + r.spoofed, 0);

  return (
    <div className="space-y-6 p-6">
      <LayerBadge layer="retrieval" />
      <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>Agent Analytics</h1>

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
      />

      {/* Full metrics section */}
      <AgentAnalyticsSection
        overview={overview.overview}
        ratioData={ratioData?.ratio ?? null}
        ratioLocked={ratioLocked}
        brandId={brandId}
      />

      {/* Pages & Coverage — Growth-gated (server gate on route, client overlay here) */}
      <TierGate requiredTier="Growth" locked={ratioLocked}>
        <AgentAnalyticsPagesCoverage brandId={brandId} />
      </TierGate>
    </div>
  );
}
