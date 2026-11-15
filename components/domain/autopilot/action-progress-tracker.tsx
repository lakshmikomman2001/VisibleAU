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

/** lib/workflow/progress-summary.ts, by /api/brands/[brandId]/action-progress (17 Nov, part 3). */
interface ProgressData {
  completedThisMonth: number;
  openTasks: number;
  totalTasks: number;
  reaudits: {
    measured: number;
    up: number;
    down: number;
    same: number;
    notComparable: number;
    latest: string | null;
  };
  awaitingReaudit: number;
  /** "Since 1 Nov, Sydney time" */
  monthLabel: string;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
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
            style={{ color: "var(--accent-blue)" }}
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
          <Target size={14} style={{ color: "var(--layer-workflow)" }} />
          <span className="text-[13px] font-semibold" style={{ color: "var(--text-primary)" }}>
            Autopilot
          </span>
        </div>
        <Link
          href={`/brands/${brandId}/autopilot`}
          className="flex items-center gap-1 text-[12px] font-medium"
          style={{ color: "var(--layer-workflow)" }}
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
              <CheckCircle2 size={14} style={{ color: "var(--layer-workflow)" }} />
            </div>
            <div>
              <div className="text-[12px] font-semibold" style={{ color: "var(--text-primary)" }}>
                Work Completed
              </div>
              <div className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                {data.monthLabel}
              </div>
            </div>
          </div>
          <div
            className="text-4xl font-semibold tracking-tight mb-1 tabular-nums"
            style={{
              color: "var(--layer-workflow)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {data.completedThisMonth}
          </div>
          {/* 17 Nov, part 3: it was "N / M gaps closed this month" -- M was every task ever. */}
          <div className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
            {data.completedThisMonth === 1 ? "task done" : "tasks done"} this month ·{" "}
            {plural(data.openTasks, "task")} still open
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
              <TrendingUp size={14} style={{ color: "var(--accent-blue)" }} />
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

          {/* 17 Nov, part 3: each re-audited task's change between its own audit and its re-audit
              (lib/visibility/audit-change.ts). It was "+12.3% · Citation rate improved · verified by re-audit":
              a sum of re-audit scores minus expected-impact buckets (80/50/20). */}
          {data.reaudits.measured > 0 ? (
            <div data-measured-impact="">
              <div
                className="text-4xl font-semibold tracking-tight mb-1 tabular-nums"
                style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}
              >
                {data.reaudits.measured}
              </div>
              <div
                className="flex items-center gap-1.5 text-[12px] flex-wrap"
                style={{ color: "var(--text-secondary)" }}
              >
                <span>
                  {data.reaudits.measured === 1 ? "task" : "tasks"} re-audited this month: up in{" "}
                  {data.reaudits.up}, down in {data.reaudits.down}, the same in {data.reaudits.same}
                </span>
                {data.reaudits.up > data.reaudits.down ? (
                  <TrendingUp size={12} style={{ color: "var(--success)" }} />
                ) : data.reaudits.down > data.reaudits.up ? (
                  <TrendingDown size={12} style={{ color: "var(--danger)" }} />
                ) : (
                  <Minus size={12} style={{ color: "var(--text-tertiary)" }} />
                )}
              </div>
              {data.reaudits.latest && (
                <div className="text-[11px] mt-1" style={{ color: "var(--text-tertiary)" }}>
                  Latest: {data.reaudits.latest}
                </div>
              )}
            </div>
          ) : (
            <div
              className="flex items-start gap-3 py-2 px-3 rounded-lg"
              style={{ background: "var(--bg-subtle, var(--bg-hover))" }}
            >
              <Clock
                size={14}
                style={{
                  marginTop: 2,
                  color: "var(--text-tertiary)",
                  flexShrink: 0,
                }}
              />
              <div>
                <div className="text-[12px] font-medium" style={{ color: "var(--text-primary)" }}>
                  No measured re-audit this month
                </div>
                <div className="text-[11px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                  {data.awaitingReaudit > 0
                    ? `${plural(data.awaitingReaudit, "task")} done this month: each is re-audited 14 days after it was marked done.`
                    : data.reaudits.notComparable > 0
                      ? `${plural(data.reaudits.notComparable, "re-audit")} couldn't be compared with the task's own audit.`
                      : "A task is re-audited 14 days after it's marked done."}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
