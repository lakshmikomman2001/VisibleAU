"use client";

import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { PromptTrendSparkline } from "./prompt-trend-sparkline";

export function PromptTrendSection({ brandId }: { brandId: string }) {
  const [prompts, setPrompts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/brands/${brandId}/prompts`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.prompts?.length) setPrompts(d.prompts);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [brandId]);

  if (loading) {
    return (
      <div
        className="rounded-xl p-6 animate-pulse"
        style={{ background: "var(--bg-elevated)", height: 120 }}
      />
    );
  }

  if (prompts.length === 0) return null;

  return (
    <div
      className="rounded-xl p-6"
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-default)",
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Activity size={15} style={{ color: "var(--text-tertiary)" }} />
        <h3
          className="text-[14px] font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          Prompt trends
        </h3>
      </div>
      <div className="flex flex-col gap-3">
        {prompts.map((prompt) => (
          <div
            key={prompt}
            className="flex items-center gap-3 rounded-lg px-3 py-2"
            style={{ background: "var(--bg-base)" }}
          >
            <span
              className="flex-1 text-[12px] truncate"
              style={{ color: "var(--text-secondary)" }}
              title={prompt}
            >
              {prompt}
            </span>
            <PromptTrendSparkline brandId={brandId} promptId={prompt} />
          </div>
        ))}
      </div>
    </div>
  );
}
