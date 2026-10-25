import { visibilityLine } from "./audit-complete";
import { type RenderedEmail, renderEmail } from "./layout";

export interface ScheduledReportEmailInput {
  brandName: string;
  frequency: "weekly" | "monthly";
  periodLabel: string | null;
  /** The headline of the audit this report was built from, or null when
   * the report isn't tied to one -- then no number is shown at all. */
  audit: {
    auditNumber: number;
    mentionRate: number | null;
    mentionedCount: number;
    sampleCount: number;
  } | null;
  reportUrl: string;
  /** A signed download link, or null when the PDF isn't available. */
  pdfUrl: string | null;
  pdfLinkDays: number;
  schedulesUrl: string;
}

/**
 * The scheduled report. Only real numbers: the headline of the audit the
 * report was built from. (It used to show a hard-coded 0.0 score, a
 * "+0.0 pts" change and a 0-100 "top gap" score.)
 */
export function scheduledReportEmail(i: ScheduledReportEmailInput): RenderedEmail {
  const period = i.periodLabel ? ` — ${i.periodLabel}` : "";
  const subject =
    i.frequency === "monthly"
      ? `${i.brandName} AI visibility report${period}`
      : `${i.brandName} AI visibility update${i.periodLabel ? ` — week of ${i.periodLabel}` : ""}`;
  const headline = i.audit ? visibilityLine(i.audit) : null;
  return renderEmail({
    category: "scheduled_report",
    subject,
    preview: headline ?? `Your ${i.frequency} report for ${i.brandName}`,
    heading: `${i.frequency === "monthly" ? "Monthly" : "Weekly"} report: ${i.brandName}`,
    blocks: [
      ...(i.audit && headline
        ? [
            { kind: "headline" as const, text: headline },
            { kind: "paragraph" as const, text: `From audit #${i.audit.auditNumber}.` },
          ]
        : []),
      ...(i.pdfUrl
        ? [
            { kind: "button" as const, label: "Download the PDF report", url: i.pdfUrl },
            {
              kind: "note" as const,
              text: `The download link works for ${i.pdfLinkDays} days.`,
            },
          ]
        : []),
      { kind: "link", label: "Open the report in Vunnara", url: i.reportUrl },
      {
        kind: "note",
        text: "This report comes from a delivery schedule. To stop it, switch the schedule off:",
      },
      { kind: "link", label: "Report delivery schedules", url: i.schedulesUrl },
    ],
    // Its recipients are whoever the schedule lists, not necessarily members.
    reason: "You're getting this because you're on this report's delivery list.",
  });
}
