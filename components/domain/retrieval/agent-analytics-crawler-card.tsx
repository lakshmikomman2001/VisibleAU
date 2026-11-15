"use client";

interface Props {
  retrievalHits: number;
  indexingHits: number;
  trainingHits: number;
  totalHits: number;
  verified: number;
  unverified: number;
  spoofed: number;
}

export function AgentAnalyticsCrawlerCard({
  retrievalHits,
  indexingHits,
  trainingHits,
  totalHits,
  verified,
  unverified,
  spoofed,
}: Props) {
  // 17 Nov, part 3: "unverified" includes every hit from a crawler we have no way to verify ("No verification
  // paths configured", lib/agent-analytics/verify-crawler-hits.ts), so a high unverified share is missing
  // data, not impersonation. Only "spoofed" -- a hit that failed verification -- is evidence of that.

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

      {/* Purpose breakdown — COUNT card (AA-P7: no score bar). 17 Nov, part 3: a visit's purpose is the one
          our crawler list gives that bot (ai_bot_registry default_purpose), not something seen in the visit;
          "Retrieval" said "AI recommended you in live conversations", which a crawler visit can't show. */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <PurposeCount
          label="Retrieval"
          count={retrievalHits}
          color="var(--success)"
          description="Visits by bots that fetch pages for live AI answers"
        />
        <PurposeCount
          label="Indexing"
          count={indexingHits}
          color="var(--info)"
          description="Visits by bots that index pages for AI search"
        />
        <PurposeCount
          label="Training"
          count={trainingHits}
          color="color-mix(in srgb, var(--foreground) 50%, transparent)"
          description="Visits by bots that collect model training data"
        />
      </div>
      <p className="mt-2 text-xs" style={{ color: "var(--text-secondary)" }}>
        Each bot&apos;s purpose comes from our list of AI crawlers, not from the visit itself. A
        visit shows a crawler read the page, not that an AI answer used it.
      </p>

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
          Identified by user agent; IP-verified only for hits from uploaded log files. Visits from
          the tracking snippet can&apos;t be IP-verified.
        </p>
        <div className="mt-2 flex gap-4">
          <VerificationBadge label="Verified" count={verified} color="var(--success)" />
          <VerificationBadge label="Unverified" count={unverified} color="var(--warning)" />
          <VerificationBadge label="Spoofed" count={spoofed} color="var(--danger)" />
        </div>
        {unverified > 0 && (
          <p className="mt-2 text-xs" style={{ color: "var(--text-secondary)" }}>
            Unverified means we couldn&apos;t confirm the visit came from the company named; for
            some crawlers there&apos;s no way to check. It isn&apos;t evidence of impersonation.
          </p>
        )}
        {spoofed > 0 && (
          <p className="mt-2 text-sm" style={{ color: "var(--warning)" }}>
            {spoofed.toLocaleString()} {spoofed === 1 ? "visit" : "visits"} claimed to be an AI
            crawler but failed verification. Review the verification details.
          </p>
        )}
      </div>

      {/* Leftovers task, part 3 (17 Nov): no crawl-to-referral ratio. Nothing measures referrals (ai_referral_hits
          has no writer anyone reaches), so the ratio was sold on the Growth plan and never had a number to show. */}
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
