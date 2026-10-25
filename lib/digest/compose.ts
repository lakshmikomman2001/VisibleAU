import { type DigestBrandRow, weeklyDigestEmail } from "@/lib/email/templates/weekly-digest";

/**
 * The weekly digest's HTML (lib/email/templates/weekly-digest.ts builds
 * the whole email, text version included). Per brand: the headline
 * mention rate -- never a weighted blend, so a percentage, not "/100";
 * null (zero successful organic answers) reads "No successful answers
 * yet", never a fabricated 0%.
 */
export function buildDigestHtml(audits: DigestBrandRow[]): string {
  return weeklyDigestEmail({ date: new Date(), brands: audits }).html;
}
