"use client";

interface ContentAudit {
  id: string;
  pageUrl: string;
  answerCapsuleScore: number | null;
  faqBlockPresent: boolean | null;
  faqSchemaPresent: boolean | null;
  wordCount: number | null;
  optimalPassageCount: number | null;
  freshnessRisk: string | null;
  contentFormatDetected: string | null;
  citationProbabilityScore: string | null;
  hasAuthorAttribution: boolean | null;
  auditedAt: string;
}

interface ContentStructureCardProps {
  audit: ContentAudit;
}

const FRESHNESS_COLORS: Record<string, string> = {
  fresh: "var(--success)",
  aging: "var(--warning)",
  at_risk: "var(--destructive)",
  stale: "var(--destructive)",
};

export function ContentStructureCard({ audit }: ContentStructureCardProps) {
  const citProb = Number(audit.citationProbabilityScore ?? 0);
  const citColor = citProb >= 0.70 ? "var(--success)" : citProb >= 0.40 ? "var(--warning)" : "var(--destructive)";

  return (
    <div className="rounded-lg border p-4" style={{ borderColor: "color-mix(in srgb, var(--foreground) 12%, transparent)", backgroundColor: "var(--background)" }}>
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate" style={{ color: "var(--foreground)" }}>{audit.pageUrl}</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>{audit.contentFormatDetected ?? "unknown"} &middot; {audit.wordCount ?? 0} words</p>
        </div>
        <div className="text-right ml-3">
          <div className="text-lg font-bold" style={{ color: citColor }}>{(citProb * 100).toFixed(0)}%</div>
          <div className="text-xs" style={{ color: "var(--muted)" }}>Citation prob.</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {audit.faqBlockPresent && (
          <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--success) 15%, transparent)", color: "var(--success)" }}>FAQ Block</span>
        )}
        {audit.faqSchemaPresent && (
          <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--success) 15%, transparent)", color: "var(--success)" }}>FAQ Schema</span>
        )}
        {audit.hasAuthorAttribution && (
          <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "color-mix(in srgb, var(--success) 15%, transparent)", color: "var(--success)" }}>Author</span>
        )}
        {audit.freshnessRisk && (
          <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `color-mix(in srgb, ${FRESHNESS_COLORS[audit.freshnessRisk] ?? "var(--muted)"} 15%, transparent)`, color: FRESHNESS_COLORS[audit.freshnessRisk] ?? "var(--muted)" }}>
            {audit.freshnessRisk}
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center gap-4 text-xs" style={{ color: "var(--muted)" }}>
        <span>Capsule: {audit.answerCapsuleScore ?? 0}/4</span>
        <span>Passages: {audit.optimalPassageCount ?? 0}</span>
      </div>
    </div>
  );
}
