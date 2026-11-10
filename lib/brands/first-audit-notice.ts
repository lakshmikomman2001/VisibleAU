/**
 * Before the next push (11 Nov), part 3 -- when the new-brand wizard creates the brand but its first audit
 * doesn't start, it lands on the brand page with the reason, not silently on /brands (Sri, 11 Nov). The reason
 * is the API's own words (lib/load/fetch-json.ts apiMessage), carried in sessionStorage under the brand's id and
 * read once; the URL carries only the flag, so a link can't put words of its own on the page. Without a reason
 * (none given, or no sessionStorage) the brand page still says the audit didn't start.
 */

/** The query flag on the brand page's URL. */
export const FIRST_AUDIT_FAILED_PARAM = "firstAudit";
export const FIRST_AUDIT_FAILED_VALUE = "failed";

const storageKey = (brandId: string) => `first-audit-failed-${brandId}`;

/** Where the wizard goes when the brand exists but its first audit didn't start. */
export function brandPageAfterFailedFirstAudit(brandId: string): string {
  return `/brands/${brandId}?${FIRST_AUDIT_FAILED_PARAM}=${FIRST_AUDIT_FAILED_VALUE}`;
}

/** The brand page's line: "Your brand was created, but the first audit couldn't start: <reason>. Run audit to try again." */
export function firstAuditFailedSentence(reason: string | null): string {
  const why = reason?.trim().replace(/[.!\s]+$/, "");
  return why
    ? `Your brand was created, but the first audit couldn't start: ${why}. Run audit to try again.`
    : "Your brand was created, but the first audit couldn't start. Run audit to try again.";
}

/** The wizard keeps the reason for the brand page (a no-op where sessionStorage isn't available). */
export function rememberFirstAuditFailure(brandId: string, reason: string | null): void {
  try {
    if (reason) sessionStorage.setItem(storageKey(brandId), reason);
  } catch {
    // Private mode or a restricted context: the brand page says the audit didn't start, without the reason.
  }
}

/** The brand page reads the reason once; it's gone after. */
export function takeFirstAuditFailure(brandId: string): string | null {
  try {
    const reason = sessionStorage.getItem(storageKey(brandId));
    sessionStorage.removeItem(storageKey(brandId));
    return reason;
  } catch {
    return null;
  }
}
