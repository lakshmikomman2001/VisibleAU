/**
 * Vunnara hotfix (18 Oct, post-df27ef8): the one-time "Thanks — your
 * questions are ready" success banner's flag, set by whichever confirm
 * card (classification or location) finishes the confirmation flow,
 * read and cleared by BrandDetailClient once it re-renders ready.
 * Shared so both cards set the exact same key, never two copies that
 * could drift.
 */
export function markJustConfirmed(brandId: string): void {
  try {
    sessionStorage.setItem(`brand-just-confirmed-${brandId}`, "1");
  } catch {
    // sessionStorage unavailable (private mode, restricted context) --
    // the confirmation itself still saved; only this one-time banner
    // is skipped.
  }
}
