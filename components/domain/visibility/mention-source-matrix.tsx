"use client";

import type { BrandArchetype } from "@/lib/visibility/types";

interface MentionSourceMatrixProps {
  mentionRate: number;
  citationRate: number;
  mentionSourceRatio: number | null;
  brandArchetype: BrandArchetype;
  loading?: boolean;
}

const ARCHETYPE_CONFIG: Record<
  BrandArchetype,
  { label: string; description: string; quadLabel: string; color: string }
> = {
  recognised_authority: {
    label: "Recognised Authority",
    description: "High mentions + high citations",
    quadLabel: "Authority",
    color: "var(--success)",
  },
  known_but_untrusted: {
    label: "Known but Untrusted",
    description: "High mentions but low citations",
    quadLabel: "Brand-Led",
    color: "var(--warning)",
  },
  niche_authority: {
    label: "Niche Authority",
    description: "Low mentions but high citations",
    quadLabel: "Source-Dep",
    color: "var(--info)",
  },
  invisible: {
    label: "Invisible",
    description: "Low mentions + low citations",
    quadLabel: "Invisible",
    color: "var(--danger)",
  },
};

const QUADRANTS: Array<{ key: BrandArchetype; quadLabel: string; desc: string }> = [
  { key: "recognised_authority", quadLabel: "Authority", desc: "Cited + Mentioned" },
  { key: "known_but_untrusted", quadLabel: "Brand-Led", desc: "Mentioned only" },
  { key: "niche_authority", quadLabel: "Source-Dep", desc: "Cited only" },
  { key: "invisible", quadLabel: "Invisible", desc: "Neither" },
];

export function MentionSourceMatrix({
  mentionRate,
  citationRate,
  mentionSourceRatio,
  brandArchetype,
  loading,
}: MentionSourceMatrixProps) {
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
        <div
          className="h-40 w-full rounded anim-shimmer"
          style={{ backgroundColor: "var(--bg-hover)" }}
        />
      </div>
    );
  }

  const archetypeInfo = ARCHETYPE_CONFIG[brandArchetype] ?? ARCHETYPE_CONFIG.invisible;

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
        Mention-Source Divide
      </p>

      <div className="grid grid-cols-2 gap-1.5 mb-4">
        {QUADRANTS.map((q) => {
          const active = brandArchetype === q.key;
          const config = ARCHETYPE_CONFIG[q.key];
          return (
            <div
              key={q.key}
              className="p-3 rounded-lg text-center"
              style={{
                backgroundColor: active
                  ? `color-mix(in srgb, ${config.color} 9%, transparent)`
                  : "var(--bg-hover)",
                border: active
                  ? `1px solid color-mix(in srgb, ${config.color} 25%, transparent)`
                  : "1px solid transparent",
              }}
            >
              {active && (
                <div
                  className="w-2 h-2 rounded-full mx-auto mb-1"
                  style={{ backgroundColor: config.color }}
                />
              )}
              <div
                className="text-[11px] font-semibold"
                style={{ color: active ? config.color : "var(--text-tertiary)" }}
              >
                {q.quadLabel}
              </div>
              <div
                className="text-[9px] mt-0.5"
                style={{ color: "var(--text-tertiary)" }}
              >
                {q.desc}
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <MetricChip label="Mention" value={`${mentionRate.toFixed(1)}%`} />
        <MetricChip label="Citation" value={`${citationRate.toFixed(1)}%`} />
        <MetricChip
          label="Ratio"
          value={mentionSourceRatio !== null ? mentionSourceRatio.toFixed(2) : "N/A"}
        />
      </div>

      <div
        className="rounded-md px-3 py-2"
        style={{
          backgroundColor: `color-mix(in srgb, ${archetypeInfo.color} 8%, transparent)`,
        }}
      >
        <p
          className="text-xs font-medium"
          style={{ color: archetypeInfo.color }}
        >
          {archetypeInfo.label}
        </p>
        <p className="text-[11px] mt-0.5" style={{ color: "var(--text-secondary)" }}>
          {archetypeInfo.description}
        </p>
      </div>
    </div>
  );
}

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-md px-2.5 py-2 text-center"
      style={{ backgroundColor: "var(--bg-subtle)" }}
    >
      <p className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>
        {label}
      </p>
      <p
        className="text-sm font-semibold mt-0.5"
        style={{
          fontFamily: "var(--font-mono)",
          fontVariantNumeric: "tabular-nums",
          color: "var(--text-primary)",
        }}
      >
        {value}
      </p>
    </div>
  );
}
