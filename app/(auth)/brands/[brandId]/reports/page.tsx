"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ReportBrandingHint } from "@/components/domain/branding/report-branding-hint";
import { RetryPdfButton } from "@/components/domain/communication/retry-pdf-button";
import { usePlanTier } from "@/components/domain/plan-tier-context";
import { useBrandFeatureGate } from "@/components/domain/pricing/brand-feature-gate";
import { PlanGatedLink, PlanLockedPage } from "@/components/domain/pricing/plan-lock";
import { useCan } from "@/components/domain/role-context";
import { LayerBadge } from "@/components/phase2/layer-badge";
import { ActionError, LoadError } from "@/components/shared/load-error";
import { REPORT_MAX_WAIT_MS, REPORT_TAKING_LONGER_MESSAGE } from "@/lib/communication/report-poll";
import { shouldPollReports } from "@/lib/communication/should-poll-reports";
import type { ReportStatus } from "@/lib/communication/types";
import { deriveReportStatus, REPORT_GENERATING_NOTE } from "@/lib/communication/types";
import { refusalMessage } from "@/lib/governance/permissions";
import { useGatedJson } from "@/lib/hooks/use-load";
import { STILL_WORKING_MESSAGE, useSafePoll } from "@/lib/hooks/use-safe-poll";
import { actionFailureMessage } from "@/lib/load/fetch-json";

/** Steady while the poll keeps up; useSafePoll slows it to 10 s when it falls behind. */
const POLL_INTERVAL_MS = 4_000;

interface ReportRow {
  id: string;
  headline: string;
  periodLabel: string | null;
  reportType: string;
  pdfUrl: string | null;
  emailSentAt: string | null;
  createdAt: string;
  /** From the API, worked out from what's stored (failed included). */
  status?: ReportStatus;
  pdfFailureReason?: string | null;
  /** The report has a PDF, but its download link couldn't be made just now. */
  pdfLinkUnavailable?: boolean;
}

function statusOf(r: ReportRow): ReportStatus {
  return r.status ?? deriveReportStatus(r.pdfUrl, r.emailSentAt ? new Date(r.emailSentAt) : null);
}

function StatusBadge({ status }: { status: ReportStatus }) {
  const config = {
    generating: { bg: "var(--warning-soft)", color: "var(--warning)", label: "Generating..." },
    ready: {
      bg: "var(--success-soft, color-mix(in srgb, var(--success) 15%, transparent))",
      color: "var(--success)",
      label: "Ready",
    },
    published: {
      bg: "color-mix(in srgb, var(--accent-primary) 15%, transparent)",
      color: "var(--accent-primary)",
      label: "Published",
    },
    failed: { bg: "var(--danger-soft)", color: "var(--danger)", label: "Failed" },
  }[status];

  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
      style={{ backgroundColor: config.bg, color: config.color }}
    >
      {config.label}
    </span>
  );
}

