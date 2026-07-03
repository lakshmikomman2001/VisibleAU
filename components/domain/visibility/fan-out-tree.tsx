"use client";

interface FanOutResult {
  subQuery: string;
  subQueryRank: number;
  brandAppeared: boolean;
  brandPosition: number | null;
  contentSimilarityScore: string | null;
  aboveThreshold: boolean;
}

interface FanOutTreeProps {
  originalPrompt: string;
  results: FanOutResult[];
  loading?: boolean;
}

function qualityColor(score: number): string {
  if (score >= 0.7) return "var(--success)";
  if (score >= 0.4) return "var(--warning)";
  return "var(--danger)";
}

export function FanOutTree({ originalPrompt, results, loading }: FanOutTreeProps) {
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
          className="h-3 w-40 rounded anim-shimmer mb-4"
          style={{ backgroundColor: "var(--bg-hover)" }}
        />
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-9 w-full rounded anim-shimmer mb-2"
            style={{ backgroundColor: "var(--bg-hover)" }}
          />
        ))}
      </div>
    );
  }

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
        className="text-xs font-medium mb-1"
        style={{ color: "var(--text-secondary)" }}
      >
        Query Fan-Out
      </p>
      <p
        className="text-[13px] font-medium mb-3 truncate"
        style={{ color: "var(--text-primary)" }}
        title={originalPrompt}
      >
        {originalPrompt}
      </p>

      <div className="space-y-1.5">
        {results
          .sort((a, b) => a.subQueryRank - b.subQueryRank)
          .map((r, i) => {
            const score = r.contentSimilarityScore
              ? Number(r.contentSimilarityScore)
              : null;
            return (
              <div
                key={`${r.subQueryRank}-${i}`}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
                style={{
                  backgroundColor: "var(--bg-subtle)",
                  borderLeft: `3px solid ${
                    r.aboveThreshold
                      ? "var(--layer-visibility)"
                      : "color-mix(in srgb, var(--bg-active) 60%, transparent)"
                  }`,
                }}
              >
                <span
                  className="w-5 text-center flex-shrink-0"
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontVariantNumeric: "tabular-nums",
                    color: "var(--text-tertiary)",
                  }}
                >
                  {r.subQueryRank}
                </span>
                <span
                  className="flex-1 truncate"
                  style={{ color: "var(--text-primary)" }}
                  title={r.subQuery}
                >
                  {r.subQuery}
                </span>
                {score !== null && (
                  <span className="flex items-center gap-1 flex-shrink-0">
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: qualityColor(score) }}
                    />
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontVariantNumeric: "tabular-nums",
                        color: r.aboveThreshold
                          ? "var(--text-primary)"
                          : "var(--text-tertiary)",
                      }}
                    >
                      {score.toFixed(3)}
                    </span>
                  </span>
                )}
                {r.brandAppeared && (
                  <span
                    className="inline-flex items-center rounded-full px-1.5 py-0.5 font-medium flex-shrink-0"
                    style={{
                      backgroundColor: "var(--success-soft)",
                      color: "var(--success)",
                      fontSize: "10px",
                    }}
                  >
                    Cited
                  </span>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}
