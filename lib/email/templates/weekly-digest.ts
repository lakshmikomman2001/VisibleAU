import { formatInOrgTimezone } from "@/lib/platform/org-timezone";
import { formatVisibilityPercent } from "@/lib/scoring/visibility-display";
import { type RenderedEmail, renderEmail } from "./layout";

export interface DigestBrandRow {
  brandName: string;
  /** null = no successful answers: shown as such, never as 0%. */
  mentionRate: number | string | null;
  mentionedCount?: number;
  sampleCount?: number;
}

function cell(row: DigestBrandRow): string {
  const rate = row.mentionRate == null ? Number.NaN : Number(row.mentionRate);
  if (Number.isNaN(rate)) return "No successful answers yet";
  const counts =
    row.mentionedCount != null && row.sampleCount != null
      ? ` · ${row.mentionedCount} of ${row.sampleCount} answers`
      : "";
  return `${formatVisibilityPercent(rate)}${counts}`;
}

/** The weekly digest: each brand audited in the last 7 days, with its
 * Visibility (the audit page's headline). */
export function weeklyDigestEmail(i: {
  date: Date;
  organizationId?: string;
  brands: DigestBrandRow[];
}): RenderedEmail {
  const day = formatInOrgTimezone(i.date, i.organizationId, "d MMM yyyy");
  return renderEmail({
    category: "weekly_digest",
    subject: `Vunnara weekly digest — ${day}`,
    preview: `Visibility for ${i.brands.length} brand${i.brands.length === 1 ? "" : "s"} audited this week`,
    heading: `Your weekly digest, ${day}`,
    blocks:
      i.brands.length === 0
        ? [{ kind: "paragraph", text: "No brands were audited in the last 7 days." }]
        : [
            {
              kind: "paragraph",
              text: "Visibility is how often AI answers to everyday customer questions mention each brand.",
            },
            {
              kind: "table",
              columns: ["Brand", "Visibility"],
              rows: i.brands.map((b) => [b.brandName, cell(b)]),
            },
          ],
  });
}
