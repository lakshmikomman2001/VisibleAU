"use client";

import { useEffect, useState } from "react";
import { shownHeadlineBand } from "@/lib/scoring/headline-color";

/**
 * S01 part 12 (contract P13; LLD 8.1.6, 8.1.7): the client portal's Reports card -- the generated reports with a PDF
 * for the portal's brand, newest first, each with its report type's name (the agency's own names when set), period,
 * the audit it's based on, the Visibility it printed (coloured by band, D-BAND) and when it was made. Each "Download PDF"
 * is a short-lived signed link made when the page loaded (never a public bucket); once it has expired the row says so
 * and "Try again" loads fresh links.
 */
export interface PortalReport {
  id: string;
  tierName: string;
  periodLabel: string | null;
  basisAuditNumber: number | null;
  visibilityPct: number | null;
  generated: string;
  downloadUrl: string | null;
}

/** The row's report type name (P13's Report pill). */
function reportTypeOf(r: PortalReport): string {
  return r.tierName;
}

function bandColour(pct: number): string {
  const band = shownHeadlineBand(pct);
  return band === "strong"
    ? "var(--success)"
    : band === "developing"
      ? "var(--warning)"
      : "var(--danger)";
}

export function PortalReports({
  reports,
  linkSeconds,
}: {
  reports: PortalReport[];
  linkSeconds: number;
}) {
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setExpired(true), linkSeconds * 1000);
    return () => clearTimeout(t);
  }, [linkSeconds]);
  const cell = { padding: "10px 16px", whiteSpace: "nowrap" as const };
  return (
    <section
      data-testid="p13-reports"
      className="rounded-lg border bg-card"
      aria-labelledby="p13-reports-title"
    >
      <div style={{ padding: "20px 24px 12px" }}>
        <h2 id="p13-reports-title" className="text-lg font-semibold">
          Reports
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          AI visibility reports prepared for you.
        </p>
      </div>
      {reports.length === 0 ? (
        <p
          data-testid="p13-empty"
          className="text-sm text-muted-foreground"
          style={{ padding: "0 24px 20px" }}
        >
          No reports yet. Your agency will share them here.
        </p>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            data-testid="p13-table"
            className="w-full text-sm"
            style={{ borderCollapse: "collapse" }}
          >
            <thead>
              <tr className="text-xs text-muted-foreground" style={{ textAlign: "left" }}>
                <th className="font-medium" style={cell}>
                  Report
                </th>
                <th className="font-medium" style={{ ...cell, position: "sticky", left: 0 }}>
                  Period
                </th>
                <th className="font-medium" style={cell}>
                  Based on
                </th>
                <th className="font-medium" style={cell}>
                  Visibility
                </th>
                <th className="font-medium" style={cell}>
                  Generated
                </th>
                <th className="font-medium" style={cell}>
                  <span className="sr-only">Download PDF</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr
                  key={r.id}
                  data-testid="p13-row"
                  style={{ borderTop: "1px solid var(--border-subtle)" }}
                >
                  <td style={cell}>
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                      style={{
                        background: "var(--bg-subtle)",
                        border: "1px solid var(--border-default)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {reportTypeOf(r)}
                    </span>
                  </td>
                  <td style={{ ...cell, position: "sticky", left: 0, background: "inherit" }}>
                    {r.periodLabel ?? "—"}
                  </td>
                  <td style={cell}>
                    {r.basisAuditNumber !== null ? `Audit #${r.basisAuditNumber}` : "—"}
                  </td>
                  <td
                    style={{
                      ...cell,
                      fontWeight: 600,
                      color: r.visibilityPct !== null ? bandColour(r.visibilityPct) : undefined,
                    }}
                  >
                    {r.visibilityPct !== null ? `${r.visibilityPct}%` : "—"}
                  </td>
                  <td style={cell}>{r.generated}</td>
                  <td style={cell}>
                    {expired ? (
                      <span className="text-xs">
                        This download link has expired.{" "}
                        <button
                          type="button"
                          className="underline"
                          style={{ color: "var(--accent-blue)" }}
                          onClick={() => window.location.reload()}
                        >
                          Try again
                        </button>
                      </span>
                    ) : r.downloadUrl ? (
                      <a
                        href={r.downloadUrl}
                        className="text-xs font-medium underline"
                        aria-label={`Download PDF for ${r.periodLabel ?? r.generated}`}
                      >
                        Download PDF
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">Unavailable right now</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
