"use client";

import { Activity } from "lucide-react";
import { useCallback } from "react";
import { useBrandFeatureGate } from "@/components/domain/pricing/brand-feature-gate";
import { PlanLockedCard } from "@/components/domain/pricing/plan-lock";
import { LoadError } from "@/components/shared/load-error";
import { useLoad } from "@/lib/hooks/use-load";
import { fetchOrFail, readJson } from "@/lib/load/fetch-json";
import { PromptTrendSparkline } from "./prompt-trend-sparkline";

export function PromptTrendSection({ brandId }: { brandId: string }) {
  const { locked, planRefused } = useBrandFeatureGate("prompt_trends");
  // Follow-ups from af8de42..d1eb5a1, part 1: a failed fetch hid the section, as if there were no prompts.
  // It says it couldn't load now; a brand with no prompts yet still shows nothing.
  const load = useCallback(
    async (signal: AbortSignal): Promise<string[]> => {
      const res = await fetchOrFail(`/api/brands/${brandId}/prompts`, { signal });
      if (await planRefused(res)) return [];
      return (await readJson<{ prompts: string[] }>(res)).prompts;
    },
    [brandId, planRefused],
  );
  const loaded = useLoad(load, { enabled: !locked, isEmpty: (rows) => rows.length === 0 });

  if (locked) return <PlanLockedCard feature="prompt_trends" />;

  if (loaded.status === "error") {
    return <LoadError what="your prompt trends" detail={loaded.detail} onRetry={loaded.retry} />;
  }

  if (loaded.status === "loading") {
    return (
      <div
        className="rounded-xl p-6 animate-pulse"
        style={{ background: "var(--bg-elevated)", height: 120 }}
      />
    );
  }

  if (loaded.status === "empty") return null;
  const prompts = loaded.data;

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
        <h3 className="text-[14px] font-semibold" style={{ color: "var(--text-primary)" }}>
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
