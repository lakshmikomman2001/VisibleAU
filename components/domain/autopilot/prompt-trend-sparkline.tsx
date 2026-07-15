"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  Tooltip,
} from "recharts";

interface TrendPoint {
  week: string;
  mentionRate: number;
}

export function PromptTrendSparkline({
  brandId,
  promptId,
}: {
  brandId: string;
  promptId: string;
}) {
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(
      `/api/brands/${brandId}/prompts/${encodeURIComponent(promptId)}/trend`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        if (d?.trend?.length) {
          setTrend(d.trend);
        } else {
          setMessage(d?.message ?? "Not enough history yet");
        }
      })
      .catch(() => {
        if (!cancelled) setMessage("—");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [brandId, promptId]);

  if (loading) {
    return (
      <div
        className="h-8 w-24 rounded animate-pulse"
        style={{ background: "var(--bg-hover)" }}
      />
    );
  }

  if (message || trend.length < 2) {
    return (
      <span
        className="text-[11px]"
        style={{ color: "var(--text-tertiary)" }}
      >
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
            stroke={
              improving
                ? "var(--success, #22c55e)"
                : "var(--danger, #ef4444)"
            }
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
