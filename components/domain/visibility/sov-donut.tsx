"use client";

// Renders ranked horizontal SoV bars (aligned to prototype FIX17 ~L1665), not a donut.

interface SovEntry {
  competitorDomain: string;
  brandShare: number;
  competitorShare: number;
  engine?: string;
}

interface SovDonutProps {
  entries: SovEntry[];
  brandDomain: string;
  loading?: boolean;
}

export function SovDonut({ entries, brandDomain, loading }: SovDonutProps) {
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
          className="h-3 w-32 rounded anim-shimmer mb-4"
          style={{ backgroundColor: "var(--bg-hover)" }}
        />
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-7 w-full rounded anim-shimmer mb-2"
            style={{ backgroundColor: "var(--bg-hover)" }}
          />
        ))}
      </div>
    );
  }

  const engines = Array.from(new Set(entries.map((e) => e.engine).filter(Boolean))) as string[];
  const allEngines = ["All engines", ...engines];

  const competitorMap = new Map<string, number>();
  let brandShareMax = 0;
  const normalizedBrand = (brandDomain || "").toLowerCase().replace(/^www\./, "");

  for (const row of entries) {
    brandShareMax = Math.max(brandShareMax, row.brandShare);
    const normalizedComp = (row.competitorDomain || "").toLowerCase().replace(/^www\./, "");
    if (normalizedComp && normalizedComp !== normalizedBrand) {
      const existing = competitorMap.get(row.competitorDomain) ?? 0;
      competitorMap.set(row.competitorDomain, Math.max(existing, row.competitorShare));
    }
  }

  const competitors = Array.from(competitorMap.entries())
    .map(([domain, share]) => ({ label: domain, share }))
    .sort((a, b) => b.share - a.share)
    .slice(0, 5);

  const allBars = [
    { label: brandDomain || "You", share: brandShareMax, isBrand: true },
    ...competitors.map((c) => ({ ...c, isBrand: false })),
  ].sort((a, b) => b.share - a.share);

  const maxShare = Math.max(...allBars.map((b) => b.share), 1);

  return (
    <div
      className="rounded-xl p-5"
      style={{
        backgroundColor: "var(--bg-elevated)",
        border: "1px solid var(--border-default)",
        borderLeft: "3px solid color-mix(in srgb, var(--layer-visibility) 40%, transparent)",
      }}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <p
            className="text-xs font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            Share of Voice
          </p>
          {allEngines.length > 1 && (
            <div className="flex gap-1 mt-2">
              {allEngines.map((e, i) => (
                <span
                  key={e}
                  className="h-5 px-2 text-[10px] font-medium rounded-full inline-flex items-center"
                  style={{
                    backgroundColor: i === 0
                      ? "color-mix(in srgb, var(--layer-visibility) 15%, transparent)"
                      : "var(--bg-hover)",
                    color: i === 0
                      ? "var(--layer-visibility)"
                      : "var(--text-tertiary)",
                  }}
                >
                  {e}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="text-right">
          <span
            className="text-2xl font-semibold"
            style={{
              fontFamily: "var(--font-mono)",
              fontVariantNumeric: "tabular-nums",
              color: "var(--layer-visibility)",
            }}
          >
            {brandShareMax.toFixed(0)}%
          </span>
          <p
            className="text-[10px] mt-0.5"
            style={{ color: "var(--text-tertiary)" }}
          >
            your share
          </p>
        </div>
      </div>

      <div className="space-y-2.5">
        {allBars.map((bar, i) => (
          <div key={`${bar.label}-${i}`}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="w-2 h-2 rounded-sm flex-shrink-0"
                  style={{
                    backgroundColor: bar.isBrand
                      ? "var(--layer-visibility)"
                      : "var(--bg-active)",
                  }}
                />
                <span
                  className="text-[13px] font-medium truncate"
                  style={{
                    color: bar.isBrand
                      ? "var(--text-primary)"
                      : "var(--text-secondary)",
                  }}
                  title={bar.label}
                >
                  {bar.label}
                </span>
                {bar.isBrand && (
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded font-medium flex-shrink-0"
                    style={{
                      backgroundColor: "color-mix(in srgb, var(--layer-visibility) 15%, transparent)",
                      color: "var(--layer-visibility)",
                    }}
                  >
                    you
                  </span>
                )}
              </div>
              <span
                className="text-[13px] font-semibold flex-shrink-0 ml-2"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontVariantNumeric: "tabular-nums",
                  color: bar.isBrand
                    ? "var(--layer-visibility)"
                    : "var(--text-secondary)",
                }}
              >
                {bar.share.toFixed(1)}%
              </span>
            </div>
            <div
              className="h-[6px] rounded-full overflow-hidden"
              style={{ backgroundColor: "var(--bg-hover)" }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(bar.share / maxShare) * 100}%`,
                  backgroundColor: bar.isBrand
                    ? "var(--layer-visibility)"
                    : "var(--bg-active)",
                  minWidth: bar.isBrand || bar.share > 0 ? "4px" : "0",
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {allBars.length === 1 && allBars[0].isBrand && (
        <p
          className="text-xs mt-3 text-center"
          style={{ color: "var(--text-tertiary)" }}
        >
          No competitor data in this audit
        </p>
      )}
    </div>
  );
}
