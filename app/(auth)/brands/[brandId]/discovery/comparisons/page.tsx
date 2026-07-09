"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { LayerBadge } from "@/components/phase2/layer-badge";
import { TierGate } from "@/components/phase2/tier-gate";
import { ComparisonVerdictCard } from "@/components/domain/discovery/comparison-verdict-card";

interface ComparisonResult {
  id: string;
  competitorDomain: string;
  engine: string;
  brandWon: boolean | null;
  brandMentioned: boolean;
  competitorMentioned: boolean;
  rawResponse: string | null;
  runAt: string;
}

export default function ComparisonsPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const [results, setResults] = useState<ComparisonResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    fetch(`/api/brands/${brandId}/comparisons`)
      .then(async (res) => {
        if (res.status === 403) { setLocked(true); return; }
        if (res.ok) setResults(await res.json());
      })
      .finally(() => setLoading(false));
  }, [brandId]);

  if (locked) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="discovery" />
        <TierGate requiredTier="Growth" locked><div className="h-64" /></TierGate>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="discovery" />
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg" style={{ backgroundColor: "color-mix(in srgb, var(--text-primary) 8%, transparent)" }} />
          ))}
        </div>
      </div>
    );
  }

  const grouped = results.reduce<Record<string, ComparisonResult[]>>((acc, r) => {
    (acc[r.competitorDomain] ??= []).push(r);
    return acc;
  }, {});

  const competitors = Object.keys(grouped).sort();

  const summary = {
    wins: results.filter((r) => r.brandWon === true).length,
    losses: results.filter((r) => r.brandWon === false).length,
    inconclusive: results.filter((r) => r.brandWon === null).length,
  };

  return (
    <div className="space-y-6 p-6">
      <LayerBadge layer="discovery" />
      <h1 className="text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
        Competitor Comparisons
      </h1>

      {results.length === 0 ? (
        <div className="py-12 text-center" style={{ color: "var(--text-tertiary)" }}>
          <p className="text-lg font-medium">Add competitors to your brand to see head-to-head results</p>
          <p className="mt-1 text-sm">Comparisons will appear after your next audit</p>
        </div>
      ) : (
        <>
          <div className="flex gap-4">
            {[
              { label: "Wins", value: summary.wins, color: "var(--success)" },
              { label: "Losses", value: summary.losses, color: "var(--danger)" },
              { label: "Inconclusive", value: summary.inconclusive, color: "var(--warning)" },
            ].map((s) => (
              <div
                key={s.label}
                className="flex-1 rounded-lg border p-4 text-center"
                style={{ borderColor: "var(--border-default)", backgroundColor: "var(--bg-elevated)" }}
              >
                <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
                <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{s.label}</p>
              </div>
            ))}
          </div>

          {competitors.map((comp) => (
            <div key={comp}>
              <h2 className="text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
                vs {comp}
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {grouped[comp].map((r) => (
                  <ComparisonVerdictCard
                    key={r.id}
                    competitorDomain={r.competitorDomain}
                    engine={r.engine}
                    brandWon={r.brandWon}
                    brandMentioned={r.brandMentioned}
                    competitorMentioned={r.competitorMentioned}
                  />
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
