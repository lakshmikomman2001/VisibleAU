"use client";

import { useCallback } from "react";
import { useBrandFeatureGate } from "@/components/domain/pricing/brand-feature-gate";
import { PlanLockedCard } from "@/components/domain/pricing/plan-lock";
import { LoadError } from "@/components/shared/load-error";
import { CDN_UNTESTABLE_SENTENCE } from "@/lib/crawler/access-copy";
import { useLoad } from "@/lib/hooks/use-load";
import { fetchOrFail, readJson } from "@/lib/load/fetch-json";
import { CRAWLER_NAME } from "@/lib/product";

interface VolumeByVendor {
  vendor: string;
  crawlerTier: string;
  total: number;
  retrieval: number;
  indexing: number;
  training: number;
}

interface VolumeByPurpose {
  purpose: string;
  count: number;
  percentage: number;
}

interface VerificationRate {
  vendor: string;
  verified: number;
  unverified: number;
  spoofed: number;
  total: number;
  unverifiedRate: number;
  spoofedRate: number;
}

interface RatioResult {
  vendor: string;
  verifiedCrawls: number;
  referralSessions: number;
  ratio: number | null;
  ratioLabel: string;
  benchmark: number | null;
}

interface OverviewShape {
  volumeByVendor: VolumeByVendor[];
  volumeByPurpose: VolumeByPurpose[];
  verificationRates: VerificationRate[];
  periodStart: string;
  periodEnd: string;
}

interface Props {
  overview: OverviewShape;
  ratioData: {
    results: RatioResult[];
    caveat: string;
    periodStart: string;
    periodEnd: string;
  } | null;
  ratioLocked: boolean;
  brandId: string;
}

/** One AI crawler's row (lib/agent-analytics/cdn-shield-join.ts CdnJoinRow, as the route sends it). */
interface CdnJoinRow {
  vendor: string;
  crawlerName: string;
  robots: { verdict: "allowed" | "blocked"; sentence: string } | null;
  robotsBlocked: boolean;
  verifiedVisits: number;
  hasCrawlActivity: boolean;
  verdict: string;
  sentence: string;
}

// Follow-ups from af8de42..d1eb5a1 (10 Nov), part 2: the verdicts say what was really checked -- robots.txt's
// rules for the crawler, read as us, and its verified visits in the logs. "Shield: Blocked/Allowed" was a
// request sent as the crawler; "Not Blocked" claimed what nothing tested.
const VERDICT_LABELS: Record<string, { label: string; color: string }> = {
  healthy: { label: "Reaches your site", color: "var(--success)" },
  not_blocked_never_visited: { label: "Allowed, not in your logs", color: "var(--warning)" },
  self_blocked: { label: "Blocked by robots.txt", color: "var(--danger)" },
  robots_violation: { label: "Visits despite robots.txt", color: "var(--danger)" },
  not_testable: { label: "Can't be tested from outside", color: "var(--text-secondary)" },
};

