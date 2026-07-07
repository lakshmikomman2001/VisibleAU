"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { LayerBadge } from "@/components/phase2/layer-badge";
import { TierGate } from "@/components/phase2/tier-gate";
import { deriveReportStatus } from "@/lib/communication/types";
import type { ReportStatus } from "@/lib/communication/types";
import { shouldPollReports } from "@/lib/communication/should-poll-reports";

interface ReportRow {
  id: string;
  headline: string;
  periodLabel: string | null;
  reportType: string;
  pdfUrl: string | null;
  emailSentAt: string | null;
  createdAt: string;
}

function StatusBadge({ status }: { status: ReportStatus }) {
  const config = {
    generating: { bg: "var(--warning-soft)", color: "var(--warning)", label: "Generating..." },
    ready: { bg: "var(--success-soft, color-mix(in srgb, var(--success) 15%, transparent))", color: "var(--success)", label: "Ready" },
    published: { bg: "color-mix(in srgb, var(--accent-primary) 15%, transparent)", color: "var(--accent-primary)", label: "Published" },
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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const shouldPoll = shouldPollReports(reports, awaitingReport);

  useEffect(() => {
    if (!shouldPoll) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/brands/${brandId}/reports`, { cache: "no-store" });
        if (res.ok) {
          const data: ReportRow[] = await res.json();
          setReports(data);
          if (data.length > reportCountRef.current) {
            reportCountRef.current = data.length;
            setAwaitingReport(false);
          }
        }
      } catch { /* transient — keep last known state */ }
    }, 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [shouldPoll, brandId]);

  useEffect(() => {
    if (!awaitingReport) return;
    const timeout = setTimeout(() => setAwaitingReport(false), 120_000);
    return () => clearTimeout(timeout);
  }, [awaitingReport]);

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
              const status = deriveReportStatus(
                r.pdfUrl,
                r.emailSentAt ? new Date(r.emailSentAt) : null,
              );
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
                    <div className="text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
                      {r.headline}
                    </div>
                    <div className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                      {new Date(r.createdAt).toLocaleDateString()}
                    </div>
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
