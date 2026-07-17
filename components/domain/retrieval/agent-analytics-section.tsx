"use client";

import { useEffect, useState } from "react";
import { TierGate } from "@/components/phase2/tier-gate";

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
  ratioData: { results: RatioResult[]; caveat: string; periodStart: string; periodEnd: string } | null;
  ratioLocked: boolean;
  brandId: string;
}

interface CdnJoinRow {
  vendor: string;
  crawlerName: string;
  shieldBlocked: boolean;
  hasCrawlActivity: boolean;
  verdict: string;
}

const VERDICT_LABELS: Record<string, { label: string; color: string }> = {
  healthy: { label: "Healthy", color: "var(--success)" },
  not_blocked_never_visited: { label: "Not Blocked — Never Visited", color: "var(--warning)" },
  self_blocked: { label: "Self-Blocked — Invisible", color: "var(--danger)" },
  robots_violation: { label: "Robots Violation", color: "var(--danger)" },
};

export function AgentAnalyticsSection({ overview, ratioData, ratioLocked, brandId }: Props) {
  const [cdnJoin, setCdnJoin] = useState<CdnJoinRow[] | null>(null);
  const [cdnLocked, setCdnLocked] = useState(false);

  useEffect(() => {
    fetch(`/api/brands/${brandId}/agent-analytics/cdn-join`)
      .then(async (r) => {
        if (r.status === 403) { setCdnLocked(true); return; }
        if (!r.ok) return;
        const data = await r.json();
        setCdnJoin(data.cdnJoin.results);
      })
      .catch(() => {});
  }, [brandId]);

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
              <tr style={{ color: "var(--muted)" }}>
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
                  <td className="py-2" style={{ color: "var(--foreground)" }}>{v.vendor}</td>
                  <td className="py-2" style={{ color: "var(--muted)" }}>{v.crawlerTier}</td>
                  <td className="py-2 text-right tabular-nums" style={{ color: "var(--foreground)" }}>
                    {v.total.toLocaleString()}
                  </td>
                  <td className="py-2 text-right tabular-nums" style={{ color: "var(--success)" }}>
                    {v.retrieval.toLocaleString()}
                  </td>
                  <td className="py-2 text-right tabular-nums" style={{ color: "var(--info)" }}>
                    {v.indexing.toLocaleString()}
                  </td>
                  <td className="py-2 text-right tabular-nums" style={{ color: "var(--muted)" }}>
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
              <tr style={{ color: "var(--muted)" }}>
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
                  <td className="py-2" style={{ color: "var(--foreground)" }}>{r.vendor}</td>
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
                    style={{ color: r.unverifiedRate > 25 ? "var(--danger)" : "var(--muted)" }}
                  >
                    {r.unverifiedRate}%
                    {r.unverifiedRate > 25 && " ⚠"}
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
        <TierGate requiredTier="Growth" locked={cdnLocked}>
          {cdnJoin != null ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: "var(--muted)" }}>
                    <th className="pb-2 text-left font-medium">Vendor</th>
                    <th className="pb-2 text-left font-medium">Shield</th>
                    <th className="pb-2 text-left font-medium">Crawl Activity</th>
                    <th className="pb-2 text-left font-medium">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {cdnJoin.map((row) => {
                    const v = VERDICT_LABELS[row.verdict] ?? { label: row.verdict, color: "var(--muted)" };
                    return (
                      <tr
                        key={row.vendor}
                        className="border-t"
                        style={{ borderColor: "color-mix(in srgb, var(--foreground) 8%, transparent)" }}
                      >
                        <td className="py-2" style={{ color: "var(--foreground)" }}>{row.vendor}</td>
                        <td className="py-2" style={{ color: row.shieldBlocked ? "var(--danger)" : "var(--success)" }}>
                          {row.shieldBlocked ? "Blocked" : "Allowed"}
                        </td>
                        <td className="py-2" style={{ color: row.hasCrawlActivity ? "var(--success)" : "var(--muted)" }}>
                          {row.hasCrawlActivity ? "Active" : "None"}
                        </td>
                        <td className="py-2 font-medium" style={{ color: v.color }}>
                          {v.label}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {cdnJoin.some((r) => r.verdict === "self_blocked") && (
                <p className="mt-2 text-sm" style={{ color: "var(--danger)" }}>
                  ⚠ Self-blocked vendors cannot reach your content. Your site is invisible to these AI engines
                  by your own CDN/firewall configuration.
                </p>
              )}
            </div>
          ) : (
            <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>Loading CDN Shield analysis...</p>
          )}
        </TierGate>
      </section>
    </div>
  );
}

function purposeColor(purpose: string): string {
  switch (purpose) {
    case "retrieval": return "var(--success)";
    case "indexing": return "var(--info)";
    case "training": return "color-mix(in srgb, var(--foreground) 40%, transparent)";
    default: return "var(--muted)";
  }
}
