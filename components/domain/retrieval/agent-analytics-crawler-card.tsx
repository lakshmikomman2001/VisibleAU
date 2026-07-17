"use client";

import { TierGate } from "@/components/phase2/tier-gate";

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
}: Props) {
  const hasHighUnverified = (verified + unverified + spoofed) > 0 &&
    unverified / (verified + unverified + spoofed) > 0.25;

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
        <h3 className="text-sm font-medium" style={{ color: "var(--muted)" }}>
          Verification Status
        </h3>
        <div className="mt-2 flex gap-4">
          <VerificationBadge label="Verified" count={verified} color="var(--success)" />
          <VerificationBadge label="Unverified" count={unverified} color="var(--warning)" />
          <VerificationBadge label="Spoofed" count={spoofed} color="var(--danger)" />
        </div>
        {hasHighUnverified && (
          <p className="mt-2 text-sm" style={{ color: "var(--warning)" }}>
            ⚠ Unverified rate exceeds 25% — possible bot impersonation. Review the verification details.
          </p>
        )}
      </div>

      {/* Ratio — Growth-gated (TierGate overlay) */}
      <div className="mt-5 border-t pt-4" style={{ borderColor: "color-mix(in srgb, var(--foreground) 10%, transparent)" }}>
        <TierGate requiredTier="Growth" locked={ratioLocked}>
          {ratioData != null ? (
            <div>
              <h3 className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
                Crawl-to-Referral Ratio
              </h3>
              <div className="mt-2 space-y-1">
                {ratioData.results.slice(0, 4).map((r) => (
                  <div key={r.vendor} className="flex items-center justify-between text-sm">
                    <span style={{ color: "var(--foreground)" }}>{r.vendor}</span>
                    <span className="font-mono" style={{ color: "var(--muted)" }}>
                      {r.ratioLabel}
                      {r.benchmark != null && (
                        <span className="ml-2 text-xs" style={{ color: "var(--muted)" }}>
                          (benchmark: {r.benchmark.toLocaleString()}:1)
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
              {/* AA-13: caveat ON the card, not buried */}
              <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                {ratioData.caveat}
              </p>
            </div>
          ) : (
            <div className="py-2 text-sm" style={{ color: "var(--muted)" }}>
              No referral data available yet. Connect a referral source to see the crawl-to-referral ratio.
            </div>
          )}
        </TierGate>
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
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-sm font-medium" style={{ color: "var(--foreground)" }}>{label}</span>
      </div>
      <p className="mt-1 text-2xl font-bold tabular-nums" style={{ color: "var(--foreground)" }}>
        {count != null ? count.toLocaleString() : "—"}
      </p>
      <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>{description}</p>
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
      <span className="text-xs" style={{ color: "var(--muted)" }}>{label}</span>
    </div>
  );
}
