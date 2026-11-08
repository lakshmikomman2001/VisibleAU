"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useBrandFeatureGate } from "@/components/domain/pricing/brand-feature-gate";
import { PlanLockBadge } from "@/components/domain/pricing/plan-lock";
import { LayerBadge } from "@/components/phase2/layer-badge";

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
  },
  {
    key: "comparisons",
    label: "Competitor Comparisons",
    desc: "Head-to-head brand vs competitor prompts",
    href: "comparisons",
  },
] as const;

export default function DiscoveryHubPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const [stats, setStats] = useState<DiscoveryStats>({ journeyCount: 0, comparisonCount: 0 });
  const [loading, setLoading] = useState(true);
  const journeysGate = useBrandFeatureGate("journeys");
  const comparisonsGate = useBrandFeatureGate("competitor_comparisons");
  const journeyLocked = journeysGate.locked;
  const comparisonLocked = comparisonsGate.locked;

  useEffect(() => {
    const loadStats = async () => {
      const [jRes, cRes] = await Promise.all([
        journeyLocked ? null : fetch(`/api/brands/${brandId}/journeys`),
        comparisonLocked ? null : fetch(`/api/brands/${brandId}/comparisons`),
      ]);

      if (jRes && !(await journeysGate.planRefused(jRes)) && jRes.ok) {
        const jData = await jRes.json();
        const journeys = jData?.journeys ?? (Array.isArray(jData) ? jData : []);
        setStats((s) => ({ ...s, journeyCount: journeys.length }));
      }

      if (cRes && !(await comparisonsGate.planRefused(cRes)) && cRes.ok) {
        const cData = await cRes.json();
        const comparisons = Array.isArray(cData) ? cData : (cData?.comparisons ?? []);
        setStats((s) => ({ ...s, comparisonCount: comparisons.length }));
      }

      setLoading(false);
    };
    loadStats();
  }, [
    brandId,
    journeyLocked,
    comparisonLocked,
    journeysGate.planRefused,
    comparisonsGate.planRefused,
  ]);

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
              <Link
                key={tile.key}
                href={`/brands/${brandId}/discovery/${tile.href}`}
                className="group block rounded-lg border p-5 transition-all"
                style={{
                  borderColor: "var(--border-default)",
                  backgroundColor: "var(--bg-elevated)",
                }}
              >
                <p className="font-medium" style={{ color: "var(--text-primary)" }}>
                  {tile.label}
                  {locked && (
                    <PlanLockBadge
                      feature={tile.key === "journeys" ? "journeys" : "competitor_comparisons"}
                    />
                  )}
                </p>
                <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
                  {tile.desc}
                </p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                    {locked ? "" : `${count} ${tile.key === "journeys" ? "journeys" : "results"}`}
                  </span>
                  <span className="text-sm" style={{ color: "var(--layer-discovery)" }}>
                    View &rarr;
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
