"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { usePlanTier } from "@/components/domain/plan-tier-context";
import { useBrandFeatureGate } from "@/components/domain/pricing/brand-feature-gate";
import { PlanLockBadge, PlanLockedCard } from "@/components/domain/pricing/plan-lock";
import { TrustScoreCard } from "@/components/domain/trust/trust-score-card";
import { LayerBadge } from "@/components/phase2/layer-badge";
import { LoadError } from "@/components/shared/load-error";
import { useGatedJson } from "@/lib/hooks/use-load";
import { type BrandFeature, brandFeatureLockedFor } from "@/lib/pricing/brand-features";
import { TRUST_CHECK_IMPLEMENTED } from "@/lib/trust/stub-implementation-status";

interface TrustSummary {
  hallucinationRisk: number;
  citationCount: number;
  // null = no brandEntityScores row yet (never audited), not a 0.
  entityScore: number | null;
  linkedinPresenceScore: number | null;
  consensusScore: number | null;
  youtubePresenceScore: number | null;
  // null = insufficient data to score (every component absent/excluded).
  overallTrustScore: number | null;
  // What a measured overall score is measured on; null when it isn't measured.
  overallBasis: string | null;
  rationale: string;
  confidence_label: string | null;
  confidence_note: string | null;
  top_action: string | null;
  // null = not enough AI coverage of this brand yet to assess risk.
  riskLevel: "Low" | "Medium" | "High" | null;
  riskRationale: string;
}

// Each page's feature (lib/pricing/brand-features.ts): a tile shows the lock and the plan where the
// workspace's plan doesn't have it, and its page shows the locked card.
// 9 Nov (mock-gate follow-ups, part 9): a tile for a check that isn't built (stub-implementation-status.ts) is
// hidden until it is -- a customer page doesn't announce an unbuilt feature, and has nothing to show for it.
const UNBUILT_TILES: ReadonlySet<string> = new Set(
  [
    TRUST_CHECK_IMPLEMENTED.hallucinationDetection ? null : "hallucinations",
    TRUST_CHECK_IMPLEMENTED.linkedinPresence ? null : "linkedin",
    TRUST_CHECK_IMPLEMENTED.consensusScore ? null : "consensus",
  ].filter((k): k is string => k !== null),
);

const TRUST_TILES: ReadonlyArray<{ key: string; label: string; href: string; lock: BrandFeature }> =
  [
    {
      key: "hallucinations",
      label: "Hallucination Incidents",
      href: "hallucinations",
      lock: "hallucinations",
    },
    { key: "evidence", label: "Evidence Archive", href: "evidence", lock: "evidence_archive" },
    {
      key: "citation-sources",
      label: "Citation Sources",
      href: "citation-sources",
      lock: "citation_sources",
    },
    {
      key: "linkedin",
      label: "LinkedIn Presence",
      href: "linkedin-presence",
      lock: "linkedin_presence",
    },
    { key: "consensus", label: "Consensus Score", href: "consensus", lock: "consensus_score" },
    { key: "entity", label: "Entity Score", href: "entity-score", lock: "entity_score" },
    {
      key: "youtube",
      label: "YouTube Presence",
      href: "youtube-presence",
      lock: "youtube_presence",
    },
  ];

export default function TrustHubPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const planTier = usePlanTier();
  const { locked, planRefused } = useBrandFeatureGate("trust_intelligence");
  // Follow-ups from af8de42..d1eb5a1, part 1: a failed fetch fell through to "Run an audit to see trust
  // intelligence". It says it couldn't load now, with Try again.
  const loaded = useGatedJson<TrustSummary>(`/api/brands/${brandId}/trust`, planRefused, {
    enabled: !locked,
  });
  const data = loaded.data;

  if (locked) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="trust" />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
          Trust Intelligence
        </h1>
        <PlanLockedCard feature="trust_intelligence" />
      </div>
    );
  }

  if (loaded.status === "error") {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="trust" />
        <LoadError what="your trust summary" detail={loaded.detail} onRetry={loaded.retry} />
      </div>
    );
  }

  if (loaded.status === "loading") {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="trust" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
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

  if (!data) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="trust" />
        <div
          className="flex flex-col items-center gap-2 py-12 text-center"
          style={{ color: "var(--muted)" }}
        >
          <p className="text-lg font-medium">Run an audit to see trust intelligence</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <LayerBadge layer="trust" />
      <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
        Trust Intelligence
      </h1>

      {/* Hidden until hallucination detection exists (part 9): no score, no announcement. */}
      {TRUST_CHECK_IMPLEMENTED.hallucinationDetection && (
        <TrustScoreCard
          label="Hallucination Risk"
          score={data.hallucinationRisk}
          maxScore={100}
          lowerIsBetter
          rationale={data.riskRationale}
          confidenceLabel={data.riskLevel}
          insufficientData={data.riskLevel === null}
        />
      )}

      <TrustScoreCard
        label="Overall Trust Score"
        score={data.overallTrustScore}
        basis={data.overallBasis ?? undefined}
        maxScore={100}
        rationale={data.rationale}
        confidenceLabel={null}
        insufficientData={data.overallTrustScore === null}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TRUST_TILES.filter((tile) => !UNBUILT_TILES.has(tile.key)).map((tile) => (
          <Link
            key={tile.key}
            href={`/brands/${brandId}/trust/${tile.href}`}
            className="group rounded-lg border p-4 transition-all"
            style={{
              borderColor: "color-mix(in srgb, var(--foreground) 12%, transparent)",
              backgroundColor: "var(--background)",
            }}
          >
            <p className="font-medium" style={{ color: "var(--foreground)" }}>
              {tile.label}
              {brandFeatureLockedFor(planTier, tile.lock) && <PlanLockBadge feature={tile.lock} />}
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
