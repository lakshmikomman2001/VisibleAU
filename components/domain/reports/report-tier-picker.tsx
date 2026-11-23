"use client";

import { Lock } from "lucide-react";
import Link from "next/link";
import { type KeyboardEvent, useId, useRef } from "react";
import type { TierOption } from "@/lib/reports/report-tier-choice";
import type { ReportTier } from "@/lib/reports/report-tiers";

/**
 * S01 part 8 (contract P08.tier, LLD 8.1.7): the report type picker. Three cards in tier order (Segmented `cards`, the
 * app's look: token-map TC-33), a radiogroup named "Report type". Arrow keys move and select among the tiers the plan
 * includes; a tier above the plan is aria-disabled with the plan in its name, the app's lock marker (TC-54) and an
 * Upgrade link to /pricing (D-UI5; in the app only, never in a PDF).
 */
/** testIdOf("P08.tier") per card. */
const TEST_IDS: Record<ReportTier, string> = {
  basic: "p08-tier-basic",
  standard: "p08-tier-standard",
  enhanced: "p08-tier-enhanced",
};

export function ReportTierPicker({
  options,
  value,
  onChange,
}: {
  options: TierOption[];
  value: ReportTier;
  onChange: (tier: ReportTier) => void;
}) {
  const labelId = useId();
  const refs = useRef<Array<HTMLDivElement | null>>([]);
  const allowed = options.filter((o) => o.lockedPlan === null);

  const move = (e: KeyboardEvent<HTMLDivElement>, from: ReportTier) => {
    const forward = e.key === "ArrowRight" || e.key === "ArrowDown";
    const back = e.key === "ArrowLeft" || e.key === "ArrowUp";
    if (!forward && !back) return;
    e.preventDefault();
    if (allowed.length === 0) return;
    const at = allowed.findIndex((o) => o.tier === from);
    const next = allowed[(at + (forward ? 1 : -1) + allowed.length) % allowed.length];
    onChange(next.tier);
    refs.current[options.findIndex((o) => o.tier === next.tier)]?.focus();
  };

  return (
    <div style={{ marginTop: 16 }}>
      <div
        id={labelId}
        className="text-[12px] font-medium"
        style={{ color: "var(--text-secondary)", marginBottom: 8 }}
      >
        Report type
      </div>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        data-testid="p08-tier"
        className="grid grid-cols-1 gap-3 min-[641px]:grid-cols-3"
      >
        {options.map((o, i) => {
          const selected = o.tier === value;
          const locked = o.lockedPlan !== null;
          return (
            <div
              key={o.tier}
              className="flex flex-col"
              style={{
                borderRadius: 8,
                border: `1px solid ${selected ? "var(--accent-blue)" : "var(--border-default)"}`,
                background: selected ? "var(--accent-blue-soft)" : "var(--bg-elevated)",
              }}
            >
              {/* biome-ignore lint/a11y/useSemanticElements: a card with a description, not a native radio */}
              <div
                ref={(el) => {
                  refs.current[i] = el;
                }}
                role="radio"
                aria-checked={selected}
                aria-disabled={locked || undefined}
                aria-label={locked ? `${o.name}, available on ${o.lockedPlan} and up` : o.name}
                tabIndex={!locked && selected ? 0 : -1}
                data-testid={TEST_IDS[o.tier]}
                onClick={() => {
                  if (!locked) onChange(o.tier);
                }}
                onKeyDown={(e) => {
                  if (locked) return;
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    onChange(o.tier);
                    return;
                  }
                  move(e, o.tier);
                }}
                className="flex-1 rounded-lg focus-visible:outline focus-visible:outline-2"
                style={{
                  padding: locked ? "16px 16px 0" : 16,
                  cursor: locked ? "not-allowed" : "pointer",
                  outlineOffset: 2,
                }}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className="text-[13px] font-semibold"
                    style={{ color: locked ? "var(--text-tertiary)" : "var(--text-primary)" }}
                  >
                    {o.name}
                  </span>
                  {locked ? (
                    <span
                      data-plan-lock="report_tier"
                      title={`Part of the ${o.lockedPlan} plan`}
                      className="inline-flex items-center gap-1 text-[11px] font-medium"
                      style={{ color: "var(--text-tertiary)", whiteSpace: "nowrap" }}
                    >
                      <Lock aria-hidden="true" style={{ width: 12, height: 12, flexShrink: 0 }} />
                      {o.lockedPlan}
                    </span>
                  ) : null}
                </div>
                <p
                  className="text-[12px]"
                  style={{ lineHeight: 1.45, color: "var(--text-secondary)", margin: "6px 0 0" }}
                >
                  {o.description}
                </p>
              </div>
              {locked ? (
                // Outside the radio (its children are presentational), so the link stays reachable by keyboard.
                <p
                  className="text-[12px]"
                  style={{ margin: 0, padding: "6px 16px 16px", color: "var(--text-tertiary)" }}
                >
                  Available on {o.lockedPlan} and up ·{" "}
                  <Link
                    href="/pricing"
                    style={{ color: "var(--accent-blue)", textDecoration: "underline" }}
                  >
                    Upgrade
                  </Link>
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
