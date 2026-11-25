import { reportPeriodDisplay } from "@/lib/reports/report-period";

/**
 * S01C part 5a (LLD amendment 64): a report PDF's file name, wherever it leaves the app (the reports page's
 * download, the client portal's, the scheduled-report email's link): "{Brand} – AI Visibility Report ({Tier name}) –
 * Week {w} {yyyy}.pdf", without the tier for a report made with report_v2 off (no contents snapshot, so no tier
 * name). The real Basic report downloaded as "5573cd17-….pdf", its storage path.
 */
export function reportFileName(input: {
  brandName: string;
  /** The report's own tier name (its snapshot's, which a later rename never changes); null with report_v2 off. */
  tierName: string | null;
  /** "2026-W47" (or "2026-11" for a monthly report); null leaves the period out of the name. */
  periodLabel: string | null;
}): string {
  const label = input.periodLabel?.trim() ?? "";
  const week = /^(\d{4})-W(\d{2})$/.exec(label);
  const period = week
    ? ` – Week ${Number(week[2])} ${week[1]}`
    : label
      ? ` – ${reportPeriodDisplay(label).title.replace(/,/g, "")}`
      : "";
  const tier = input.tierName?.trim() ? ` (${input.tierName.trim()})` : "";
  const brand = input.brandName
    .trim()
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ");
  return `${brand} – AI Visibility Report${tier}${period}.pdf`;
}

/** The name in plain ASCII, for clients that don't read filename*: hyphens for dashes, no accents, no quotes. */
export function asciiFileName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/["\\]/g, "")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** RFC 8187's ext-value: percent-encoded UTF-8, with the characters encodeURIComponent leaves alone that it doesn't. */
function extValue(name: string): string {
  return encodeURIComponent(name).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/**
 * `attachment; filename="Waratah Home Services - AI Visibility Report (Enhanced) - Week 47 2026.pdf";
 * filename*=UTF-8''Waratah%20Home%20Services%20%E2%80%93%20…` (RFC 6266): the ASCII name first, the real one for
 * every browser that reads filename*.
 */
export function reportContentDisposition(name: string): string {
  return `attachment; filename="${asciiFileName(name)}"; filename*=UTF-8''${extValue(name)}`;
}
