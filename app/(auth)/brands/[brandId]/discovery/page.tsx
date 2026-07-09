"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { LayerBadge } from "@/components/phase2/layer-badge";
import { TierGate } from "@/components/phase2/tier-gate";

interface DiscoveryStats {
  journeyCount: number;
  comparisonCount: number;
}

const DISCOVERY_TILES = [
  {
    key: "journeys",
    label: "Conversational Journeys",
    desc: "Multi-turn discovery simulations across AI engines",
    href: "journeys",
    tier: "Agency",
  },
  {
    key: "comparisons",
    label: "Competitor Comparisons",
    desc: "Head-to-head brand vs competitor prompts",
    href: "comparisons",
    tier: "Growth",
  },
] as const;

export default function DiscoveryHubPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const [stats, setStats] = useState<DiscoveryStats>({ journeyCount: 0, comparisonCount: 0 });
  const [loading, setLoading] = useState(true);
  const [journeyLocked, setJourneyLocked] = useState(false);
  const [comparisonLocked, setComparisonLocked] = useState(false);

  useEffect(() => {
    const loadStats = async () => {
      const [jRes, cRes] = await Promise.all([
        fetch(`/api/brands/${brandId}/journeys`),
        fetch(`/api/brands/${brandId}/comparisons`),
      ]);

      if (jRes.status === 403) setJourneyLocked(true);
      else if (jRes.ok) {
        const j = await jRes.json();
        setStats((s) => ({ ...s, journeyCount: Array.isArray(j) ? j.length : 0 }));
      }

      if (cRes.status === 403) setComparisonLocked(true);
      else if (cRes.ok) {
        const c = await cRes.json();
        setStats((s) => ({ ...s, comparisonCount: Array.isArray(c) ? c.length : 0 }));
      }

      setLoading(false);
    };
    loadStats();
  }, [brandId]);

  return (
    <div className="space-y-6 p-6">
      <LayerBadge layer="discovery" />
      <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
        Discovery Intelligence
      </h1>
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        Understand how AI engines discover and recommend your brand across multi-turn conversations.
      </p>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-lg"
              style={{ backgroundColor: "color-mix(in srgb, var(--text-primary) 8%, transparent)" }}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {DISCOVERY_TILES.map((tile) => {
            const locked = tile.key === "journeys" ? journeyLocked : comparisonLocked;
            const count = tile.key === "journeys" ? stats.journeyCount : stats.comparisonCount;

            return (
              <TierGate key={tile.key} requiredTier={tile.tier} locked={locked}>
                <Link
                  href={`/brands/${brandId}/discovery/${tile.href}`}
                  className="group block rounded-lg border p-5 transition-all"
                  style={{
                    borderColor: "var(--border-default)",
                    backgroundColor: "var(--bg-elevated)",
                  }}
                >
                  <p className="font-medium" style={{ color: "var(--text-primary)" }}>{tile.label}</p>
                  <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>{tile.desc}</p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                      {count} {tile.key === "journeys" ? "journeys" : "results"}
                    </span>
                    <span className="text-sm" style={{ color: "var(--layer-discovery)" }}>
                      View &rarr;
                    </span>
                  </div>
                </Link>
              </TierGate>
            );
          })}
        </div>
      )}
    </div>
  );
}
