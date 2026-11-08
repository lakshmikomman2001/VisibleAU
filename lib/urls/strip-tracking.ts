/**
 * Mock-gate and retention follow-ups (9 Nov), part 6 -- audit #42's source links were shown clean, but their hrefs
 * kept the AI's tracking tags (e.g. ?utm_source=chatgpt.com), so a click from Vunnara was counted by the directory
 * as a ChatGPT referral. Links are rendered without known tracking parameters; every other parameter (a search, a
 * listing id) and the fragment stay. The stored URL is never changed: this only builds what a link points at.
 * Used by components/shared/url-link.tsx (directories panel, evidence links) and the audit page's answer sources.
 */
const TRACKING_PARAM =
  /^(utm_[a-z0-9_]+|gclid|gbraid|wbraid|dclid|fbclid|msclkid|yclid|twclid|ttclid|igshid|mc_cid|mc_eid|_hsenc|_hsmi|hsa_[a-z0-9_]+|li_fat_id|srsltid)$/i;

/** The URL a link should open: the same URL without known tracking parameters. Unparseable URLs are unchanged. */
export function linkHref(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  const tracking = [...parsed.searchParams.keys()].filter((key) => TRACKING_PARAM.test(key));
  if (tracking.length === 0) return url;
  for (const key of new Set(tracking)) parsed.searchParams.delete(key);
  return parsed.toString();
}
