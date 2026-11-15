"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip } from "recharts";
import { useBrandFeatureGate } from "@/components/domain/pricing/brand-feature-gate";
import { PlanLockBadge } from "@/components/domain/pricing/plan-lock";
import { useGatedJson } from "@/lib/hooks/use-load";
import { loadFailedMessage } from "@/lib/load/fetch-json";

/** lib/visibility/question-trend.ts: one audit's answers to this question, and how many named the brand. */
interface TrendPoint {
  auditNumber: number;
  completedAt: string | null;
  mentioned: number;
  answers: number;
}

interface TrendAnswer {
  trend?: TrendPoint[];
  message?: string;
}

const NO_TREND: TrendPoint[] = [];

export function PromptTrendSparkline({ brandId, promptId }: { brandId: string; promptId: string }) {
  const { locked, planRefused } = useBrandFeatureGate("prompt_trends");
  // Follow-ups from af8de42..d1eb5a1, part 1: a failed fetch was `null`, shown as "Not enough history yet"
  // (or "—"). It says it couldn't load now, with Try again.
  const loaded = useGatedJson<TrendAnswer>(
    `/api/brands/${brandId}/prompts/${encodeURIComponent(promptId)}/trend`,
    planRefused,
    { enabled: !locked },
  );
  const trend = loaded.data?.trend ?? NO_TREND;
  const message = loaded.data && !loaded.data.trend?.length ? (loaded.data.message ?? null) : null;

  if (locked) return <PlanLockBadge feature="prompt_trends" />;

  if (loaded.status === "error") {
    return (
      <span
        role="alert"
        className="text-[11px] inline-flex items-center gap-1"
        style={{ color: "var(--danger)" }}
      >
        {loadFailedMessage("the trend")}
        <button
          type="button"
          onClick={loaded.retry}
          className="underline"
          style={{ color: "var(--text-secondary)" }}
        >
          Try again
        </button>
      </span>
    );
  }

  if (loaded.status === "loading") {
    return (
      <div className="h-8 w-24 rounded animate-pulse" style={{ background: "var(--bg-hover)" }} />
    );
  }

  if (message || trend.length < 2) {
    return (
      <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
        {message ?? "Not enough history yet"}
      </span>
    );
  }

  // 17 Nov, part 3: each point an audit, with its counts; a neutral line -- it was green or red from the first and
  // last points alone, a verdict from a few answers.
  const data = trend.map((t) => ({
    ...t,
    label: `Audit #${t.auditNumber}`,
    rate: t.answers > 0 ? Math.round((t.mentioned / t.answers) * 100) : 0,
  }));

  return (
    <div className="w-full sm:w-24 h-8 sm:inline-block block sm:align-middle mt-1 sm:mt-0">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="rate"
            stroke="var(--accent-blue)"
            strokeWidth={1.5}
            dot={false}
          />
          <Tooltip
            contentStyle={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-default)",
              borderRadius: 6,
              fontSize: 11,
              padding: "4px 8px",
            }}
            formatter={(_value, _name, item) => {
              const p = item.payload as (typeof data)[number];
              return [`${p.mentioned} of ${p.answers} answers named you`, p.label];
            }}
            labelFormatter={() => ""}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
