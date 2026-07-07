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
  critical: { bg: "color-mix(in srgb, var(--destructive) 15%, transparent)", color: "var(--destructive)", label: "Critical gap" },
  warning: { bg: "color-mix(in srgb, var(--warning) 15%, transparent)", color: "var(--warning)", label: "Warning" },
  opportunity: { bg: "color-mix(in srgb, var(--accent-primary) 15%, transparent)", color: "var(--accent-primary)", label: "Opportunity" },
  covered: { bg: "color-mix(in srgb, var(--success) 15%, transparent)", color: "var(--success)", label: "Covered" },
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
          <p className="text-xs" style={{ color: "var(--muted)" }}>Citations</p>
          <p className="text-lg font-bold" style={{ color: "var(--foreground)", fontVariantNumeric: "tabular-nums" }}>
            {source.citationCount}
          </p>
        </div>
        <div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>Share</p>
          <p className="text-lg font-bold" style={{ color: "var(--foreground)", fontVariantNumeric: "tabular-nums" }}>
            {source.citationShare}%
          </p>
        </div>
        <div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>Engine</p>
          <p className="text-sm" style={{ color: "var(--foreground)" }}>{source.engine}</p>
        </div>
      </div>

      {source.sourceAffinityNote && (
        <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
          {source.sourceAffinityNote}
        </p>
      )}
    </div>
  );
}
