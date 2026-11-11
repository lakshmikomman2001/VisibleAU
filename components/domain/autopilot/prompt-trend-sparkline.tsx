"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip } from "recharts";
import { useBrandFeatureGate } from "@/components/domain/pricing/brand-feature-gate";
import { PlanLockBadge } from "@/components/domain/pricing/plan-lock";
import { useGatedJson } from "@/lib/hooks/use-load";
import { loadFailedMessage } from "@/lib/load/fetch-json";

interface TrendPoint {
  week: string;
  mentionRate: number;
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

  const data = trend.map((t) => ({
    ...t,
    rate: Math.round(t.mentionRate * 1000) / 10,
  }));

  const latest = data[data.length - 1].rate;
  const first = data[0].rate;
  const improving = latest >= first;

  return (
    <div className="w-full sm:w-24 h-8 sm:inline-block block sm:align-middle mt-1 sm:mt-0">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="rate"
            stroke={improving ? "var(--success)" : "var(--danger)"}
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
            formatter={(value) => [`${value}%`, "Mention rate"]}
            labelFormatter={(label) => {
              const d = new Date(String(label));
              return d.toLocaleDateString("en-AU", {
                day: "numeric",
                month: "short",
              });
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
