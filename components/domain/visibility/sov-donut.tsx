"use client";

import { useState } from "react";

// Renders ranked horizontal SoV bars (aligned to prototype FIX17 ~L1665), not a donut.

export interface SovEntry {
  competitorDomain: string;
  brandShare: number;
  competitorShare: number;
  engine?: string;
  promptCategory?: string;
  auditId?: string | null;
  calculatedAt?: string;
  brandMentionCount?: number | null;
  competitorMentionCount?: number | null;
  totalMentionCount?: number | null;
}

interface SovDonutProps {
  entries: SovEntry[];
  brandDomain: string;
  loading?: boolean;
}

export interface SovShare {
  domain: string;
  sharePct: number;
}

export interface AggregatedSov {
  brandSharePct: number;
  competitors: SovShare[];
}

export const ALL_ENGINES = "All engines";

/** A group (engine + promptCategory) without real mention counts contributes
 * its stored percentage as if out of this assumed total -- an honest,
 * equally-weighted fallback for legacy rows written before mention counts
 * were persisted (task X). It reduces to the exact stored percentage in the
 * common single-group case, and to an unweighted average across groups when
 * none of them have real counts. */
const ASSUMED_GROUP_TOTAL = 100;

/**
 * Combines Share of Voice snapshot rows into ONE coherent distribution by
 * summing raw counts (never Math.max, never mixing audits). Each row belongs
 * to a group (engine + promptCategory) with its own denominator; percentages
 * from different groups can't be correctly summed or averaged directly, only
 * their underlying counts can.
 */
export function aggregateShareOfVoice(
  entries: SovEntry[],
  brandDomain: string,
  selectedEngine: string = ALL_ENGINES,
): AggregatedSov {
  const normalizedBrand = (brandDomain || "").toLowerCase().replace(/^www\./, "");

  // Defense in depth: even though the API is expected to already scope to
  // one audit, never let more than one audit's rows get combined here --
  // keep only the most recently calculated audit among what we were given.
  const withAuditId = entries.filter((e) => e.auditId);
  let scoped = entries;
  if (withAuditId.length > 0) {
    let latestAuditId = withAuditId[0].auditId;
    let latestCalculatedAt = withAuditId[0].calculatedAt ?? "";
    for (const e of withAuditId) {
      const calculatedAt = e.calculatedAt ?? "";
      if (calculatedAt > latestCalculatedAt) {
        latestCalculatedAt = calculatedAt;
        latestAuditId = e.auditId;
      }
    }
    scoped = entries.filter((e) => e.auditId === latestAuditId);
  }

  if (selectedEngine !== ALL_ENGINES) {
    scoped = scoped.filter((e) => e.engine === selectedEngine);
  }

  const groupKey = (e: SovEntry) => `${e.engine}:${e.promptCategory ?? "general"}`;
  const seenGroups = new Set<string>();
  let brandSum = 0;
  let totalSum = 0;
  const competitorSums = new Map<string, number>();

  for (const row of scoped) {
    const key = groupKey(row);
    if (!seenGroups.has(key)) {
      seenGroups.add(key);
      const hasGroupCounts = row.brandMentionCount != null && row.totalMentionCount != null;
      brandSum += hasGroupCounts ? (row.brandMentionCount as number) : row.brandShare;
      totalSum += hasGroupCounts ? (row.totalMentionCount as number) : ASSUMED_GROUP_TOTAL;
    }

    const normalizedComp = (row.competitorDomain || "").toLowerCase().replace(/^www\./, "");
    if (normalizedComp && normalizedComp !== normalizedBrand) {
      const contribution = row.competitorMentionCount ?? row.competitorShare;
      competitorSums.set(
        row.competitorDomain,
        (competitorSums.get(row.competitorDomain) ?? 0) + contribution,
      );
    }
  }

  const brandSharePct = totalSum > 0 ? (brandSum / totalSum) * 100 : 0;
  const competitors = Array.from(competitorSums.entries())
    .map(([domain, sum]) => ({
      domain,
      sharePct: totalSum > 0 ? (sum / totalSum) * 100 : 0,
    }))
    .sort((a, b) => b.sharePct - a.sharePct);

  return { brandSharePct, competitors };
}

export function SovDonut({ entries, brandDomain, loading }: SovDonutProps) {
  const [selectedEngine, setSelectedEngine] = useState<string>(ALL_ENGINES);

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
  const allEngines = [ALL_ENGINES, ...engines];

  const { brandSharePct, competitors: aggregatedCompetitors } = aggregateShareOfVoice(
    entries,
    brandDomain,
    selectedEngine,
  );

  const competitors = aggregatedCompetitors
    .slice(0, 5)
    .map((c) => ({ label: c.domain, share: c.sharePct }));

  const allBars = [
    { label: brandDomain || "You", share: brandSharePct, isBrand: true },
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
          <p className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
            Share of Voice
          </p>
          {allEngines.length > 1 && (
            <div className="flex gap-1 mt-2">
              {allEngines.map((e) => {
                const isSelected = e === selectedEngine;
                return (
                  <button
                    key={e}
                    type="button"
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
        <div className="text-right">
          <span
            className="text-2xl font-semibold"
            style={{
              fontFamily: "var(--font-mono)",
              fontVariantNumeric: "tabular-nums",
              color: "var(--layer-visibility)",
            }}
          >
            {brandSharePct.toFixed(0)}%
          </span>
          <p className="text-[10px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
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
                    backgroundColor: bar.isBrand ? "var(--layer-visibility)" : "var(--bg-active)",
                  }}
                />
                <span
                  className="text-[13px] font-medium truncate"
                  style={{
                    color: bar.isBrand ? "var(--text-primary)" : "var(--text-secondary)",
                  }}
                  title={bar.label}
                >
                  {bar.label}
                </span>
                {bar.isBrand && (
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded font-medium flex-shrink-0"
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
                className="text-[13px] font-semibold flex-shrink-0 ml-2"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontVariantNumeric: "tabular-nums",
                  color: bar.isBrand ? "var(--layer-visibility)" : "var(--text-secondary)",
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
                  backgroundColor: bar.isBrand ? "var(--layer-visibility)" : "var(--bg-active)",
                  minWidth: bar.isBrand || bar.share > 0 ? "4px" : "0",
                }}
              />
            </div>
          </div>
        ))}
      </div>

      {allBars.length === 1 && allBars[0].isBrand && (
        <p className="text-xs mt-3 text-center" style={{ color: "var(--text-tertiary)" }}>
          No competitor data in this audit
        </p>
      )}
    </div>
  );
}
