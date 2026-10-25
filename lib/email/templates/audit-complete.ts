import { formatInOrgTimezone } from "@/lib/platform/org-timezone";
import { type RenderedEmail, renderEmail } from "./layout";

export interface AuditCompleteEmailInput {
  brandName: string;
  auditNumber: number;
  /** The headline (Frequency mention rate, 0-100), or null when no answer
   * came back successfully -- never a made-up 0. */
  mentionRate: number | null;
  mentionedCount: number;
  sampleCount: number;
  /** null: the line is left out rather than guessed. */
  completedAt: Date | null;
  organizationId?: string;
  auditUrl: string;
}

/** "25 Oct 2026, 3:42 PM (Sydney time)" -- the org's time zone. */
export function orgDateTime(date: Date, organizationId?: string): string {
  return `${formatInOrgTimezone(date, organizationId, "d MMM yyyy, h:mm a")} (Sydney time)`;
}

/** The audit page's own headline, word for word: "Visibility 8% ·
 * mentioned in 3 of 40 answers" (the percentage rounded the same way). */
export function visibilityLine(i: {
  mentionRate: number | null;
  mentionedCount: number;
  sampleCount: number;
}): string {
  if (i.mentionRate == null) return "Visibility — · no successful answers were collected";
  return `Visibility ${i.mentionRate.toFixed(0)}% · mentioned in ${i.mentionedCount} of ${i.sampleCount} answers`;
}

export function auditCompleteEmail(i: AuditCompleteEmailInput): RenderedEmail {
  const headline = visibilityLine(i);
  return renderEmail({
    category: "audit_complete",
    subject:
      i.mentionRate == null
        ? `Audit #${i.auditNumber} complete: ${i.brandName} — no answers collected`
        : `Audit #${i.auditNumber} complete: ${i.brandName} — Visibility ${i.mentionRate.toFixed(0)}%`,
    preview: headline,
    heading: `Audit #${i.auditNumber} for ${i.brandName} is complete`,
    blocks: [
      { kind: "headline", text: headline },
      ...(i.completedAt
        ? [
            {
              kind: "paragraph" as const,
              text: `Finished ${orgDateTime(i.completedAt, i.organizationId)}.`,
            },
          ]
        : []),
      { kind: "button", label: "View the audit", url: i.auditUrl },
    ],
  });
}
