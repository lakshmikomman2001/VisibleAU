"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  AutopilotLoop,
  type AutopilotLoopData,
} from "@/components/domain/autopilot/autopilot-loop";
import { PromptTrendSection } from "@/components/domain/autopilot/prompt-trend-section";
import { useBrandFeatureGate } from "@/components/domain/pricing/brand-feature-gate";
import { PlanLockedPage } from "@/components/domain/pricing/plan-lock";
import { LoadError } from "@/components/shared/load-error";
import { failUnlessOk, fetchOrFail, LoadFailure } from "@/lib/load/fetch-json";

export default function AutopilotPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const [data, setData] = useState<AutopilotLoopData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ detail: string | null } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { locked, planRefused } = useBrandFeatureGate("autopilot");

  // Follow-ups from af8de42..d1eb5a1, part 1 (found in part 4): each fetch's failure was `res.ok ? ... : null`,
  // so a failed latest-audit showed "No autopilot loop yet" and failed gaps, tasks or drafts an empty loop. Any
  // failure is "Couldn't load your Autopilot loop" now, with Try again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is what Try again changes, to load again
  useEffect(() => {
    if (locked) return;
    let cancelled = false;

    async function load() {
      try {
        const [auditRes, gapsRes, tasksRes, draftsRes] = await Promise.all([
          fetch(`/api/brands/${brandId}/latest-audit`),
          fetch(`/api/brands/${brandId}/topical-gaps`),
          fetch(`/api/brands/${brandId}/tasks?status=open&limit=1`),
          fetch(`/api/brands/${brandId}/drafts?limit=1`),
        ]);
        for (const res of [auditRes, gapsRes, tasksRes, draftsRes]) {
          if (await planRefused(res)) return;
        }

        // Each answer must be a 2xx one; any other throws, and the page says it couldn't load.
        for (const res of [auditRes, gapsRes, tasksRes, draftsRes]) await failUnlessOk(res);
        const audit = (await auditRes.json())?.audit ?? null;

        const gapsRaw = await gapsRes.json();
        const tasksRaw = await tasksRes.json();
        const draftsRaw = await draftsRes.json();

        const gaps = gapsRaw?.gaps ?? (Array.isArray(gapsRaw) ? gapsRaw : []);
        const tasks = Array.isArray(tasksRaw) ? tasksRaw : (tasksRaw?.tasks ?? []);
        const drafts = Array.isArray(draftsRaw) ? draftsRaw : (draftsRaw?.drafts ?? []);

        const topGap =
          gaps.length > 0
            ? gaps.sort(
                (a: { priorityRank: number | null }, b: { priorityRank: number | null }) =>
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

        const brandRes = await fetchOrFail(`/api/brands/${brandId}`);
        await failUnlessOk(brandRes);
        const brand = (await brandRes.json())?.brand ?? null;

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
                  visibility: audit.visibility ?? null,
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
        if (!cancelled) setError({ detail: e instanceof LoadFailure ? e.detail : null });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [brandId, locked, planRefused, attempt]);

  if (locked) return <PlanLockedPage title="Autopilot" feature="autopilot" />;

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto" style={{ background: "var(--bg-base)" }}>
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
        className="flex-1 flex items-center justify-center p-8"
        style={{ background: "var(--bg-base)" }}
      >
        <LoadError
          what="your Autopilot loop"
          detail={error.detail}
          onRetry={() => {
            setError(null);
            setLoading(true);
            setAttempt((n) => n + 1);
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "var(--bg-base)" }}>
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
            <p className="text-[15px] font-medium mb-2">No autopilot loop yet</p>
            <p className="text-[13px]">
              The loop will populate after your first audit identifies gaps and generates
              remediation tasks.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
