"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { NotYetMeasuredCard } from "@/components/domain/trust/not-yet-measured-card";
import { YoutubeGapCard } from "@/components/domain/trust/youtube-gap-card";
import { YoutubePresenceScorecard } from "@/components/domain/trust/youtube-presence-scorecard";
import { LayerBadge } from "@/components/phase2/layer-badge";

interface YoutubeData {
  implemented?: false;
  presenceScore: number | null;
  channelExists: boolean | null;
  channelSubscriberCount: number | null;
  channelTotalVideos: number | null;
  longformVideoCount: number | null;
  shortsCount: number | null;
  longformRatio: string | null;
  videosWithChapters: number | null;
  videosWithTranscript: number | null;
  embeddingPagesWithSchema: number | null;
  gaps: string[];
  rationale: string;
  confidence_label: string | null;
  scoreLevel: "Low" | "Medium" | "High" | null;
  top_action: string | null;
}

export default function YoutubePresencePage() {
  const { brandId } = useParams<{ brandId: string }>();
  const [data, setData] = useState<YoutubeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = () => {
    fetch(`/api/brands/${brandId}/youtube-presence`)
      .then(async (res) => {
        if (res.ok) setData(await res.json());
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
  }, [brandId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetch(`/api/brands/${brandId}/youtube-presence/refresh`, { method: "POST" });
    loadData();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="trust" />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
          YouTube Presence
        </h1>
        <div
          className="h-48 animate-pulse rounded-lg"
          style={{ backgroundColor: "color-mix(in srgb, var(--foreground) 8%, transparent)" }}
        />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="trust" />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
          YouTube Presence
        </h1>
        <div
          className="flex flex-col items-center gap-2 py-12 text-center"
          style={{ color: "var(--muted)" }}
        >
          <p className="text-lg font-medium">No YouTube channel found</p>
          <p className="text-sm">Add your channel URL to your brand profile.</p>
        </div>
      </div>
    );
  }

  if (data.implemented === false) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="trust" />
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
            YouTube Presence
          </h1>
          <button
            disabled
            className="rounded px-3 py-1.5 text-sm font-medium opacity-50"
            style={{ backgroundColor: "var(--accent-primary)", color: "var(--accent-primary-fg)" }}
          >
            Not yet available
          </button>
        </div>
        <NotYetMeasuredCard metric="YouTube presence" />
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <LayerBadge layer="trust" />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
          YouTube Presence
        </h1>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="rounded px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
          style={{ backgroundColor: "var(--accent-primary)", color: "var(--accent-primary-fg)" }}
        >
          {refreshing ? "Auditing..." : "Refresh"}
        </button>
      </div>

      <YoutubePresenceScorecard data={data} />

      {data.gaps.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-lg font-medium" style={{ color: "var(--foreground)" }}>
            Gaps & Recommendations
          </h2>
          {data.gaps.map((gap, i) => (
            <YoutubeGapCard key={i} gap={gap} />
          ))}
        </div>
      )}
    </div>
  );
}
