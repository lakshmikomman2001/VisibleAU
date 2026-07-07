"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { LayerBadge } from "@/components/phase2/layer-badge";
import { TierGate } from "@/components/phase2/tier-gate";
import { TrustScoreCard } from "@/components/domain/trust/trust-score-card";

interface TrustSummary {
  hallucinationRisk: number;
  entityScore: number;
  linkedinPresenceScore: number | null;
  consensusScore: number | null;
  youtubePresenceScore: number | null;
  overallTrustScore: number;
  rationale: string;
  confidence_label: string | null;
  confidence_note: string | null;
  top_action: string | null;
  riskLevel: "Low" | "Medium" | "High";
  riskRationale: string;
}

const TRUST_TILES = [
  { key: "hallucinations", label: "Hallucination Incidents", href: "hallucinations" },
  { key: "evidence", label: "Evidence Archive", href: "evidence" },
  { key: "citation-sources", label: "Citation Sources", href: "citation-sources" },
  { key: "linkedin", label: "LinkedIn Presence", href: "linkedin-presence" },
  { key: "consensus", label: "Consensus Score", href: "consensus" },
  { key: "entity", label: "Entity Score", href: "entity-score" },
  { key: "youtube", label: "YouTube Presence", href: "youtube-presence" },
] as const;

export default function TrustHubPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const [data, setData] = useState<TrustSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [tierLocked, setTierLocked] = useState(false);

  useEffect(() => {
    fetch(`/api/brands/${brandId}/trust`)
      .then(async (res) => {
        if (res.status === 403) { setTierLocked(true); return; }
        if (res.ok) setData(await res.json());
      })
      .finally(() => setLoading(false));
  }, [brandId]);

  if (tierLocked) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="trust" />
        <TierGate requiredTier="Growth" locked><div /></TierGate>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="trust" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg" style={{ backgroundColor: "color-mix(in srgb, var(--foreground) 8%, transparent)" }} />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="trust" />
        <div className="flex flex-col items-center gap-2 py-12 text-center" style={{ color: "var(--muted)" }}>
          <p className="text-lg font-medium">Run an audit to see trust intelligence</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <LayerBadge layer="trust" />
      <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>Trust Intelligence</h1>

      <TrustScoreCard
        label="Hallucination Risk"
        score={data.hallucinationRisk}
        maxScore={100}
        lowerIsBetter
        rationale={data.riskRationale}
        confidenceLabel={data.riskLevel}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TRUST_TILES.map((tile) => (
          <Link
            key={tile.key}
            href={`/brands/${brandId}/trust/${tile.href}`}
            className="group rounded-lg border p-4 transition-all"
            style={{
              borderColor: "color-mix(in srgb, var(--foreground) 12%, transparent)",
              backgroundColor: "var(--background)",
            }}
          >
            <p className="font-medium" style={{ color: "var(--foreground)" }}>{tile.label}</p>
            <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>View details &rarr;</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
