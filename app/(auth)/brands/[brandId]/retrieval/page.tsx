"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { LayerBadge } from "@/components/phase2/layer-badge";
import { TierGate } from "@/components/phase2/tier-gate";
import { RetrievalScoreSummary } from "@/components/domain/retrieval/retrieval-score-summary";

interface RetrievalData {
  agentReadiness: { totalScore: number | null } | null;
  contentPages: Array<{ citationProbabilityScore: string | null }>;
  recentVisits: Array<Record<string, unknown>>;
}

const RETRIEVAL_TILES = [
  { key: "agent-analytics", label: "Agent Analytics", href: "agent-analytics" },
  { key: "crawler-logs", label: "Crawler Logs", href: "crawler-logs" },
  { key: "content-structure", label: "Content Structure", href: "content-structure" },
  { key: "agent-readiness", label: "Agent Readiness", href: "agent-readiness" },
  { key: "entity-home", label: "Entity Home", href: "entity-home" },
  { key: "llmstxt", label: "llms.txt", href: "llmstxt" },
] as const;

export default function RetrievalHubPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const [data, setData] = useState<RetrievalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tierLocked, setTierLocked] = useState(false);

  useEffect(() => {
    fetch(`/api/brands/${brandId}/retrieval-audit`)
      .then(async (res) => {
        if (res.status === 403) { setTierLocked(true); return; }
        if (res.ok) setData(await res.json());
      })
      .finally(() => setLoading(false));
  }, [brandId]);

  if (tierLocked) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="retrieval" />
        <TierGate requiredTier="Growth" locked><div /></TierGate>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="retrieval" />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg" style={{ backgroundColor: "color-mix(in srgb, var(--foreground) 8%, transparent)" }} />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="retrieval" />
        <div className="flex flex-col items-center gap-2 py-12 text-center" style={{ color: "var(--muted)" }}>
          <p className="text-lg font-medium">Run an audit to see retrieval intelligence</p>
        </div>
      </div>
    );
  }

  const avgCitProb = data.contentPages.length > 0
    ? data.contentPages.reduce((s, p) => s + Number(p.citationProbabilityScore ?? 0), 0) / data.contentPages.length
    : 0;

  return (
    <div className="space-y-6 p-6">
      <LayerBadge layer="retrieval" />
      <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>Retrieval Intelligence</h1>

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
            <p className="font-medium" style={{ color: "var(--foreground)" }}>{tile.label}</p>
            <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>View details &rarr;</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
