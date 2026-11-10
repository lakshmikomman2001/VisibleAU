"use client";

import { PlanLockedCard } from "@/components/domain/pricing/plan-lock";
import { LoadError } from "@/components/shared/load-error";

interface RatioResult {
  vendor: string;
  verifiedCrawls: number;
  referralSessions: number;
  ratio: number | null;
  ratioLabel: string;
  benchmark: number | null;
}

interface Props {
  retrievalHits: number;
  indexingHits: number;
  trainingHits: number;
  totalHits: number;
  verified: number;
  unverified: number;
  spoofed: number;
  ratioData: { results: RatioResult[]; caveat: string } | null;
  ratioLocked: boolean;
  /** The ratio's fetch failed: say so, never "No referral data available yet". */
  ratioFailed?: boolean;
  onRetryRatio?: () => void;
}

export function AgentAnalyticsCrawlerCard({
  retrievalHits,
  indexingHits,
  trainingHits,
  totalHits,
  verified,
  unverified,
  spoofed,
  ratioData,
  ratioLocked,
  ratioFailed = false,
  onRetryRatio = () => {},
}: Props) {
  const hasHighUnverified =
    verified + unverified + spoofed > 0 && unverified / (verified + unverified + spoofed) > 0.25;

  return (
    <div
      className="rounded-lg border p-5"
      style={{
        borderColor: "color-mix(in srgb, var(--layer-retrieval) 30%, transparent)",
        backgroundColor: "color-mix(in srgb, var(--layer-retrieval) 4%, var(--background))",
      }}
    >
      <h2 className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>
        AI Crawler Activity
      </h2>

      {/* Purpose breakdown — COUNT card (AA-P7: no score bar) */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <PurposeCount
          label="Retrieval"
          count={retrievalHits}
          color="var(--success)"
          description="AI recommended you in live conversations"
        />
        <PurposeCount
          label="Indexing"
          count={indexingHits}
          color="var(--info)"
          description="Indexed for AI search results"
        />
        <PurposeCount
          label="Training"
          count={trainingHits}
          color="color-mix(in srgb, var(--foreground) 50%, transparent)"
          description="Used for model training data"
        />
      </div>

      {/* Verification split — all 3 states shown separately (AA-05) */}
      <div className="mt-4">
        <h3 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
          Verification Status
        </h3>
        {/* Task #46 (11th follow-up): getVerificationRates() only counts
            rows with a non-null verification_status, which only ever
            gets set for hits with a non-null source_ip -- today, that's
            log-file uploads only. Real-time visits (app/api/visit) never
            get an IP recorded at all (a separate, unrelated gap), so
            this breakdown silently excludes every one of them -- it is
            NOT the verification status of "AI Crawler Activity" above,
            which counts every ingest source. Say so, instead of letting
            the two counts on one card quietly not add up. */}
        <p className="mt-1 text-xs" style={{ color: "var(--text-secondary)" }}>
          Identified by user agent; IP-verified only for hits from uploaded log files. Real-time
          visits aren&apos;t IP-verified yet.
        </p>
        <div className="mt-2 flex gap-4">
          <VerificationBadge label="Verified" count={verified} color="var(--success)" />
          <VerificationBadge label="Unverified" count={unverified} color="var(--warning)" />
          <VerificationBadge label="Spoofed" count={spoofed} color="var(--danger)" />
        </div>
        {hasHighUnverified && (
          <p className="mt-2 text-sm" style={{ color: "var(--warning)" }}>
            ⚠ Unverified rate exceeds 25% — possible bot impersonation. Review the verification
            details.
          </p>
        )}
      </div>

      {/* Ratio: its locked card on a plan without it (never fetched there) */}
      <div
        className="mt-5 border-t pt-4"
        style={{ borderColor: "color-mix(in srgb, var(--foreground) 10%, transparent)" }}
      >
        {ratioLocked ? (
          <PlanLockedCard feature="crawl_referral_ratio" />
        ) : ratioFailed ? (
          <LoadError what="the crawl-to-referral ratio" onRetry={onRetryRatio} />
        ) : ratioData != null ? (
          <div>
            <h3 className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
              Crawl-to-Referral Ratio
            </h3>
            <div className="mt-2 space-y-1">
              {ratioData.results.slice(0, 4).map((r) => (
                <div key={r.vendor} className="flex items-center justify-between text-sm">
                  <span style={{ color: "var(--foreground)" }}>{r.vendor}</span>
                  <span className="font-mono" style={{ color: "var(--text-secondary)" }}>
                    {r.ratioLabel}
                    {r.benchmark != null && (
                      <span className="ml-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                        (benchmark: {r.benchmark.toLocaleString()}:1)
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
            {/* AA-13: caveat ON the card, not buried */}
            <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
              {ratioData.caveat}
            </p>
          </div>
        ) : (
          <div className="py-2 text-sm" style={{ color: "var(--text-secondary)" }}>
            No referral data available yet. Connect a referral source to see the crawl-to-referral
            ratio.
          </div>
        )}
      </div>
    </div>
  );
}

function PurposeCount({
  label,
  count,
  color,
  description,
}: {
  label: string;
  count: number;
  color: string;
  description: string;
}) {
  return (
    <div
      className="rounded-md border p-3"
      style={{ borderColor: "color-mix(in srgb, var(--foreground) 10%, transparent)" }}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
          {label}
        </span>
      </div>
      <p className="mt-1 text-2xl font-bold tabular-nums" style={{ color: "var(--foreground)" }}>
        {count != null ? count.toLocaleString() : "—"}
      </p>
      <p className="mt-0.5 text-xs" style={{ color: "var(--text-secondary)" }}>
        {description}
      </p>
    </div>
  );
}

function VerificationBadge({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-sm" style={{ color: "var(--foreground)" }}>
        {count != null ? count.toLocaleString() : "—"}
      </span>
      <span className="text-xs" style={{ color: "var(--text-secondary)" }}>
        {label}
      </span>
    </div>
  );
}
