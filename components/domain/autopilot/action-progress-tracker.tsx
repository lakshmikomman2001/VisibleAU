"use client";

import {
  ArrowRight,
  CheckCircle2,
  Clock,
  Minus,
  Target,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useCallback } from "react";
import { useBrandFeatureGate } from "@/components/domain/pricing/brand-feature-gate";
import { PlanLockedCard } from "@/components/domain/pricing/plan-lock";
import { LoadError } from "@/components/shared/load-error";
import { useLoad } from "@/lib/hooks/use-load";
import { fetchOrFail, readJson } from "@/lib/load/fetch-json";

interface ProgressData {
  completedThisMonth: number;
  totalTasks: number;
  measuredImpact: number | null;
  validationPending: boolean;
}

export function ActionProgressTracker({ brandId }: { brandId: string }) {
  const { locked, planRefused } = useBrandFeatureGate("action_progress");
  // Follow-ups from af8de42..d1eb5a1, part 1: a failed fetch was `null` (or a swallowed catch), which showed
  // "No gaps closed yet this month". It says it couldn't load now. A plan refusal locks the card.
  const load = useCallback(
    async (signal: AbortSignal): Promise<ProgressData | null> => {
      const res = await fetchOrFail(`/api/brands/${brandId}/action-progress`, { signal });
      if (await planRefused(res)) return null;
      return readJson<ProgressData>(res);
    },
    [brandId, planRefused],
  );
  const progress = useLoad(load, { enabled: !locked });
  const data = progress.data;

  if (locked) {
    return (
      <div className="mb-6">
        <PlanLockedCard feature="action_progress" />
      </div>
    );
  }

  if (progress.status === "error") {
    return (
      <LoadError
        what="your Autopilot progress"
        detail={progress.detail}
        onRetry={progress.retry}
        className="mb-6"
      />
    );
  }

  if (progress.status === "loading") {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div
          className="h-36 rounded-xl animate-pulse"
          style={{ background: "var(--bg-elevated)" }}
        />
        <div
          className="h-36 rounded-xl animate-pulse"
          style={{ background: "var(--bg-elevated)" }}
        />
      </div>
    );
  }

  if (!data || data.totalTasks === 0) {
    return (
      <div
        className="rounded-xl p-5 mb-6"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Target size={14} style={{ color: "var(--text-tertiary)" }} />
          <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
            Autopilot
          </span>
        </div>
        <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
          No gaps closed yet this month —{" "}
          <Link
            href={`/brands/${brandId}/autopilot`}
            className="font-medium"
            style={{ color: "var(--accent-blue, #3b82f6)" }}
          >
            here&apos;s your top priority
          </Link>
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Target size={14} style={{ color: "var(--layer-workflow, #6366f1)" }} />
          <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
            Autopilot
          </span>
        </div>
        <Link
          href={`/brands/${brandId}/autopilot`}
          className="flex items-center gap-1 text-[12px] font-medium"
          style={{ color: "var(--layer-workflow, #6366f1)" }}
        >
          View full loop <ArrowRight size={12} />
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6" aria-live="polite">
        {/* Work Completed — shown immediately */}
        <div
          className="rounded-xl p-5"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
          }}
        >
          <div className="flex items-center gap-2 mb-4">
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center"
              style={{
                background: "color-mix(in srgb, var(--layer-workflow) 12%, transparent)",
              }}
            >
              <CheckCircle2 size={14} style={{ color: "var(--layer-workflow, #6366f1)" }} />
            </div>
            <div>
              <div className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
                Work Completed
              </div>
              <div className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                This month
              </div>
            </div>
          </div>
          <div
            className="text-4xl font-semibold tracking-tight mb-1 tabular-nums"
            style={{
              color: "var(--layer-workflow, #6366f1)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {data.completedThisMonth}{" "}
            <span className="text-xl" style={{ color: "var(--text-tertiary)" }}>
              / {data.totalTasks}
            </span>
          </div>
          <div className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            gaps closed this month
          </div>
        </div>

        {/* Measured Impact — pending until score_after IS NOT NULL */}
        <div
          className="rounded-xl p-5"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
          }}
        >
          <div className="flex items-center gap-2 mb-4">
            <div
              className="w-7 h-7 rounded-md flex items-center justify-center"
              style={{ background: "var(--accent-blue-soft, rgba(59,130,246,0.1))" }}
            >
              <TrendingUp size={14} style={{ color: "var(--accent-blue, #3b82f6)" }} />
            </div>
            <div>
              <div className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
                Measured Impact
              </div>
              <div className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                After re-audit
              </div>
            </div>
          </div>

          {data.measuredImpact != null ? (
            <>
              <div
                className="text-4xl font-semibold tracking-tight mb-1 tabular-nums"
                style={{
                  color:
                    data.measuredImpact > 0
                      ? "var(--success)"
                      : data.measuredImpact < 0
                        ? "var(--danger)"
                        : "var(--text-secondary)",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {data.measuredImpact > 0 ? "+" : ""}
                {data.measuredImpact.toFixed(1)}%
              </div>
              <div
                className="flex items-center gap-1.5 text-[12px]"
                style={{ color: "var(--text-secondary)" }}
              >
                {data.measuredImpact > 0 ? (
                  <TrendingUp size={12} style={{ color: "var(--success)" }} />
                ) : data.measuredImpact < 0 ? (
                  <TrendingDown size={12} style={{ color: "var(--danger)" }} />
                ) : (
                  <Minus size={12} style={{ color: "var(--text-tertiary)" }} />
                )}
                <span>
                  {data.measuredImpact > 0
                    ? "Citation rate improved · verified by re-audit"
                    : data.measuredImpact < 0
                      ? "Citation rate decreased · verified by re-audit"
                      : "No measurable change yet · verified by re-audit"}
                </span>
              </div>
            </>
          ) : (
            <div
              className="flex items-start gap-3 py-2 px-3 rounded-lg"
              style={{ background: "var(--bg-subtle, var(--bg-hover))" }}
            >
              <Clock
                size={14}
                style={{
                  marginTop: 2,
                  color: "var(--warning)",
                  flexShrink: 0,
                }}
              />
              <div>
                <div className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>
                  Validation audit scheduled
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                  Measured impact pending — re-audit needed
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
