import Link from "next/link";
import type { ReportFailure } from "@/lib/admin/report-failures";
import { REPORT_PDF_STALLED_MINUTES } from "@/lib/communication/types";
import { ADMIN_PAGE_TITLES } from "@/lib/navigation/breadcrumbs";

/**
 * 14 Nov, part 6 -- /admin/reports: the reports whose PDF wasn't made, with why (lib/admin/report-failures.ts).
 * The customer's page says "PDF couldn't be created" with a plain reason and Try again; this says what failed.
 */
const muted = { color: "var(--text-secondary)" } as const;
const strong = { color: "var(--text-primary)" } as const;
const card = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-default)",
  borderRadius: 8,
  padding: 16,
} as const;

function sydney(iso: string): string {
  return new Date(iso)
    .toLocaleString("en-AU", {
      timeZone: "Australia/Sydney",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    .replace(",", "");
}

export function ReportFailuresAdmin({ failures }: { failures: ReportFailure[] }) {
  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "var(--bg-base)" }}>
      <div
        style={{ maxWidth: 1080, margin: "0 auto", padding: "32px clamp(16px, 4vw, 32px)" }}
        className="space-y-4"
        data-admin-report-failures=""
      >
        <div>
          <h1 className="text-xl font-semibold" style={strong}>
            {ADMIN_PAGE_TITLES.reports}
          </h1>
          <p className="text-[13px] mt-1" style={muted}>
            Reports whose PDF wasn&apos;t made, newest first, in every workspace: what failed, and
            the failure&apos;s own message (keys and links removed). A report with no failure
            recorded is listed once it has been generating for {REPORT_PDF_STALLED_MINUTES} minutes;
            its customer then sees Failed, with Try again. Operators only.{" "}
            <Link href="/admin/settings">Settings →</Link>
          </p>
        </div>
        <section style={card} data-admin-report-failure-list="">
          {failures.length === 0 ? (
            <p className="text-[13px]" style={muted}>
              No report&apos;s PDF has failed.
            </p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table className="text-[13px] w-full" style={muted}>
                <thead>
                  <tr style={strong}>
                    <th className="text-left pr-3 pb-2">Last change (Sydney time)</th>
                    <th className="text-left pr-3 pb-2">Brand · workspace</th>
                    <th className="text-left pr-3 pb-2">Report</th>
                    <th className="text-left pb-2">What failed</th>
                  </tr>
                </thead>
                <tbody>
                  {failures.map((f) => (
                    <tr
                      key={f.id}
                      className="align-top"
                      style={{ borderTop: "1px solid var(--border-default)" }}
                      data-admin-report-failure={f.id}
                    >
                      <td className="pr-3 py-2 whitespace-nowrap">
                        <time dateTime={f.updatedAt}>{sydney(f.updatedAt)}</time>
                      </td>
                      <td className="pr-3 py-2">
                        <span style={strong}>{f.brandName}</span> · {f.workspaceName}
                      </td>
                      <td className="pr-3 py-2">
                        {f.reportType}
                        {f.periodLabel ? ` · ${f.periodLabel}` : ""}
                      </td>
                      <td className="py-2">
                        <div style={strong} data-admin-report-failure-line="">
                          {f.line}
                        </div>
                        {f.detail ? (
                          <div
                            className="text-[12px] mt-0.5"
                            style={{ ...muted, overflowWrap: "anywhere" }}
                            data-admin-report-failure-detail=""
                          >
                            {f.detail}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
