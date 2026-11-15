"use client";

import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import { useBrandFeatureGate } from "@/components/domain/pricing/brand-feature-gate";
import { PlanLockedCard } from "@/components/domain/pricing/plan-lock";
import { YoutubeGapCard } from "@/components/domain/trust/youtube-gap-card";
import { YoutubePresenceScorecard } from "@/components/domain/trust/youtube-presence-scorecard";
import { LayerBadge } from "@/components/phase2/layer-badge";
import { ActionError, LoadError } from "@/components/shared/load-error";
import { usePostAction } from "@/lib/hooks/use-action";
import { useGatedJson } from "@/lib/hooks/use-load";
import { displayDate } from "@/lib/trust/display-dates";

// 17 Nov, part 3: "this will retry automatically" -- nothing retries it soon; the check runs each month
// (inngest/functions/audit-youtube-presence.ts) or when Refresh is clicked.
const UNAVAILABLE_REASON_TEXT: Record<string, string> = {
  missing_api_key: "The YouTube API key is not configured.",
  quota_exceeded:
    "The YouTube API's daily quota was used up, so the check couldn't run. Click Refresh to try again; it also runs each month.",
  network_error:
    "A network or YouTube API error stopped the check. Click Refresh to try again; it also runs each month.",
};

/** 17 Nov, part 3: when the check behind what's shown ran. */
function CheckedOn({ at }: { at: string | undefined }) {
  if (!at) return null;
  return (
    <p className="text-xs" style={{ color: "var(--text-secondary)" }} data-checked-on>
      Checked {displayDate(at)}. The check runs each month, or when you click Refresh.
    </p>
  );
}

/** "1,200 subscribers · 8 videos"; a count the channel doesn't show says so, never 0 (17 Nov, part 3). */
function candidateCounts(subscribers: number | null, videos: number | null): string {
  const subs =
    subscribers === null
      ? "Subscriber count not shown"
      : `${subscribers.toLocaleString()} subscribers`;
  const vids = videos === null ? "video count not shown" : `${videos.toLocaleString()} videos`;
  return `${subs} · ${vids}`;
}

interface YoutubeData {
  implemented?: false;
  checkStatus?: "confirmed" | "not_found" | "unconfirmed" | "unavailable";
  unavailableReason?: string | null;
  auditedAt?: string;
  brandDomain?: string;
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

function ConfirmChannelForm({
  brandId,
  onConfirmed,
}: {
  brandId: string;
  onConfirmed: () => void;
}) {
  const [value, setValue] = useState("");
  // Follow-ups from af8de42..d1eb5a1, part 1: the answer was never read, so a refused channel (or a failed
  // check) cleared the box and looked confirmed. It says why now, and keeps what was typed.
  const confirmed = useCallback(() => {
    setValue("");
    onConfirmed();
  }, [onConfirmed]);
  const confirm = usePostAction(`/api/brands/${brandId}/youtube-presence/refresh`, {
    onDone: confirmed,
    failure: "The channel couldn't be checked.",
  });
  const submitting = confirm.running;

  const submit = async () => {
    if (!value.trim()) return;
    await confirm.run({
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelUrl: value.trim() }),
    });
  };

  return (
    <div className="mt-3 space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="youtube.com/@yourchannel or /channel/UC..."
          className="flex-1 rounded border px-2 py-1.5 text-sm"
          style={{
            borderColor: "color-mix(in srgb, var(--foreground) 20%, transparent)",
            backgroundColor: "var(--background)",
            color: "var(--foreground)",
          }}
        />
        <button
          type="button"
          onClick={submit}
          disabled={submitting || !value.trim()}
          className="rounded px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
          style={{ backgroundColor: "var(--accent-primary)", color: "var(--accent-primary-fg)" }}
        >
          {submitting ? "Confirming..." : "Confirm"}
        </button>
      </div>
      <ActionError message={confirm.error} />
    </div>
  );
}

