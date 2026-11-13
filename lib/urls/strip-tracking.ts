/**
 * Mock-gate and retention follow-ups (9 Nov), part 6 -- audit #42's source links were shown clean, but their hrefs
 * kept the AI's tracking tags (e.g. ?utm_source=chatgpt.com), so a click from Vunnara was counted by the directory
 * as a ChatGPT referral. Links are rendered without known tracking parameters; every other parameter (a search, a
 * listing id) and the fragment stay. The stored URL is never changed: this only builds what a link points at.
 * Used by components/shared/url-link.tsx (directories panel, evidence links) and the audit page's answer sources.
 */
const TRACKING_KEYS =
  "utm_[a-z0-9_]+|gclid|gbraid|wbraid|dclid|fbclid|msclkid|yclid|twclid|ttclid|igshid|mc_cid|mc_eid|_hsenc|_hsmi|hsa_[a-z0-9_]+|li_fat_id|srsltid";
const TRACKING_PARAM = new RegExp(`^(${TRACKING_KEYS})$`, "i");
/** A tracking parameter and its value inside a URL in text: "?utm_source=chatgpt.com", "&gclid=abc". */
const TRACKING_IN_TEXT = new RegExp(`([?&](?:${TRACKING_KEYS})=)[^&#\\s)\\]>"'<]*`, "gi");

/**
 * 13 Nov follow-up, item 6: text with every tracking parameter's value taken out of the URLs in it
 * ("…/find/plumber?utm_source=chatgpt.com" -> "…/find/plumber?utm_source="). An engine tags the links it gives with
 * its own domain; that tag isn't a site the answer cited (lib/audit/extract-citations.ts reads domains from this).
 */
export function withoutTrackingValues(text: string): string {
  return text.replace(TRACKING_IN_TEXT, "$1");
}

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
