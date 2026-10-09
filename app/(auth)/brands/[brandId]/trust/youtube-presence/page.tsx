"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { NotYetMeasuredCard } from "@/components/domain/trust/not-yet-measured-card";
import { YoutubeGapCard } from "@/components/domain/trust/youtube-gap-card";
import { YoutubePresenceScorecard } from "@/components/domain/trust/youtube-presence-scorecard";
import { LayerBadge } from "@/components/phase2/layer-badge";

const UNAVAILABLE_REASON_TEXT: Record<string, string> = {
  missing_api_key: "The YouTube API key is not configured.",
  quota_exceeded: "The YouTube API daily quota was exceeded — this will retry automatically.",
  network_error: "A network or API error prevented the check — this will retry automatically.",
};

interface YoutubeData {
  implemented?: false;
  checkStatus?: "confirmed" | "not_found" | "unavailable";
  unavailableReason?: string | null;
  auditedAt?: string;
  channelId: string | null;
  channelTitle: string | null;
  channelUrl: string | null;
  matchConfidence: string | null;
  presenceScore: number | null;
  channelExists: boolean | null;
  channelSubscriberCount: number | null;
  channelTotalVideos: number | null;
  lastUploadAt: string | null;
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

  const RefreshButton = () => (
    <button
      onClick={handleRefresh}
      disabled={refreshing}
      className="rounded px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
      style={{ backgroundColor: "var(--accent-primary)", color: "var(--accent-primary-fg)" }}
    >
      {refreshing ? "Checking..." : "Refresh"}
    </button>
  );

  // Trust Intelligence honesty pass (real YouTube check): no row at all
  // means this brand has never been checked yet -- distinct from
  // "checked, no channel found" (checkStatus === "not_found" below). The
  // real check searches by brand name automatically; no channel URL
  // needs to be entered manually.
  if (!data) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="trust" />
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
            YouTube Presence
          </h1>
          <RefreshButton />
        </div>
        <div
          className="flex flex-col items-center gap-2 py-12 text-center"
          style={{ color: "var(--muted)" }}
        >
          <p className="text-lg font-medium">Not checked yet</p>
          <p className="text-sm">Click Refresh to search for this brand's YouTube channel.</p>
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

  // Honest state 3 of 3: couldn't check at all -- must never render as a
  // measured score. Visually and semantically distinct from both "no
  // channel found" (measured) and the real scorecard (confirmed).
  if (data.checkStatus === "unavailable") {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="trust" />
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
            YouTube Presence
          </h1>
          <RefreshButton />
        </div>
        <div
          className="rounded-lg border p-4"
          style={{
            borderColor: "color-mix(in srgb, var(--warning) 40%, transparent)",
            backgroundColor: "color-mix(in srgb, var(--warning) 8%, transparent)",
          }}
        >
          <p className="text-sm font-medium" style={{ color: "var(--warning)" }}>
            Measurement temporarily unavailable
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
            {UNAVAILABLE_REASON_TEXT[data.unavailableReason ?? ""] ??
              "The check couldn't run — this is not a measured result."}
          </p>
        </div>
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
        <RefreshButton />
      </div>

      {/* Honest state 2 of 3: checked, no channel confidently matched --
          a real measured low/zero presence, not a stub. */}
      {data.checkStatus === "not_found" ? (
        <div
          className="flex flex-col items-center gap-2 py-12 text-center"
          style={{ color: "var(--muted)" }}
        >
          <p className="text-lg font-medium">No confirmed YouTube channel found</p>
          <p className="text-sm">
            We searched for a channel matching this brand but found none we're confident is
            theirs.
          </p>
        </div>
      ) : (
        <>
          {/* Honest state 1 of 3: a channel was confirmed above the match
              threshold. Transparency: show the matched channel itself (not
              just a bare score) so the agency can see and correct the
              match if needed. */}
          {data.channelTitle && data.channelUrl && (
            <div
              className="rounded-lg border p-3"
              style={{
                borderColor: "color-mix(in srgb, var(--foreground) 12%, transparent)",
                backgroundColor: "var(--background)",
              }}
            >
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                Matched channel
              </p>
              <a
                href={data.channelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium hover:underline"
                style={{ color: "var(--accent-primary)" }}
              >
                {data.channelTitle} ↗
              </a>
              {data.matchConfidence && (
                <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                  Matched by name/domain similarity — {Math.round(Number(data.matchConfidence) * 100)}% confidence.
                  Not the right channel? Correct it before trusting the score.
                </p>
              )}
            </div>
          )}

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
        </>
      )}
    </div>
  );
}
