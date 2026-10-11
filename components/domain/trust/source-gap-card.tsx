"use client";

interface SourceRow {
  id: string;
  engine: string;
  sourceType: string;
  citationCount: number;
  citationShare: string;
  brandPresentInSource: boolean;
  gapSeverity: string;
  sourceAffinityNote: string | null;
}

const GAP_CONFIG: Record<string, { bg: string; color: string; label: string }> = {
  critical: {
    bg: "color-mix(in srgb, var(--destructive) 15%, transparent)",
    color: "var(--destructive)",
    label: "Critical gap",
  },
  warning: {
    bg: "color-mix(in srgb, var(--warning) 15%, transparent)",
    color: "var(--warning)",
    label: "Warning",
  },
  opportunity: {
    bg: "color-mix(in srgb, var(--accent-primary) 15%, transparent)",
    color: "var(--accent-primary)",
    label: "Opportunity",
  },
  covered: {
    bg: "color-mix(in srgb, var(--success) 15%, transparent)",
    color: "var(--success)",
    label: "Covered",
  },
  // Task #43: "other" is an unclassified bucket, not an actionable gap
  // in a specific channel -- a neutral badge, not Critical/Covered.
  // Without this entry, an unrecognised gapSeverity value falls back to
  // GAP_CONFIG.covered below, which would have rendered "other" as a
  // false-reassuring green "Covered" badge.
  unclassified: {
    bg: "color-mix(in srgb, var(--muted) 20%, transparent)",
    color: "var(--muted)",
    label: "Unclassified",
  },
};

export function SourceGapCard({ source }: { source: SourceRow }) {
  const gap = GAP_CONFIG[source.gapSeverity] ?? GAP_CONFIG.covered;

  return (
    <div
      className="rounded-lg border p-4"
      style={{
        borderColor: "color-mix(in srgb, var(--foreground) 12%, transparent)",
        backgroundColor: "var(--background)",
      }}
    >
      <div className="flex items-center justify-between">
        <p className="font-medium" style={{ color: "var(--foreground)" }}>
          {source.sourceType.replace(/_/g, " ")}
        </p>
        <span
          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{ backgroundColor: gap.bg, color: gap.color }}
        >
          {gap.label}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-4">
        <div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Citations
          </p>
          <p
            className="text-lg font-bold"
            style={{ color: "var(--foreground)", fontVariantNumeric: "tabular-nums" }}
          >
            {source.citationCount}
          </p>
        </div>
        <div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Share
          </p>
          <p
            className="text-lg font-bold"
            style={{ color: "var(--foreground)", fontVariantNumeric: "tabular-nums" }}
          >
            {source.citationShare}%
          </p>
        </div>
        <div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Engine
          </p>
          <p className="text-sm" style={{ color: "var(--foreground)" }}>
            {source.engine}
          </p>
        </div>
      </div>

      {source.sourceAffinityNote ? (
        <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
          {source.sourceAffinityNote}
        </p>
      ) : source.gapSeverity === "unclassified" ? (
        // Task #43: plain, data-driven -- names the actual share, not a
        // generic line, and doesn't badge it as a channel-specific gap.
        <p className="mt-3 text-sm italic" style={{ color: "var(--muted)" }}>
          {source.citationShare}% of this engine&apos;s cited sources couldn&apos;t be categorised
          yet.
        </p>
      ) : (
        // Task #41: a real category somehow missing its seed note -- a
        // neutral fallback instead of silently rendering nothing.
        <p className="mt-3 text-sm italic" style={{ color: "var(--muted)" }}>
          No category-specific guidance available for this source type yet.
        </p>
      )}
    </div>
  );
}
