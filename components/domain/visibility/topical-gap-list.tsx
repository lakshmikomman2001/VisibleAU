"use client";

interface TopicalGapRow {
  id: string;
  topicCluster: string;
  topicLabel: string;
  brandHasContent: boolean;
  crossPromptImpact: number | null;
  estimatedCitationImpact: string | null;
  competitorCoverage: Array<{ domain: string; has_content: boolean; depth: number }>;
}

interface TopicalGapListProps {
  gaps: TopicalGapRow[];
  loading?: boolean;
}

export function TopicalGapList({ gaps, loading }: TopicalGapListProps) {
  if (loading) {
    return (
      <div
        className="rounded-xl p-5"
        style={{
          backgroundColor: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          borderLeft: "3px solid color-mix(in srgb, var(--layer-visibility) 40%, transparent)",
        }}
        aria-busy="true"
      >
        <div
          className="h-3 w-36 rounded anim-shimmer mb-4"
          style={{ backgroundColor: "var(--bg-hover)" }}
        />
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-14 w-full rounded anim-shimmer mb-2"
            style={{ backgroundColor: "var(--bg-hover)" }}
          />
        ))}
      </div>
    );
  }

  const sorted = [...gaps].sort((a, b) => {
    const aImpact = a.crossPromptImpact ?? -1;
    const bImpact = b.crossPromptImpact ?? -1;
    return bImpact - aImpact;
  });

  return (
    <div
      className="rounded-xl p-5"
      style={{
        backgroundColor: "var(--bg-elevated)",
        border: "1px solid var(--border-default)",
        borderLeft: "3px solid color-mix(in srgb, var(--layer-visibility) 40%, transparent)",
      }}
    >
      <p
        className="text-xs font-medium mb-3"
        style={{ color: "var(--text-secondary)" }}
      >
        Topical Coverage Gaps
      </p>

      <div className="space-y-2">
        {sorted.map((gap) => {
          const impact = gap.crossPromptImpact ?? 0;
          const isHighLeverage = impact >= 2;
          return (
            <div
              key={gap.id}
              className="rounded-lg px-3 py-2.5"
              style={{ backgroundColor: "var(--bg-subtle)" }}
            >
              <div className="flex items-center justify-between mb-1">
                <span
                  className="text-[13px] font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  {gap.topicLabel}
                </span>
                <div className="flex items-center gap-2">
                  {isHighLeverage && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{
                        backgroundColor: impact >= 4
                          ? "var(--danger-soft)"
                          : "var(--warning-soft)",
                        color: impact >= 4
                          ? "var(--danger)"
                          : "var(--warning)",
                      }}
                    >
                      HIGH LEVERAGE — fix this gap → improves{" "}
                      <span
                        style={{
                          fontFamily: "var(--font-mono)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {impact}
                      </span>
                      {" "}prompts
                    </span>
                  )}
                  {!gap.brandHasContent && (
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{
                        backgroundColor: "var(--danger-soft)",
                        color: "var(--danger)",
                      }}
                    >
                      No content
                    </span>
                  )}
                </div>
              </div>
              {gap.competitorCoverage.length > 0 && (
                <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                  Competitors:{" "}
                  {gap.competitorCoverage
                    .filter((c) => c.has_content)
                    .map((c) => c.domain)
                    .join(", ")}
                </p>
              )}
            </div>
          );
        })}
        {sorted.length === 0 && (
          <p
            className="text-xs text-center py-6"
            style={{ color: "var(--text-tertiary)" }}
          >
            No topical gaps detected
          </p>
        )}
      </div>
    </div>
  );
}
