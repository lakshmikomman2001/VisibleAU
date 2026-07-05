"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { deriveReportStatus } from "@/lib/communication/types";
import type { ReportStatus } from "@/lib/communication/types";

interface ReportDetail {
  id: string;
  headline: string;
  narrativeText: string;
  periodLabel: string | null;
  reportType: string;
  pdfUrl: string | null;
  emailSentAt: string | null;
  keyWins: Array<{ dimension: string; scoreDelta: number; description: string }> | null;
  keyGaps: Array<{ dimension: string; score: number; description: string }> | null;
  fanOutSummary: Record<string, unknown> | null;
  topicalSummary: Record<string, unknown> | null;
  mentionSourceSummary: Record<string, unknown> | null;
  confidenceNotes: Array<{ metric: string; qualityStatus: string; note: string }> | null;
  createdAt: string;
}

function StatusBadge({ status }: { status: ReportStatus }) {
  const config = {
    generating: { bg: "var(--warning-soft)", color: "var(--warning)", label: "Generating..." },
    ready: { bg: "color-mix(in srgb, var(--success) 15%, transparent)", color: "var(--success)", label: "Ready" },
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

export default function ReportDetailPage() {
  const { brandId, reportId } = useParams<{ brandId: string; reportId: string }>();
  const [report, setReport] = useState<ReportDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/brands/${brandId}/reports/${reportId}`)
      .then(async (res) => {
        if (res.ok) setReport(await res.json());
      })
      .finally(() => setLoading(false));
  }, [brandId, reportId]);

  const isGenerating = report != null && !report.pdfUrl;
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isGenerating) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/brands/${brandId}/reports/${reportId}`, { cache: "no-store" });
        if (res.ok) setReport(await res.json());
      } catch { /* transient — keep last known state */ }
    }, 4000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [isGenerating, brandId, reportId]);

  if (loading) {
    return (
      <div className="flex-1 p-8" style={{ background: "var(--bg-base)" }} aria-busy="true">
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="h-8 w-64 rounded anim-shimmer" style={{ backgroundColor: "var(--bg-hover)" }} />
          <div className="h-4 w-48 rounded anim-shimmer" style={{ backgroundColor: "var(--bg-hover)" }} />
          <div className="h-64 rounded-xl anim-shimmer" style={{ backgroundColor: "var(--bg-hover)" }} />
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex-1 p-8 text-center" style={{ background: "var(--bg-base)" }}>
        <p style={{ color: "var(--text-secondary)" }}>Report not found</p>
      </div>
    );
  }

  const status = deriveReportStatus(
    report.pdfUrl,
    report.emailSentAt ? new Date(report.emailSentAt) : null,
  );

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "var(--bg-base)" }} aria-busy={status === "generating"}>
      {/* Sticky PDF action header on mobile */}
      <div
        className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between md:hidden"
        style={{ backgroundColor: "var(--bg-elevated)", borderBottom: "1px solid var(--border-default)" }}
      >
        <span role="status" aria-live="polite"><StatusBadge status={status} /></span>
        {report.pdfUrl ? (
          <a
            href={report.pdfUrl}
            className="text-[13px] font-medium px-3 py-1.5 rounded-md"
            style={{ background: "var(--layer-comm)", color: "#fff" }}
          >
            Download PDF
          </a>
        ) : (
          <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
            Generating PDF...
          </span>
        )}
      </div>

      <div className="max-w-3xl mx-auto" style={{ padding: 32 }}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
              {report.headline}
            </h1>
            <div className="flex items-center gap-3">
              <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                {report.periodLabel} · {new Date(report.createdAt).toLocaleDateString()}
              </span>
              <span role="status" aria-live="polite"><StatusBadge status={status} /></span>
            </div>
          </div>
          <div className="hidden md:block">
            {report.pdfUrl ? (
              <a
                href={report.pdfUrl}
                className="text-[13px] font-medium px-4 py-2 rounded-md"
                style={{ background: "var(--layer-comm)", color: "#fff" }}
              >
                Download PDF
              </a>
            ) : (
              <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                Your report is being generated...
              </span>
            )}
          </div>
        </div>

        {/* Narrative text */}
        <div
          className="rounded-xl p-6 mb-6"
          style={{ backgroundColor: "var(--bg-elevated)", boxShadow: "var(--elevation-rest)" }}
        >
          <p className="text-xs font-medium mb-3" style={{ color: "var(--text-secondary)" }}>
            Narrative
          </p>
          <div className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-primary)" }}>
            {report.narrativeText}
          </div>
        </div>

        {/* Key Wins */}
        {report.keyWins && report.keyWins.length > 0 && (
          <div
            className="rounded-xl p-5 mb-4"
            style={{
              backgroundColor: "var(--bg-elevated)",
              borderLeft: "3px solid var(--success)",
            }}
          >
            <p className="text-xs font-medium mb-2" style={{ color: "var(--success)" }}>
              Key Wins
            </p>
            {report.keyWins.map((w, i) => (
              <div key={i} className="text-[12px] mb-1" style={{ color: "var(--text-primary)" }}>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  +{w.scoreDelta.toFixed(1)}
                </span>{" "}
                {w.description}
              </div>
            ))}
          </div>
        )}

        {/* Key Gaps */}
        {report.keyGaps && report.keyGaps.length > 0 && (
          <div
            className="rounded-xl p-5 mb-4"
            style={{
              backgroundColor: "var(--bg-elevated)",
              borderLeft: "3px solid var(--danger)",
            }}
          >
            <p className="text-xs font-medium mb-2" style={{ color: "var(--danger)" }}>
              Areas to Improve
            </p>
            {report.keyGaps.map((g, i) => (
              <div key={i} className="text-[12px] mb-1" style={{ color: "var(--text-primary)" }}>
                {g.description}
              </div>
            ))}
          </div>
        )}

        {/* Confidence Notes */}
        {report.confidenceNotes && report.confidenceNotes.length > 0 && (
          <div
            className="rounded-xl p-5 mb-4"
            style={{
              backgroundColor: "color-mix(in srgb, var(--warning) 8%, transparent)",
              border: "1px solid color-mix(in srgb, var(--warning) 19%, transparent)",
            }}
          >
            <p className="text-xs font-medium mb-2" style={{ color: "var(--warning)" }}>
              Confidence Notes
            </p>
            {report.confidenceNotes.map((n, i) => (
              <div key={i} className="text-[11px] mb-1" style={{ color: "var(--text-secondary)" }}>
                <strong>{n.metric}</strong> ({n.qualityStatus}): {n.note}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
