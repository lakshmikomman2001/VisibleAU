import { formatInOrgTimezone } from "@/lib/platform/org-timezone";
import { formatVisibilityPercent } from "@/lib/scoring/visibility-display";
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
  /**
   * Engine-failure follow-ups (1 Nov), item 4 (lib/audit/engine-coverage.ts):
   * set only when a whole engine failed -- the subject says "(3 of 4
   * engines)", and the body carries the audit page banner's reason and
   * "What to check". Absent or null: the email is unchanged.
   */
  engineCoverage?: { label: string; note: string; checks: string[] } | null;
}

/** The banner's last "What to check" line (components/domain/audit/engine-failure-banner.tsx). */
const LEFT_OUT_LINE = "Drift alerts and the weekly trend leave this audit out.";

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
  return `Visibility ${formatVisibilityPercent(i.mentionRate)} · mentioned in ${i.mentionedCount} of ${i.sampleCount} answers`;
}

export function auditCompleteEmail(i: AuditCompleteEmailInput): RenderedEmail {
  const headline = visibilityLine(i);
  const coverage = i.engineCoverage ?? null;
  const coverageSuffix = coverage ? ` (${coverage.label})` : "";
  return renderEmail({
    category: "audit_complete",
    subject:
      i.mentionRate == null
        ? `Audit #${i.auditNumber} complete: ${i.brandName} — no answers collected${coverageSuffix}`
        : `Audit #${i.auditNumber} complete: ${i.brandName} — Visibility ${formatVisibilityPercent(i.mentionRate)}${coverageSuffix}`,
    preview: headline,
    heading: `Audit #${i.auditNumber} for ${i.brandName} is complete`,
    blocks: [
      { kind: "headline", text: headline },
      ...(coverage
        ? [
            { kind: "paragraph" as const, text: coverage.note },
            { kind: "paragraph" as const, text: `What to check: ${coverage.checks.join(" ")}` },
            { kind: "note" as const, text: LEFT_OUT_LINE },
          ]
        : []),
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
