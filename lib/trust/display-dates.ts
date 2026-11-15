import { formatInOrgTimezone } from "@/lib/platform/org-timezone";

/**
 * 17 Nov, part 3 -- the dates the trust and discovery pages show beside a figure ("Checked 15 Nov 2026",
 * "Ran 3 Nov 2026"), in the business's own timezone (lib/platform/org-timezone.ts), so a figure always says
 * when it was measured.
 */
export function displayDate(value: string | Date): string {
  return formatInOrgTimezone(new Date(value), undefined, "d MMM yyyy");
}

/** "From audit #50, completed 14 Nov 2026." -- which audit a page's figures come from. */
export function auditSourceLine(audit: {
  auditNumber: number;
  completedAt: string | Date | null;
}): string {
  return audit.completedAt
    ? `From audit #${audit.auditNumber}, completed ${displayDate(audit.completedAt)}.`
    : `From audit #${audit.auditNumber}.`;
}
