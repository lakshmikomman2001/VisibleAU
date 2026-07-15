"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  AutopilotLoop,
  type AutopilotLoopData,
} from "@/components/domain/autopilot/autopilot-loop";
import { PromptTrendSection } from "@/components/domain/autopilot/prompt-trend-section";
import { TierGate } from "@/components/phase2/tier-gate";
import { isTierAtLeast } from "@/lib/brands";

export default function AutopilotPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const [data, setData] = useState<AutopilotLoopData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tier, setTier] = useState("free");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const meRes = await fetch("/api/auth/me");
        if (!meRes.ok) return;
        const me = await meRes.json();
        if (!cancelled) setTier(me.tier ?? "free");

        const [auditRes, gapsRes, tasksRes, draftsRes] = await Promise.all([
          fetch(`/api/brands/${brandId}/latest-audit`),
          fetch(`/api/brands/${brandId}/topical-gaps`),
          fetch(`/api/brands/${brandId}/tasks?status=open&limit=1`),
          fetch(`/api/brands/${brandId}/drafts?limit=1`),
        ]);

        const audit = auditRes.ok ? (await auditRes.json())?.audit ?? null : null;

        const gapsRaw = gapsRes.ok ? await gapsRes.json() : null;
        const tasksRaw = tasksRes.ok ? await tasksRes.json() : null;
        const draftsRaw = draftsRes.ok ? await draftsRes.json() : null;

        const gaps = gapsRaw?.gaps ?? (Array.isArray(gapsRaw) ? gapsRaw : []);
        const tasks = Array.isArray(tasksRaw) ? tasksRaw : tasksRaw?.tasks ?? [];
        const drafts = Array.isArray(draftsRaw) ? draftsRaw : draftsRaw?.drafts ?? [];

        const topGap =
          gaps.length > 0
            ? gaps.sort(
                (a: { priorityRank: number }, b: { priorityRank: number }) =>
                  (a.priorityRank ?? 999) - (b.priorityRank ?? 999),
              )[0]
            : null;

        const topTask =
          tasks.length > 0
            ? tasks.sort(
                (a: { priority: number }, b: { priority: number }) =>
                  (a.priority ?? 999) - (b.priority ?? 999),
              )[0]
            : null;

        const draft = drafts.length > 0 ? drafts[0] : null;

        const brandRes = await fetch(`/api/brands/${brandId}`);
        const brand = brandRes.ok ? (await brandRes.json())?.brand ?? null : null;

        let explainability = null;
        if (audit?.explainability) {
          explainability = audit.explainability;
        } else if (topTask?.explainability) {
          explainability = topTask.explainability;
        }

        if (!cancelled) {
          setData({
            audit: audit
              ? {
                  scoreComposite: audit.scoreComposite ?? audit.score ?? null,
                  engineCount: audit.engineCount ?? audit.engines?.length ?? 0,
                  promptsCount: audit.promptsCount ?? 0,
                  completedAt: audit.completedAt ?? null,
                }
              : null,
            topGap,
            topTask,
            explainability,
            draft,
            brandId,
            brandName: brand?.name ?? "Brand",
          });
        }
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [brandId]);

  if (loading) {
    return (
      <div
        className="flex-1 overflow-y-auto"
        style={{ background: "var(--bg-base)" }}
      >
        <div className="px-8 py-8">
          <div
            className="h-32 rounded-xl animate-pulse mb-6"
            style={{ background: "var(--bg-elevated)" }}
          />
          <div className="max-w-[640px] mx-auto space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-20 rounded-lg animate-pulse"
                style={{ background: "var(--bg-elevated)" }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="flex-1 flex items-center justify-center"
        style={{ background: "var(--bg-base)" }}
      >
        <div
          className="p-6 rounded-xl text-center"
          style={{
            background: "var(--danger-soft)",
            color: "var(--danger)",
          }}
        >
          {error}
        </div>
      </div>
    );
  }

  const isGrowthPlus = isTierAtLeast(tier, "growth");

  return (
    <div
      className="flex-1 overflow-y-auto"
      style={{ background: "var(--bg-base)" }}
    >
      <TierGate requiredTier="Growth" locked={!isGrowthPlus}>
        {data ? (
          <>
            <AutopilotLoop data={data} />
            <div className="px-8 pb-8">
              <PromptTrendSection brandId={brandId} />
            </div>
          </>
        ) : (
          <div
            className="flex-1 flex items-center justify-center p-12"
            style={{ color: "var(--text-secondary)" }}
          >
            <div className="text-center">
              <p className="text-[15px] font-medium mb-2">
                No autopilot loop yet
              </p>
              <p className="text-[13px]">
                The loop will populate after your first audit identifies gaps and
                generates remediation tasks.
              </p>
            </div>
          </div>
        )}
      </TierGate>
    </div>
  );
}