export function AgentAnalyticsSection({ overview, ratioData, ratioLocked, brandId }: Props) {
  const { locked: cdnLocked, planRefused } = useBrandFeatureGate("cdn_shield_check");
  // Playwright-run follow-ups (10 Nov), part 8: a failed fetch was dropped, so the section said "Loading CDN
  // Shield analysis..." for good. It says it failed, through the shared loader (useLoad, part 1 of the
  // af8de42..d1eb5a1 follow-ups), with Try again.
  const loadCdnJoin = useCallback(
    async (signal: AbortSignal): Promise<CdnJoinRow[] | null> => {
      const res = await fetchOrFail(`/api/brands/${brandId}/agent-analytics/cdn-join`, { signal });
      if (await planRefused(res)) return null;
      return (await readJson<{ cdnJoin: { results: CdnJoinRow[] } }>(res)).cdnJoin.results;
    },
    [brandId, planRefused],
  );
  const cdn = useLoad(loadCdnJoin, { enabled: !cdnLocked });
  const cdnJoin = cdn.data;

  return (
    <div className="space-y-6">
      {/* Volume by Purpose — pie representation */}
      <section>
        <h2 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>
          Traffic by Purpose
        </h2>
        <div className="mt-3 space-y-2">
          {overview.volumeByPurpose.map((p) => (
            <div key={p.purpose} className="flex items-center gap-3">
              <div
                className="h-3 rounded-sm"
                style={{
                  width: `${Math.max(p.percentage, 2)}%`,
                  maxWidth: "60%",
                  backgroundColor: purposeColor(p.purpose),
                }}
              />
              <span className="text-sm" style={{ color: "var(--foreground)" }}>
                {p.purpose} — {p.count.toLocaleString()} ({p.percentage}%)
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Vendor table */}
      <section>
        <h2 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>
          Volume by Vendor
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: "var(--text-secondary)" }}>
                <th className="pb-2 text-left font-medium">Vendor</th>
                <th className="pb-2 text-left font-medium">Tier</th>
                <th className="pb-2 text-right font-medium">Total</th>
                <th className="pb-2 text-right font-medium">Retrieval</th>
                <th className="pb-2 text-right font-medium">Indexing</th>
                <th className="pb-2 text-right font-medium">Training</th>
              </tr>
            </thead>
            <tbody>
              {overview.volumeByVendor.map((v) => (
                <tr
                  key={v.vendor}
                  className="border-t"
                  style={{ borderColor: "color-mix(in srgb, var(--foreground) 8%, transparent)" }}
                >
                  <td className="py-2" style={{ color: "var(--foreground)" }}>
                    {v.vendor}
                  </td>
                  <td className="py-2" style={{ color: "var(--text-secondary)" }}>
                    {v.crawlerTier}
                  </td>
                  <td
                    className="py-2 text-right tabular-nums"
                    style={{ color: "var(--foreground)" }}
                  >
                    {v.total.toLocaleString()}
                  </td>
                  <td className="py-2 text-right tabular-nums" style={{ color: "var(--success)" }}>
                    {v.retrieval.toLocaleString()}
                  </td>
                  <td className="py-2 text-right tabular-nums" style={{ color: "var(--info)" }}>
                    {v.indexing.toLocaleString()}
                  </td>
                  <td
                    className="py-2 text-right tabular-nums"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {v.training.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Verification rates */}
      <section>
        <h2 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>
          Verification Rates by Vendor
        </h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: "var(--text-secondary)" }}>
                <th className="pb-2 text-left font-medium">Vendor</th>
                <th className="pb-2 text-right font-medium">Verified</th>
                <th className="pb-2 text-right font-medium">Unverified</th>
                <th className="pb-2 text-right font-medium">Spoofed</th>
                <th className="pb-2 text-right font-medium">Unverified %</th>
              </tr>
            </thead>
            <tbody>
              {overview.verificationRates.map((r) => (
                <tr
                  key={r.vendor}
                  className="border-t"
                  style={{ borderColor: "color-mix(in srgb, var(--foreground) 8%, transparent)" }}
                >
                  <td className="py-2" style={{ color: "var(--foreground)" }}>
                    {r.vendor}
                  </td>
                  <td className="py-2 text-right tabular-nums" style={{ color: "var(--success)" }}>
                    {r.verified.toLocaleString()}
                  </td>
                  <td className="py-2 text-right tabular-nums" style={{ color: "var(--warning)" }}>
                    {r.unverified.toLocaleString()}
                  </td>
                  <td className="py-2 text-right tabular-nums" style={{ color: "var(--danger)" }}>
                    {r.spoofed.toLocaleString()}
                  </td>
                  <td
                    className="py-2 text-right tabular-nums font-medium"
                    style={{
                      color: r.unverifiedRate > 25 ? "var(--danger)" : "var(--text-secondary)",
                    }}
                  >
                    {r.unverifiedRate}%{r.unverifiedRate > 25 && " ⚠"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* CDN Shield Join — Growth-gated */}
      <section>
        <h2 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>
          CDN Shield × Crawler Activity
        </h2>
        <p className="mt-1 text-sm" style={{ color: "var(--text-secondary)" }}>
          From your robots.txt (read as {CRAWLER_NAME}) and each crawler&apos;s verified visits in
          your logs. We never visit your site pretending to be an AI crawler.
        </p>
        {cdnLocked ? (
          <div className="mt-3">
            <PlanLockedCard feature="cdn_shield_check" />
          </div>
        ) : cdn.status === "error" ? (
          <LoadError
            what="the CDN Shield analysis"
            detail={cdn.detail}
            onRetry={cdn.retry}
            className="mt-3"
          />
        ) : cdnJoin?.length === 0 ? (
          <p className="mt-3 text-sm" style={{ color: "var(--text-secondary)" }}>
            No CDN Shield results for this brand yet.
          </p>
        ) : cdnJoin != null ? (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: "var(--text-secondary)" }}>
                  <th className="pb-2 text-left font-medium">Crawler</th>
                  <th className="pb-2 text-left font-medium">robots.txt</th>
                  <th className="pb-2 text-left font-medium">Verified visits</th>
                  <th className="pb-2 text-left font-medium">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {cdnJoin.map((row) => {
                  const v = VERDICT_LABELS[row.verdict] ?? {
                    label: row.verdict,
                    color: "var(--text-secondary)",
                  };
                  return (
                    <tr
                      key={row.vendor}
                      className="border-t"
                      style={{
                        borderColor: "color-mix(in srgb, var(--foreground) 8%, transparent)",
                      }}
                    >
                      <td className="py-2" style={{ color: "var(--foreground)" }}>
                        {row.crawlerName}
                      </td>
                      <td
                        className="py-2"
                        style={{
                          color: row.robots
                            ? row.robotsBlocked
                              ? "var(--danger)"
                              : "var(--success)"
                            : "var(--text-secondary)",
                        }}
                      >
                        {row.robots
                          ? row.robotsBlocked
                            ? "Blocks it"
                            : "Allows it"
                          : "Couldn't read"}
                      </td>
                      <td
                        className="py-2 tabular-nums"
                        style={{
                          color: row.hasCrawlActivity ? "var(--success)" : "var(--text-secondary)",
                        }}
                      >
                        {row.verifiedVisits}
                      </td>
                      <td className="py-2">
                        <span className="font-medium" style={{ color: v.color }}>
                          {v.label}
                        </span>
                        <span className="block text-xs" style={{ color: "var(--text-secondary)" }}>
                          {row.sentence}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {cdnJoin.some((r) => r.verdict === "self_blocked") && (
              <p className="mt-2 text-sm" style={{ color: "var(--danger)" }}>
                Your robots.txt keeps these crawlers out, so their AI engines can&apos;t read your
                content. Allow them in robots.txt if you want to appear in their answers.
              </p>
            )}
            {cdnJoin.some((r) => r.verdict === "not_testable") && (
              <p
                className="mt-2 text-sm"
                style={{ color: "var(--text-secondary)" }}
                data-cdn-untestable
              >
                {CDN_UNTESTABLE_SENTENCE}
              </p>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm" style={{ color: "var(--text-secondary)" }}>
            Loading CDN Shield analysis...
          </p>
        )}
      </section>
    </div>
  );
}

function purposeColor(purpose: string): string {
  switch (purpose) {
    case "retrieval":
      return "var(--success)";
    case "indexing":
      return "var(--info)";
    case "training":
      return "color-mix(in srgb, var(--foreground) 40%, transparent)";
    default:
      return "var(--text-secondary)";
  }
}