export default function YoutubePresencePage() {
  const { brandId } = useParams<{ brandId: string }>();
  const { locked, planRefused } = useBrandFeatureGate("youtube_presence");
  // Follow-ups from af8de42..d1eb5a1, part 1: a failed fetch fell through to "Not measured yet", and a failed
  // Refresh reloaded the old data saying nothing. Each says so now.
  const loaded = useGatedJson<YoutubeData>(`/api/brands/${brandId}/youtube-presence`, planRefused, {
    enabled: !locked,
  });
  const data = loaded.data;
  const loadData = loaded.retry;
  const refresh = usePostAction(`/api/brands/${brandId}/youtube-presence/refresh`, {
    planRefused,
    onDone: loaded.retry,
    failure: "The YouTube check couldn't be run.",
  });
  const refreshing = refresh.running;
  const handleRefresh = () => refresh.run();

  if (locked) {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="trust" />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
          YouTube Presence
        </h1>
        <PlanLockedCard feature="youtube_presence" />
      </div>
    );
  }

  if (loaded.status === "error") {
    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="trust" />
        <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
          YouTube Presence
        </h1>
        <LoadError what="your YouTube presence" detail={loaded.detail} onRetry={loaded.retry} />
      </div>
    );
  }

  if (loaded.status === "loading") {
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
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleRefresh}
        disabled={refreshing}
        className="rounded px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
        style={{ backgroundColor: "var(--accent-primary)", color: "var(--accent-primary-fg)" }}
      >
        {refreshing ? "Checking..." : "Refresh"}
      </button>
      <ActionError message={refresh.error} />
    </div>
  );

  // No row at all means this brand has never been checked yet --
  // distinct from "checked, no channel found" (checkStatus === "not_found"
  // below). Pre-check copy must never assert a conclusion ("no channel
  // found") before a check has actually run.
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
          style={{ color: "var(--text-secondary)" }}
        >
          <p className="text-lg font-medium">Not measured yet</p>
          <p className="text-sm">Click Refresh to search for this brand's YouTube channel.</p>
        </div>
      </div>
    );
  }

  if (data.implemented === false) {
    // 17 Nov, part 2: unreachable -- the route's layout.tsx answers 404 while this check isn't built.
    return null;
  }

  // Couldn't check at all -- must never render as a measured score.
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
        <CheckedOn at={data.auditedAt} />
        <div
          className="rounded-lg border p-4"
          style={{
            borderColor: "color-mix(in srgb, var(--warning) 40%, transparent)",
            backgroundColor: "color-mix(in srgb, var(--warning) 8%, transparent)",
          }}
        >
          <p className="text-sm font-medium" style={{ color: "var(--warning)" }}>
            The last check couldn&apos;t run
          </p>
          <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
            {UNAVAILABLE_REASON_TEXT[data.unavailableReason ?? ""] ??
              "The check couldn't run — this is not a measured result."}
          </p>
        </div>
      </div>
    );
  }

  // Tightened matching (live false-match: a channel named "Bondi
  // Plumbing" actually belonged to a different company, "Get Plumbing").
  // A name-only candidate is never scored and never fed into the Overall
  // Trust Score -- shown here for confirm/correct only.
  //
  // Task #37: "domain_mismatch" (a different business's domain was
  // positively found) is a stronger, more useful finding than
  // "no_domain_signal" (found nothing either way) -- both stay
  // unconfirmed/unscored, but the copy must say which actually happened,
  // not default to the soft "might be yours" wording for both.
  if (data.checkStatus === "unconfirmed") {
    const [reason, conflictingDomain] = data.gaps ?? [];
    const isDomainMismatch = reason === "domain_mismatch" && conflictingDomain;

    return (
      <div className="space-y-4 p-6">
        <LayerBadge layer="trust" />
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold" style={{ color: "var(--foreground)" }}>
            YouTube Presence
          </h1>
          <RefreshButton />
        </div>
        <CheckedOn at={data.auditedAt} />
        <div
          className="rounded-lg border p-4"
          style={{
            borderColor: "color-mix(in srgb, var(--warning) 40%, transparent)",
            backgroundColor: "color-mix(in srgb, var(--warning) 8%, transparent)",
          }}
        >
          <p className="text-sm font-medium" style={{ color: "var(--warning)" }}>
            {isDomainMismatch
              ? "We found a channel with this name, but it looks like a different business"
              : "We found a channel that might be yours — confirm it's correct to score your YouTube presence"}
          </p>
          {data.channelTitle && data.channelUrl && (
            <div className="mt-2">
              <a
                href={data.channelUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium hover:underline"
                style={{ color: "var(--accent-primary)" }}
              >
                {data.channelTitle} ↗
              </a>
              <p className="mt-0.5 text-xs" style={{ color: "var(--text-secondary)" }}>
                {candidateCounts(data.channelSubscriberCount, data.channelTotalVideos)}
                {isDomainMismatch
                  ? ` — the channel links to ${conflictingDomain}${data.brandDomain ? ` (not ${data.brandDomain})` : ""}, so it's probably not yours.`
                  : " — name matched, but nothing on the channel confirms it's this brand's."}
              </p>
            </div>
          )}
          <p className="mt-2 text-xs" style={{ color: "var(--text-secondary)" }}>
            {isDomainMismatch
              ? "Is this actually yours? Paste your channel URL to confirm:"
              : "Not the right channel, or is it? Paste the correct URL to confirm:"}
          </p>
          <ConfirmChannelForm brandId={brandId} onConfirmed={loadData} />
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
      <CheckedOn at={data.auditedAt} />

      {/* Checked, no channel confidently matched. 17 Nov, part 3: not a measured zero presence -- it has no
          presence score and isn't in the Overall Trust Score (lib/trust/trust-scorer.ts); the page says so. */}
      {data.checkStatus === "not_found" ? (
        <>
          <div
            className="flex flex-col items-center gap-2 py-12 text-center"
            style={{ color: "var(--text-secondary)" }}
          >
            <p className="text-lg font-medium">No confirmed YouTube channel found</p>
            <p className="text-sm">
              We searched for a channel matching this brand but found none we could confirm, so
              YouTube has no score and isn&apos;t part of the Overall Trust Score.
            </p>
          </div>
          <div
            className="rounded-lg border p-3"
            style={{
              borderColor: "color-mix(in srgb, var(--foreground) 12%, transparent)",
              backgroundColor: "var(--background)",
            }}
          >
            <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
              Know the channel? Confirm it directly:
            </p>
            <ConfirmChannelForm brandId={brandId} onConfirmed={loadData} />
          </div>
        </>
      ) : (
        <>
          {/* Confirmed -- either domain-corroborated or a user-confirmed
              URL. Transparency: show the matched channel itself (not just
              a bare score) so the agency can see and correct it if the
              domain corroboration was a false positive. */}
          {data.channelTitle && data.channelUrl && (
            <div
              className="rounded-lg border p-3"
              style={{
                borderColor: "color-mix(in srgb, var(--foreground) 12%, transparent)",
                backgroundColor: "var(--background)",
              }}
            >
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                Confirmed channel
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
              <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
                {Number(data.matchConfidence) >= 1
                  ? "Confirmed directly from the channel URL you provided."
                  : "Confirmed by a matching domain found on the channel."}{" "}
                Not the right channel? Correct it below.
              </p>
              <ConfirmChannelForm brandId={brandId} onConfirmed={loadData} />
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
