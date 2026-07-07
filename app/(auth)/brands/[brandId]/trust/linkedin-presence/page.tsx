"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { LayerBadge } from "@/components/phase2/layer-badge";
import { LinkedinPresenceScorecard } from "@/components/domain/trust/linkedin-presence-scorecard";
import { LinkedinGapRow } from "@/components/domain/trust/linkedin-gap-row";

interface LinkedinData {
  presenceScore: number | null;
  companyPageExists: boolean | null;
  companyPageFollowers: number | null;
  companyPosts30d: number | null;
  founderProfileExists: boolean | null;
  founderFollowers: number | null;
  founderPosts30d: number | null;
  gaps: string[];
  rationale: string;
  confidence_label: string | null;
  scoreLevel: "Low" | "Medium" | "High" | null;
  top_action: string | null;
}

export default function LinkedinPresencePage() {
  const { brandId } = useParams<{ brandId: string }>();
  const [data, setData] = useState<LinkedinData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = () => {
    fetch(`/api/brands/${brandId}/linkedin-presence`)
      .then(async (res) => { if (res.ok) setData(await res.json()); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, [brandId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetch(`/api/brands/${brandId}/linkedin-presence/refresh`, { method: "POST" });
    loadData();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="trust" />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>LinkedIn Presence</h1>
        <div className="h-48 animate-pulse rounded-lg" style={{ backgroundColor: "color-mix(in srgb, var(--foreground) 8%, transparent)" }} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="trust" />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>LinkedIn Presence</h1>
        <div className="flex flex-col items-center gap-2 py-12 text-center" style={{ color: "var(--muted)" }}>
          <p className="text-lg font-medium">Add your LinkedIn URLs and run an audit</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <LayerBadge layer="trust" />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>LinkedIn Presence</h1>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="rounded px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
          style={{ backgroundColor: "var(--accent-primary)", color: "var(--accent-primary-fg)" }}
        >
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <LinkedinPresenceScorecard data={data} />

      {data.gaps.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-medium" style={{ color: "var(--foreground)" }}>Gaps</h2>
          {data.gaps.map((gap, i) => (
            <LinkedinGapRow key={i} gap={gap} />
          ))}
        </div>
      )}
    </div>
  );
}
