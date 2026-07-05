"use client";

import { deriveReportStatus } from "@/lib/communication/types";
import { ReportStatusBadge } from "./report-status-badge";

interface Report {
  id: string;
  headline: string;
  periodLabel: string;
  createdAt: string | Date;
  pdfUrl: string | null;
  emailSentAt: string | Date | null;
  reportType: string;
}

interface ReportCardProps {
  report: Report;
}

function formatDate(d: string | Date): string {
  return new Date(d).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ReportCard({ report }: ReportCardProps) {
  const status = deriveReportStatus(
    report.pdfUrl,
    report.emailSentAt ? new Date(report.emailSentAt) : null,
  );

  return (
    <div
      className="rounded-xl p-4 transition-shadow"
      style={{
        backgroundColor: "var(--bg-elevated)",
        border: "1px solid var(--border-default)",
        boxShadow: "var(--elevation-rest)",
      }}
    >
      <div className="flex items-start gap-3">
        {/* Icon placeholder */}
        <div
          className="flex-shrink-0 flex items-center justify-center rounded-lg"
          style={{
            width: 40,
            height: 40,
            backgroundColor: "var(--layer-comm-soft)",
          }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: "var(--layer-comm)" }}
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
          </svg>
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-sm font-semibold truncate"
              style={{ color: "var(--text-primary)" }}
            >
              {report.headline}
            </span>
            <ReportStatusBadge status={status} />
          </div>

          <div
            className="flex items-center gap-2 text-xs"
            style={{ color: "var(--text-tertiary)" }}
          >
            <span>{report.periodLabel}</span>
            <span aria-hidden="true">&middot;</span>
            <span>{formatDate(report.createdAt)}</span>
          </div>
        </div>

        {/* Download */}
        <button
          type="button"
          disabled={!report.pdfUrl}
          onClick={() => {
            if (report.pdfUrl) window.open(report.pdfUrl, "_blank");
          }}
          className="flex-shrink-0 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
          style={{
            border: "1px solid var(--border-default)",
            backgroundColor: report.pdfUrl ? "var(--bg-base)" : "var(--bg-subtle)",
            color: report.pdfUrl ? "var(--text-primary)" : "var(--text-tertiary)",
            cursor: report.pdfUrl ? "pointer" : "not-allowed",
            opacity: report.pdfUrl ? 1 : 0.5,
          }}
        >
          Download
        </button>
      </div>
    </div>
  );
}
