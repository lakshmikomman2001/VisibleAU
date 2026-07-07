"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { LayerBadge } from "@/components/phase2/layer-badge";
import { EntityAuthorityGrid } from "@/components/domain/trust/entity-authority-grid";
import { KnowledgePanelCard } from "@/components/domain/trust/knowledge-panel-card";
import { WikidataStatusCard } from "@/components/domain/trust/wikidata-status-card";

interface EntityData {
  scoreOf10: string | null;
  abnVerified: boolean;
  abnNumber: string | null;
  abnEntityName: string | null;
  wikipediaAuPresent: boolean;
  wikipediaAuUrl: string | null;
  knowledgePanelPresent: boolean | null;
  knowledgePanelAccurate: boolean | null;
  knowledgePanelUrl: string | null;
  wikidataEntryPresent: boolean | null;
  wikidataEntryUrl: string | null;
  auDirectoryPresence: unknown[];
  rationale: string;
  confidence_label: string | null;
  scoreLevel: "Low" | "Medium" | "High" | null;
  top_action: string | null;
}

export default function EntityScorePage() {
  const { brandId } = useParams<{ brandId: string }>();
  const [data, setData] = useState<EntityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = () => {
    fetch(`/api/brands/${brandId}/entity-score`)
      .then(async (res) => { if (res.ok) setData(await res.json()); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadData(); }, [brandId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetch(`/api/brands/${brandId}/entity-score/refresh`, { method: "POST" });
    loadData();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="trust" />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>Entity Authority Score</h1>
        <div className="h-48 animate-pulse rounded-lg" style={{ backgroundColor: "color-mix(in srgb, var(--foreground) 8%, transparent)" }} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="trust" />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>Entity Authority Score</h1>
        <div className="flex flex-col items-center gap-2 py-12 text-center" style={{ color: "var(--muted)" }}>
          <p className="text-lg font-medium">Run an entity check</p>
        </div>
      </div>
    );
  }

  const displayScore = data.scoreOf10 ? Math.round(Number(data.scoreOf10) * 10) : 0;

  return (
    <div className="space-y-4 p-6">
      <LayerBadge layer="trust" />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>Entity Authority Score</h1>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="rounded px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
          style={{ backgroundColor: "var(--accent-primary)", color: "var(--accent-primary-fg)" }}
        >
          {refreshing ? "Checking..." : "Refresh"}
        </button>
      </div>

      <div className="rounded-lg border p-4" style={{ borderColor: "color-mix(in srgb, var(--foreground) 12%, transparent)", backgroundColor: "var(--background)" }}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium" style={{ color: "var(--muted)" }}>Entity Score</p>
          {data.scoreLevel && (
            <span className="rounded-full px-2 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: `color-mix(in srgb, var(${data.scoreLevel === "High" ? "--success" : data.scoreLevel === "Medium" ? "--warning" : "--destructive"}) 15%, transparent)`,
                color: `var(${data.scoreLevel === "High" ? "--success" : data.scoreLevel === "Medium" ? "--warning" : "--destructive"})`,
              }}>
              {data.scoreLevel}
            </span>
          )}
        </div>
        <p className="text-3xl font-bold" style={{ color: "var(--foreground)", fontVariantNumeric: "tabular-nums" }}>
          {displayScore}<span className="text-lg font-normal" style={{ color: "var(--muted)" }}>/100</span>
        </p>
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>{data.rationale}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <EntityAuthorityGrid data={data} />
        <KnowledgePanelCard
          present={data.knowledgePanelPresent}
          accurate={data.knowledgePanelAccurate}
          url={data.knowledgePanelUrl}
        />
        <WikidataStatusCard
          present={data.wikidataEntryPresent}
          url={data.wikidataEntryUrl}
        />
      </div>
    </div>
  );
}