export default function ReportsListPage() {
  const { brandId } = useParams<{ brandId: string }>();
  const router = useRouter();
  const planTier = usePlanTier();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const { locked, planRefused } = useBrandFeatureGate("reports");

  // Follow-ups from af8de42..d1eb5a1, part 1: a failed first fetch said "No reports yet", and a refused
  // Generate report said nothing. Each says so now. The polls below keep their last answer on a miss.
  const loaded = useGatedJson<ReportRow[]>(`/api/brands/${brandId}/reports`, planRefused, {
    enabled: !locked,
  });
  const loading = loaded.status === "loading";
  useEffect(() => {
    if (loaded.data) setReports(loaded.data);
  }, [loaded.data]);

  const [awaitingReport, setAwaitingReport] = useState(false);
  const reportCountRef = useRef(reports.length);
  const shouldPoll = shouldPollReports(reports, awaitingReport);

  const poll = useCallback(
    async (signal: AbortSignal): Promise<ReportRow[] | null> => {
      try {
        const res = await fetch(`/api/brands/${brandId}/reports`, { cache: "no-store", signal });
        if (await planRefused(res)) return null;
        if (!res.ok) return null;
        const data: ReportRow[] = await res.json();
        if (!Array.isArray(data)) return null;
        setReports(data);
        if (data.length > reportCountRef.current) {
          reportCountRef.current = data.length;
          setAwaitingReport(false);
        }
        return data;
      } catch {
        /* transient — keep last known state */
        return null;
      }
    },
    [brandId, planRefused],
  );

  // URGENT audit #38 follow-up (1 Nov): this polled on a fixed 4 s
  // setInterval with no time limit while any report was generating, and
  // a slow endpoint stacked up requests. Now one request at a time (a
  // slow one waited for up to 30 s, and the page says so), and it stops
  // after REPORT_MAX_WAIT_MS. "Generate report" starts the wait again.
  const {
    behind,
    timedOut,
    restart: restartPolling,
  } = useSafePoll({
    enabled: shouldPoll,
    poll,
    firstDelayMs: POLL_INTERVAL_MS,
    intervalMs: POLL_INTERVAL_MS,
    maxWaitMs: REPORT_MAX_WAIT_MS,
  });
  const pollNote = timedOut ? REPORT_TAKING_LONGER_MESSAGE : behind ? STILL_WORKING_MESSAGE : null;

  useEffect(() => {
    if (!awaitingReport) return;
    const timeout = setTimeout(() => setAwaitingReport(false), 120_000);
    return () => clearTimeout(timeout);
  }, [awaitingReport]);

  const retrying = (reportId: string) => {
    setReports((prev) =>
      prev.map((r) =>
        r.id === reportId ? { ...r, status: "generating", pdfFailureReason: null } : r,
      ),
    );
    restartPolling();
  };

  // Team follow-ups, item 10: a viewer can't generate reports (the route answers 403); the button says why.
  const canGenerate = useCan("generate_reports");

  const handleGenerate = async () => {
    setGenerating(true);
    setGenerateError(null);
    try {
      const res = await fetch(`/api/brands/${brandId}/reports/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodType: "weekly" }),
      });
      if (await planRefused(res)) return;
      if (!res.ok) {
        setGenerateError(await actionFailureMessage(res, "The report couldn't be started."));
        return;
      }
      reportCountRef.current = reports.length;
      setAwaitingReport(true);
      restartPolling();
    } catch {
      setGenerateError("The report couldn't be started. Check your connection and try again.");
    } finally {
      setGenerating(false);
    }
  };

  if (locked) return <PlanLockedPage title="Reports" feature="reports" />;

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "var(--bg-base)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 32 }}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
                Reports
              </h1>
              <LayerBadge layer="communication" />
            </div>
            {loaded.status === "ready" && (
              <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                {reports.length} report{reports.length !== 1 ? "s" : ""} generated
              </p>
            )}
            <ActionError message={generateError} />
            {pollNote && (
              <p
                className="text-[12px] mt-1"
                style={{ color: "var(--text-secondary)" }}
                role="status"
                data-poll-note
              >
                {pollNote}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <PlanGatedLink
              feature="white_label_reports"
              tier={planTier}
              className="text-[13px] underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2"
              style={{ color: "var(--accent-blue)" }}
            >
              Customise report branding
            </PlanGatedLink>
            {canGenerate ? (
              <button
                type="button"
                className="h-9 px-4 text-[13px] font-medium rounded-md flex items-center gap-2"
                style={{
                  background: "var(--layer-communication)",
                  color: "var(--layer-communication-fg)",
                }}
                onClick={handleGenerate}
                disabled={generating}
              >
                {generating ? "Generating..." : "Generate report"}
              </button>
            ) : (
              <span title={refusalMessage("generate_reports")} data-role-locked="generate_reports">
                <button
                  type="button"
                  className="h-9 px-4 text-[13px] font-medium rounded-md flex items-center gap-2"
                  style={{
                    background: "var(--layer-communication)",
                    color: "var(--layer-communication-fg)",
                    opacity: 0.5,
                    cursor: "not-allowed",
                  }}
                  disabled
                  aria-describedby="generate-report-locked"
                >
                  Generate report
                </button>
                <span id="generate-report-locked" className="sr-only">
                  {refusalMessage("generate_reports")}
                </span>
              </span>
            )}
          </div>
        </div>

        <ReportBrandingHint brandId={brandId} />

        {loaded.status === "error" ? (
          <LoadError what="your reports" detail={loaded.detail} onRetry={loaded.retry} />
        ) : loading ? (
          <div className="space-y-3" aria-busy="true">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 rounded-xl anim-shimmer"
                style={{ backgroundColor: "var(--bg-hover)" }}
              />
            ))}
          </div>
        ) : reports.length === 0 ? (
          <div
            className="rounded-xl p-12 text-center"
            style={{ backgroundColor: "var(--bg-elevated)", boxShadow: "var(--elevation-rest)" }}
          >
            <p className="text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
              No reports yet
            </p>
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              Generate your first AI Visibility report
            </p>
          </div>
        ) : (
          // On a phone the table scrolls sideways inside its card (the rows keep
          // a 560px minimum) instead of clipping its last columns.
          <div
            className="rounded-xl"
            style={{ border: "1px solid var(--border-default)", overflowX: "auto" }}
          >
            <div
              className="grid px-5 py-3 text-[10px] font-semibold uppercase tracking-wider border-b"
              style={{
                gridTemplateColumns: "2fr 100px 120px 120px",
                minWidth: 560,
                borderColor: "var(--border-subtle)",
                background: "var(--bg-elevated)",
                color: "var(--text-tertiary)",
              }}
            >
              <div>Report</div>
              <div>Period</div>
              <div>Status</div>
              <div>Actions</div>
            </div>
            {reports.map((r) => {
              const status = statusOf(r);
              return (
                // The headline is the row's button (Enter and Space open the
                // report); its ::after covers the row, so a click anywhere on
                // it opens the report too. The actions cell sits above that.
                <div
                  key={r.id}
                  className="relative grid px-5 py-3.5 items-center border-b last:border-b-0"
                  style={{
                    gridTemplateColumns: "2fr 100px 120px 120px",
                    minWidth: 560,
                    borderColor: "var(--border-subtle)",
                    background: "var(--bg-elevated)",
                  }}
                  aria-busy={status === "generating"}
                >
                  <div>
                    <button
                      type="button"
                      onClick={() => router.push(`/brands/${brandId}/reports/${r.id}`)}
                      className="block text-left text-[13px] font-medium cursor-pointer after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-[var(--accent-blue)]"
                      style={{
                        color: "var(--text-primary)",
                        background: "none",
                        border: "none",
                        padding: 0,
                      }}
                    >
                      {r.headline}
                    </button>
                    <div className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                      {new Date(r.createdAt).toLocaleDateString()}
                    </div>
                    {status === "failed" && (
                      <div
                        className="text-[11px] mt-0.5"
                        style={{ color: "var(--danger)" }}
                        data-pdf-failed
                      >
                        PDF couldn't be created.
                      </div>
                    )}
                    {/* 14 Nov, part 6: how long it should take; the page checks again on its own. */}
                    {status === "generating" && (
                      <div
                        className="text-[11px] mt-0.5"
                        style={{ color: "var(--text-tertiary)" }}
                        data-pdf-generating-note
                      >
                        {REPORT_GENERATING_NOTE}
                      </div>
                    )}
                  </div>
                  <div
                    className="text-[12px]"
                    style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}
                  >
                    {r.periodLabel}
                  </div>
                  <div role="status" aria-live="polite">
                    <StatusBadge status={status} />
                  </div>
                  {/* Its controls sit above the headline's row-wide ::after. */}
                  <div>
                    {status === "failed" ? (
                      <span className="relative z-[1]">
                        <RetryPdfButton
                          brandId={brandId}
                          reportId={r.id}
                          onRetrying={() => retrying(r.id)}
                        />
                      </span>
                    ) : !r.pdfUrl && r.pdfLinkUnavailable ? (
                      <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                        Unavailable right now
                      </span>
                    ) : (
                      <a
                        href={r.pdfUrl ?? "#"}
                        className="relative z-[1] text-[12px] font-medium"
                        style={{
                          color: r.pdfUrl ? "var(--accent-primary)" : "var(--text-tertiary)",
                          pointerEvents: r.pdfUrl ? "auto" : "none",
                        }}
                        aria-label={`Download ${r.headline}`}
                      >
                        {r.pdfUrl ? "Download PDF" : "Pending..."}
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
