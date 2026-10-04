"use client";

import { useEffect, useState } from "react";
import { ALL_ENGINES, aggregateShareOfVoice, type SovEntry } from "./sov-donut";

interface SovData {
  brandDomain: string;
  brandSharePct: number;
  competitors: Array<{ domain: string; sharePct: number }>;
}

interface DashboardSovStripProps {
  brandId: string;
}

export function DashboardSovStrip({ brandId }: DashboardSovStripProps) {
  const [data, setData] = useState<SovData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/brands/${brandId}/visibility`);
        if (!res.ok) return;
        const json = await res.json();

        if (!json.sov || json.sov.length === 0) {
          setData(null);
          return;
        }

        const brandDomain: string = json.brandDomain ?? "";
        // Task BBB: reuse the same aggregator the Visibility Hub uses
        // (sums real mention counts, defends against mixing audits) instead
        // of a separate Math.max-per-competitor reimplementation, which
        // produced each competitor's single best segment rather than a
        // normalized share -- percentages that didn't sum to 100%.
        const { brandSharePct, competitors } = aggregateShareOfVoice(
          json.sov as SovEntry[],
          brandDomain,
          ALL_ENGINES,
        );

        setData({
          brandDomain: brandDomain || "You",
          brandSharePct,
          competitors: competitors.slice(0, 4),
        });
      } catch {
        /* silent */
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [brandId]);

  if (loading) {
    return (
      <div
        className="rounded-xl p-4"
        style={{
          backgroundColor: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          borderLeft: "3px solid color-mix(in srgb, var(--layer-visibility) 40%, transparent)",
        }}
        aria-busy="true"
      >
        <div
          className="h-3 w-28 rounded anim-shimmer mb-3"
          style={{ backgroundColor: "var(--bg-hover)" }}
        />
        <div
          className="h-6 w-full rounded anim-shimmer"
          style={{ backgroundColor: "var(--bg-hover)" }}
        />
      </div>
    );
  }

  if (!data) {
    return (
      <div
        className="rounded-xl p-4"
        style={{
          backgroundColor: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          borderLeft: "3px solid color-mix(in srgb, var(--layer-visibility) 40%, transparent)",
        }}
      >
        <p className="text-xs mb-2" style={{ color: "var(--text-tertiary)" }}>
          Share of Voice
        </p>
        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          Run an audit to see share of voice
        </p>
      </div>
    );
  }

  const allBars = [
    { label: data.brandDomain, share: data.brandSharePct, isBrand: true },
    ...data.competitors.map((c) => ({
      label: c.domain,
      share: c.sharePct,
      isBrand: false,
    })),
  ].sort((a, b) => b.share - a.share);

  const maxShare = Math.max(...allBars.map((b) => b.share), 1);

  return (
    <div
      className="rounded-xl p-4"
      style={{
        backgroundColor: "var(--bg-elevated)",
        border: "1px solid var(--border-default)",
        borderLeft: "3px solid color-mix(in srgb, var(--layer-visibility) 40%, transparent)",
      }}
    >
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-medium" style={{ color: "var(--text-tertiary)" }}>
          Share of Voice
        </p>
        <span
          className="text-sm font-semibold"
          style={{
            fontFamily: "var(--font-mono)",
            fontVariantNumeric: "tabular-nums",
            color: "var(--layer-visibility)",
          }}
        >
          {data.brandSharePct.toFixed(0)}%
        </span>
      </div>
      <div className="space-y-2">
        {allBars.map((bar, i) => (
          <div key={`${bar.label}-${i}`}>
            <div className="flex items-center justify-between mb-0.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="w-1.5 h-1.5 rounded-sm flex-shrink-0"
                  style={{
                    backgroundColor: bar.isBrand ? "var(--layer-visibility)" : "var(--bg-active)",
                  }}
                />
                <span
                  className="text-xs truncate"
                  style={{
                    color: bar.isBrand ? "var(--text-primary)" : "var(--text-secondary)",
                  }}
                  title={bar.label}
                >
                  {bar.label}
                </span>
                {bar.isBrand && (
                  <span
                    className="text-[8px] px-1 py-px rounded font-medium flex-shrink-0"
                    style={{
                      backgroundColor:
                        "color-mix(in srgb, var(--layer-visibility) 15%, transparent)",
                      color: "var(--layer-visibility)",
                    }}
                  >
                    you
                  </span>
                )}
              </div>
              <span
                className="text-xs font-medium flex-shrink-0 ml-2"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontVariantNumeric: "tabular-nums",
                  color: "var(--text-primary)",
                }}
              >
                {bar.share.toFixed(1)}%
              </span>
            </div>
            <div
              className="h-[5px] rounded-full overflow-hidden"
              style={{ backgroundColor: "var(--bg-hover)" }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${(bar.share / maxShare) * 100}%`,
                  backgroundColor: bar.isBrand ? "var(--layer-visibility)" : "var(--bg-active)",
                  minWidth: bar.isBrand || bar.share > 0 ? "3px" : "0",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
