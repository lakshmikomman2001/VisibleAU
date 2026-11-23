"use client";

/**
 * S01 part 9 (contract P08.checks; LLD 8.1.7 D-RT4): "Checks before this report", shown in the report contents panel
 * when the report type is Enhanced. One row per check with its age and whether it will be reused or run again --
 * worked out on the server with the same window logic the refresh step uses (lib/reports/enhanced-checks.ts). Read
 * only: the windows are fixed. "Will run again" in --warning.
 */
export interface ReportCheckRow {
  key: string;
  label: string;
  status: string;
  willRun: boolean;
}

export function ReportChecksList({ rows }: { rows: ReportCheckRow[] }) {
  return (
    <section data-testid="p08-checks" style={{ marginTop: 18 }}>
      <h3
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: ".08em",
          textTransform: "uppercase",
          color: "var(--text-tertiary)",
          margin: "0 0 8px",
        }}
      >
        Checks before this report
      </h3>
      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          border: "1px solid var(--border-default)",
          borderRadius: 8,
        }}
      >
        {rows.map((r, i) => (
          <li
            key={r.key}
            data-testid="p08-check"
            className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
            style={{
              minHeight: 40,
              padding: "10px 16px",
              borderTop: i === 0 ? "none" : "1px solid var(--border-subtle)",
            }}
          >
            <span className="text-[13px]" style={{ color: "var(--text-primary)" }}>
              {r.label}
            </span>
            <span
              className="text-[12px]"
              style={{ color: r.willRun ? "var(--warning)" : "var(--text-secondary)" }}
            >
              {r.status}
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[12px]" style={{ color: "var(--text-tertiary)", margin: "8px 0 0" }}>
        Before an Enhanced report, checks older than their window run again. None of them change the
        Visibility score.
      </p>
    </section>
  );
}
