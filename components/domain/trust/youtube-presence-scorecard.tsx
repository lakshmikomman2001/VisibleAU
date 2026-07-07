"use client";

interface YoutubeData {
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
  rationale: string;
  confidence_label: string | null;
  scoreLevel: "Low" | "Medium" | "High" | null;
  top_action: string | null;
}

export function YoutubePresenceScorecard({ data }: { data: YoutubeData }) {
  const score = data.presenceScore ?? 0;

  return (
    <div
      className="rounded-lg border p-4"
      style={{ borderColor: "color-mix(in srgb, var(--foreground) 12%, transparent)", backgroundColor: "var(--background)" }}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium" style={{ color: "var(--muted)" }}>YouTube Presence Score</p>
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
      <p className="mt-1 text-3xl font-bold" style={{ color: "var(--foreground)", fontVariantNumeric: "tabular-nums" }}>
        {score}<span className="text-lg font-normal" style={{ color: "var(--muted)" }}>/100</span>
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>Subscribers</p>
          <p className="text-sm font-medium" style={{ color: "var(--foreground)", fontVariantNumeric: "tabular-nums" }}>
            {data.channelSubscriberCount ?? 0}
          </p>
        </div>
        <div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>Long-form</p>
          <p className="text-sm font-medium" style={{ color: "var(--foreground)", fontVariantNumeric: "tabular-nums" }}>
            {data.longformVideoCount ?? 0}
          </p>
        </div>
        <div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>With chapters</p>
          <p className="text-sm font-medium" style={{ color: "var(--foreground)", fontVariantNumeric: "tabular-nums" }}>
            {data.videosWithChapters ?? 0}
          </p>
        </div>
        <div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>VideoObject schema</p>
          <p className="text-sm font-medium" style={{ color: "var(--foreground)", fontVariantNumeric: "tabular-nums" }}>
            {data.embeddingPagesWithSchema ?? 0} pages
          </p>
        </div>
      </div>

      <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>{data.rationale}</p>
      {data.top_action && (
        <p className="mt-1 text-sm font-medium" style={{ color: "var(--accent-primary)" }}>{data.top_action}</p>
      )}
    </div>
  );
}
