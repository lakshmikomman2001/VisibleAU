"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  HealthCheckPanel,
  type MeasuredScore,
} from "@/components/domain/autopilot/health-check-panel";
import { useBrandFeatureGate } from "@/components/domain/pricing/brand-feature-gate";
import { PlanLockedPage } from "@/components/domain/pricing/plan-lock";
import { LoadError } from "@/components/shared/load-error";
import { failUnlessOk, LoadFailure } from "@/lib/load/fetch-json";

const SAAS_VERTICALS = ["saas", "software", "fintech", "edtech", "martech"];

/** "3 Nov", the way this page already shows its audit date. */
function shortDate(value: string | null | undefined): string {
  return value
    ? new Date(value).toLocaleDateString("en-AU", { day: "numeric", month: "short" })
    : "on an unknown date";
}

/** A score with no result is "Not measured yet" on the card, never 0. */
function measured(
  score: string | number | null | undefined,
  max: number | null | undefined,
  on: string | null | undefined,
): MeasuredScore | null {
  if (score === null || score === undefined || score === "" || !max) return null;
  const value = Number(score);
  return Number.isFinite(value) ? { score: value, max, on: shortDate(on) } : null;
}

export default function HealthCheckPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ detail: string | null } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const { locked, planRefused } = useBrandFeatureGate("health_check");
  const [panelData, setPanelData] = useState<Parameters<typeof HealthCheckPanel>[0]["data"] | null>(
    null,
  );

  // Follow-ups from af8de42..d1eb5a1, part 1 (found in part 4): each fetch's failure was `res.ok ? ... : null`
  // (or []), so a failed latest-audit showed the no-audit state and a failed site check "Not measured yet". Any
  // failure is "Couldn't load your Health Check" now, with Try again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is what Try again changes, to load again
  useEffect(() => {
    if (locked) return;
    let cancelled = false;

    async function load() {
      try {
        const [brandRes, auditRes, siteRes, agentRes, tasksRes] = await Promise.all([
          fetch(`/api/brands/${brandId}`),
          fetch(`/api/brands/${brandId}/latest-audit`),
          fetch(`/api/brands/${brandId}/site-readiness`),
          fetch(`/api/brands/${brandId}/agent-readiness`),
          fetch(`/api/brands/${brandId}/tasks?status=open&limit=1`),
        ]);
        for (const res of [auditRes, siteRes, agentRes, tasksRes]) {
          if (await planRefused(res)) return;
        }

        // Each answer must be a 2xx one; any other throws, and the page says it couldn't load.
        for (const res of [brandRes, auditRes, siteRes, agentRes, tasksRes])
          await failUnlessOk(res);
        const brand = (await brandRes.json())?.brand ?? null;
        const audit = (await auditRes.json())?.audit ?? null;
        const site = await siteRes.json();
        const agent = (await agentRes.json())?.latest ?? null;
        const tasksData = await tasksRes.json();
        const tasks = Array.isArray(tasksData) ? tasksData : (tasksData?.tasks ?? []);

        if (!audit) {
          if (!cancelled) {
            setPanelData(null);
            setLoading(false);
          }
          return;
        }

        const isSaas = SAAS_VERTICALS.includes((brand?.vertical ?? "").toLowerCase());

        // Health Check (7 Nov): each check as measured, no combined score. AI presence is the
        // audit's Visibility exactly as /api/brands/[brandId]/latest-audit resolves it; site
        // readiness is the technical audit's own score out of its own maximum; local authority
        // is the trust score out of 100. Sentiment has no classifier, so it isn't a card.
        const visibility = audit.visibility ?? {
          value: "—",
          detail: "Not enough answers",
          band: null,
        };
        const ciLow = audit.scoreConfidenceLow;
        const ciHigh = audit.scoreConfidenceHigh;

        const topTask = tasks.sort(
          (a: { priority: number }, b: { priority: number }) =>
            (a.priority ?? 999) - (b.priority ?? 999),
        )[0];

        if (!cancelled) {
          setPanelData({
            aiPresence: {
              ...visibility,
              ci:
                ciLow != null && ciHigh != null
                  ? { lower: Number(ciLow), upper: Number(ciHigh) }
                  : null,
            },
            siteReadiness: measured(site?.scoreComposite, site?.maxScore, site?.checkedAt),
            localAuthority: measured(agent?.localAiTrustScore, 100, agent?.scoredAt),
            topAction: topTask
              ? {
                  title: topTask.title ?? "Review top recommendation",
                  rationale: topTask.description ?? "",
                  expectedImpact: null,
                  confidenceLabel: topTask.confidenceLabel ?? "likely",
                  brandId,
                }
              : null,
            brandName: brand?.name ?? "Brand",
            auditDate: audit.completedAt
              ? new Date(audit.completedAt).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : "Recent",
            engineCount: audit.engineCount ?? audit.engines?.length ?? 0,
            isSaas,
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

  if (locked) return <PlanLockedPage title="Health Check" feature="health_check" />;

  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto" style={{ background: "var(--bg-base)" }}>
        <div className="h-64 animate-pulse" style={{ background: "var(--bg-elevated)" }} />
        <div className="max-w-[960px] mx-auto p-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-32 rounded-xl animate-pulse"
              style={{ background: "var(--bg-elevated)" }}
            />
          ))}
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
        <LoadError
          what="your Health Check"
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

  if (!panelData) {
    return (
      <div
        className="flex-1 flex items-center justify-center"
        style={{ background: "var(--bg-base)" }}
      >
        <div className="text-center p-12">
          <p className="text-[15px] font-medium mb-2" style={{ color: "var(--text-primary)" }}>
            Run your first audit to see your Health Check
          </p>
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
            Once your first audit completes, your Health Check will appear here with a traffic-light
            breakdown and your #1 recommended action.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "var(--bg-base)" }}>
      <HealthCheckPanel data={panelData} />
    </div>
  );
}
