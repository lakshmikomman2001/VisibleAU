"use client";

import { useState } from "react";
import { InfoTip } from "@/components/domain/shared/info-tip";
import {
  formatSharePercent,
  SOV_NOTE,
  type SovPayload,
  type SovShare,
} from "@/lib/visibility/share-of-voice-display";

// Renders ranked horizontal SoV bars (aligned to prototype FIX17 ~L1665), not a donut.
//
// One Share of Voice (7 Nov): the counts and every share arrive computed by the one counter
// (lib/visibility/share-of-voice.ts, via GET /api/brands/[brandId]/visibility) -- the same figures as
// the Overview, the audit page and the PDF. This card only picks an engine and lays the rows out.

export const ALL_ENGINES = "All engines";

interface SovDonutProps {
  sov: SovPayload | null;
  loading?: boolean;
}

interface Row extends SovShare {
  isBrand: boolean;
}

const CARD_STYLE = {
  backgroundColor: "var(--bg-elevated)",
  border: "1px solid var(--border-default)",
  borderLeft: "3px solid color-mix(in srgb, var(--layer-visibility) 40%, transparent)",
} as const;

function percent(share: number | null): string {
  return share === null ? "—" : formatSharePercent(share);
}

export function SovDonut({ sov, loading }: SovDonutProps) {
  const [selectedEngine, setSelectedEngine] = useState<string>(ALL_ENGINES);

  if (loading) {
    return (
      <div className="rounded-xl p-5" style={CARD_STYLE} aria-busy="true">
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

  const header = (
    <div className="flex flex-wrap items-center gap-x-1.5">
      <p className="text-xs font-medium m-0" style={{ color: "var(--text-secondary)" }}>
        Share of Voice
      </p>
      <InfoTip label="How Share of Voice is counted" note={SOV_NOTE} />
    </div>
  );

  if (!sov?.measured) {
    return (
      <div className="rounded-xl p-5" style={CARD_STYLE}>
        {header}
        <p className="text-xs mt-3 mb-0" style={{ color: "var(--text-tertiary)" }}>
          {sov
            ? [sov.line.detail, sov.line.audit].filter(Boolean).join(" · ")
            : "Run an audit to see share of voice"}
        </p>
        {sov?.line.note && (
          <p className="text-[11px] mt-1 mb-0" style={{ color: "var(--warning)" }}>
            {sov.line.note}
          </p>
        )}
      </div>
    );
  }

  const engineView =
    selectedEngine === ALL_ENGINES
      ? null
      : (sov.perEngine.find((e) => e.engine === selectedEngine) ?? null);
  const view = engineView
    ? {
        brandMentions: engineView.brandMentions,
        brandSharePct: engineView.brandSharePct,
        totalMentions: engineView.totalMentions,
        competitors: engineView.competitors,
      }
    : {
        brandMentions: sov.brandMentions,
        brandSharePct: sov.sharePct,
        totalMentions: sov.totalMentions,
        competitors: sov.competitors,
      };

  const rows: Row[] = [
    {
      name: sov.brandName,
      mentions: view.brandMentions,
      sharePct: view.brandSharePct,
      isBrand: true,
    },
    ...view.competitors.map((c) => ({ ...c, isBrand: false })),
  ].sort((a, b) => b.mentions - a.mentions || Number(b.isBrand) - Number(a.isBrand));
  const engines = [ALL_ENGINES, ...sov.perEngine.map((e) => e.engine)];

  return (
    <div className="rounded-xl p-5" style={CARD_STYLE}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          {header}
          {engines.length > 2 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {engines.map((e) => {
                const isSelected = e === selectedEngine;
                return (
                  <button
                    key={e}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setSelectedEngine(e)}
                    className="h-5 px-2 text-[10px] font-medium rounded-full inline-flex items-center border-0 cursor-pointer"
                    style={{
                      backgroundColor: isSelected
                        ? "color-mix(in srgb, var(--layer-visibility) 15%, transparent)"
                        : "var(--bg-hover)",
                      color: isSelected ? "var(--layer-visibility)" : "var(--text-tertiary)",
                    }}
                  >
                    {e}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="text-right shrink-0">
          <span
            className="text-2xl font-semibold"
            style={{
              fontFamily: "var(--font-mono)",
              fontVariantNumeric: "tabular-nums",
              color: "var(--layer-visibility)",
            }}
          >
            {percent(view.brandSharePct)}
          </span>
          <p className="text-[10px] mt-0.5 mb-0" style={{ color: "var(--text-tertiary)" }}>
            {view.brandMentions} of {view.totalMentions} verified mentions
          </p>
        </div>
      </div>

      <div className="space-y-2.5">
        {rows.map((row) => (
          <div key={`${row.isBrand ? "you" : "c"}:${row.name}`} data-sov-row={row.name}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="w-2 h-2 rounded-sm flex-shrink-0"
                  style={{
                    backgroundColor: row.isBrand ? "var(--layer-visibility)" : "var(--bg-active)",
                  }}
                />
                <span
                  className="text-[13px] font-medium truncate"
                  style={{ color: row.isBrand ? "var(--text-primary)" : "var(--text-secondary)" }}
                  title={row.name}
                >
                  {row.name}
                </span>
                {row.isBrand && (
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded font-medium flex-shrink-0"
                    style={{
                      backgroundColor:
                        "color-mix(in srgb, var(--layer-visibility) 6%, transparent)",
                      color: "var(--layer-visibility)",
                    }}
                  >
                    you
                  </span>
                )}
              </div>
              <span
                className="text-[12px] flex-shrink-0 ml-2"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontVariantNumeric: "tabular-nums",
                  color: row.isBrand ? "var(--layer-visibility)" : "var(--text-secondary)",
                }}
              >
                {percent(row.sharePct)} · {row.mentions}
              </span>
            </div>
            <div
              className="h-[6px] rounded-full overflow-hidden"
              style={{ backgroundColor: "var(--bg-hover)" }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: percent(row.sharePct === null ? 0 : row.sharePct),
                  backgroundColor: row.isBrand ? "var(--layer-visibility)" : "var(--bg-active)",
                  minWidth: row.isBrand || row.mentions > 0 ? "4px" : "0",
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <p className="text-[11px] mt-3 mb-0" style={{ color: "var(--text-tertiary)" }}>
        {sov.line.audit}
        {sov.smallSample && (
          <span
            className="ml-1.5 text-[10px] px-1.5 py-px rounded font-medium"
            style={{ backgroundColor: "var(--warning-soft)", color: "var(--warning)" }}
          >
            small sample
          </span>
        )}
      </p>
      {sov.line.note && (
        <p className="text-[11px] mt-1 mb-0" style={{ color: "var(--warning)" }}>
          {sov.line.note}
        </p>
      )}
    </div>
  );
}
