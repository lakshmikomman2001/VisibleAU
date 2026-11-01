"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { RetryPdfButton } from "@/components/domain/communication/retry-pdf-button";
import { LayerBadge } from "@/components/phase2/layer-badge";
import { TierGate } from "@/components/phase2/tier-gate";
import { REPORT_MAX_WAIT_MS, REPORT_TAKING_LONGER_MESSAGE } from "@/lib/communication/report-poll";
import { shouldPollReports } from "@/lib/communication/should-poll-reports";
import type { ReportStatus } from "@/lib/communication/types";
import { deriveReportStatus } from "@/lib/communication/types";
import { STILL_WORKING_MESSAGE, useSafePoll } from "@/lib/hooks/use-safe-poll";

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
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tierLocked, setTierLocked] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetch(`/api/brands/${brandId}/reports`)
      .then(async (res) => {
        if (res.status === 403) {
          setTierLocked(true);
          return;
        }
        if (res.ok) setReports(await res.json());
      })
      .finally(() => setLoading(false));
  }, [brandId]);

  const [awaitingReport, setAwaitingReport] = useState(false);
  const reportCountRef = useRef(reports.length);
  const shouldPoll = shouldPollReports(reports, awaitingReport);

  const poll = useCallback(
    async (signal: AbortSignal): Promise<ReportRow[] | null> => {
      try {
        const res = await fetch(`/api/brands/${brandId}/reports`, { cache: "no-store", signal });
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
    [brandId],
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

  const handleGenerate = async () => {
    setGenerating(true);
    const res = await fetch(`/api/brands/${brandId}/reports/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ periodType: "weekly" }),
    });
    setGenerating(false);
    if (res.ok) {
      reportCountRef.current = reports.length;
      setAwaitingReport(true);
      restartPolling();
    }
  };

  if (tierLocked) {
    return (
      <TierGate requiredTier="Growth" locked>
        <div
          className="rounded-lg p-8 text-center"
          style={{ backgroundColor: "var(--bg-elevated)" }}
        >
          <p style={{ color: "var(--text-secondary)" }}>
            Reports are available on Growth tier and above
          </p>
        </div>
      </TierGate>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "var(--bg-base)" }}>
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: 32 }}>
        <div className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
                Reports
              </h1>
              <LayerBadge layer="communication" />
            </div>
            <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
              {reports.length} report{reports.length !== 1 ? "s" : ""} generated
            </p>
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
          <button
            className="h-9 px-4 text-[13px] font-medium rounded-md flex items-center gap-2"
            style={{ background: "var(--layer-comm)", color: "#fff" }}
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? "Generating..." : "Generate report"}
          </button>
        </div>

        {loading ? (
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
          <div
            className="rounded-xl overflow-hidden"
            style={{ border: "1px solid var(--border-default)" }}
          >
            <div
              className="grid px-5 py-3 text-[10px] font-semibold uppercase tracking-wider border-b"
              style={{
                gridTemplateColumns: "2fr 100px 120px 120px",
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
                <div
                  key={r.id}
                  className="grid px-5 py-3.5 items-center border-b last:border-b-0 cursor-pointer"
                  style={{
                    gridTemplateColumns: "2fr 100px 120px 120px",
                    borderColor: "var(--border-subtle)",
                    background: "var(--bg-elevated)",
                  }}
                  onClick={() => router.push(`/brands/${brandId}/reports/${r.id}`)}
                  role="button"
                  tabIndex={0}
                  aria-busy={status === "generating"}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") router.push(`/brands/${brandId}/reports/${r.id}`);
                  }}
                >
                  <div>
                    <div
                      className="text-[13px] font-medium"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {r.headline}
                    </div>
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
                  <div>
                    {status === "failed" ? (
                      <RetryPdfButton
                        brandId={brandId}
                        reportId={r.id}
                        onRetrying={() => retrying(r.id)}
                      />
                    ) : !r.pdfUrl && r.pdfLinkUnavailable ? (
                      <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                        Unavailable right now
                      </span>
                    ) : (
                      <a
                        href={r.pdfUrl ?? "#"}
                        className="text-[12px] font-medium"
                        style={{
                          color: r.pdfUrl ? "var(--accent-primary)" : "var(--text-tertiary)",
                          pointerEvents: r.pdfUrl ? "auto" : "none",
                        }}
                        onClick={(e) => e.stopPropagation()}
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
