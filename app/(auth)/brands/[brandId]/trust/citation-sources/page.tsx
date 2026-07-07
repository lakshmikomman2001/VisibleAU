"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { LayerBadge } from "@/components/phase2/layer-badge";
import { TierGate } from "@/components/phase2/tier-gate";
import { SourceGapCard } from "@/components/domain/trust/source-gap-card";

interface SourceRow {
  id: string;
  engine: string;
  sourceType: string;
  citationCount: number;
  citationShare: string;
  brandPresentInSource: boolean;
  gapSeverity: string;
  sourceAffinityNote: string | null;
}

export default function CitationSourcesPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tierLocked, setTierLocked] = useState(false);

  useEffect(() => {
    fetch(`/api/brands/${brandId}/citation-sources`)
      .then(async (res) => {
        if (res.status === 403) { setTierLocked(true); return; }
        if (res.ok) setSources(await res.json());
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
        <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>Citation Source Intelligence</h1>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-lg" style={{ backgroundColor: "color-mix(in srgb, var(--foreground) 8%, transparent)" }} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <LayerBadge layer="trust" />
      <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>Citation Source Intelligence</h1>

      {sources.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center" style={{ color: "var(--muted)" }}>
          <p className="text-lg font-medium">No citation source data yet</p>
          <p className="text-sm">Run an audit to analyse citation sources.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {sources.map((source) => (
            <SourceGapCard key={source.id} source={source} />
          ))}
        </div>
      )}
    </div>
  );
}
