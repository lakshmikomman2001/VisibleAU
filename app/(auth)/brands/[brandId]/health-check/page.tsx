"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  HealthCheckPanel,
  type MeasuredScore,
} from "@/components/domain/autopilot/health-check-panel";
import { TierGate } from "@/components/phase2/tier-gate";
import { isTierAtLeast } from "@/lib/brands";

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
  const [error, setError] = useState<string | null>(null);
  const [tier, setTier] = useState("free");
  const [panelData, setPanelData] = useState<Parameters<typeof HealthCheckPanel>[0]["data"] | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const meRes = await fetch("/api/auth/me");
        if (!meRes.ok) return;
        const me = await meRes.json();
        if (!cancelled) setTier(me.tier ?? "free");

        const [brandRes, auditRes, siteRes, agentRes, tasksRes] = await Promise.all([
          fetch(`/api/brands/${brandId}`),
          fetch(`/api/brands/${brandId}/latest-audit`),
          fetch(`/api/brands/${brandId}/site-readiness`),
          fetch(`/api/brands/${brandId}/agent-readiness`),
          fetch(`/api/brands/${brandId}/tasks?status=open&limit=1`),
        ]);

        const brand = brandRes.ok ? ((await brandRes.json())?.brand ?? null) : null;
        const audit = auditRes.ok ? ((await auditRes.json())?.audit ?? null) : null;
        const site = siteRes.ok ? await siteRes.json() : null;
        const agent = agentRes.ok ? ((await agentRes.json())?.latest ?? null) : null;
        const tasksData = tasksRes.ok ? await tasksRes.json() : [];
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
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
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
        <div
          className="p-6 rounded-xl"
          style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
        >
          {error}
        </div>
      </div>
    );
  }

  const isGrowthPlus = isTierAtLeast(tier, "growth");

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
      <TierGate requiredTier="Growth" locked={!isGrowthPlus}>
        <HealthCheckPanel data={panelData} />
      </TierGate>
    </div>
  );
}
