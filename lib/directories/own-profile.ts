import { domainStem } from "@/lib/brands/normalize";

/**
 * 13 Nov (Sri's walk-through, part 9): the AI cited localsearch.com.au/profile/hero-home-services/… -- Hero
 * Home Services' own Localsearch page -- while the audit said "Your profile: Not linked yet" and gave a
 * generic "Link your … profiles". When a cited page of a directory is very likely the brand's own profile,
 * the audit offers it ("This looks like your profile — link it?"). It is never linked automatically: the
 * owner confirms, and the link goes through the same check as one pasted in Brand settings.
 *
 * "Very likely": the page is the directory's own profile shape (its registry profileUrlPattern, the
 * tracking query dropped), and one of its path segments STARTS with the brand's name -- or its domain's
 * name part -- with any spacing ("hero-home-services", "herohomeservices", "hero_home_services"; part 7's
 * variants), followed by nothing or only the brand's own place (its suburb, state or postcode) or a number.
 * So "omega-plumbing" is not Omega's, and "superhero-home-services" is not Hero Home Services'.
 */

function compact(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

export interface OwnProfileBrand {
  name: string;
  domain: string;
  suburb?: string | null;
  state?: string | null;
  postcode?: string | null;
}

/** The page without its query and hash (utm_source=openai and the like), as it would be linked. */
function cleanUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

/** The first cited page that is very likely the brand's own profile on this directory, cleaned; else null. */
export function likelyOwnProfileUrl(
  profileUrlPattern: RegExp,
  citedUrls: readonly string[],
  brand: OwnProfileBrand,
): string | null {
  const names = [compact(brand.name), domainStem(brand.domain)].filter((n) => n.length >= 4);
  if (names.length === 0) return null;
  const place = new Set(
    [brand.suburb, brand.state, brand.postcode]
      .filter((p): p is string => !!p)
      .flatMap((p) => p.toLowerCase().split(/\s+/))
      .map(compact),
  );
  const isPlaceOrNumber = (word: string) => place.has(word) || /^\d+$/.test(word);

  for (const raw of citedUrls) {
    const url = cleanUrl(raw);
    if (!url) continue;
    const href = url.toString().replace(/\/$/, "");
    if (!profileUrlPattern.test(href) && !profileUrlPattern.test(`${href}/`)) continue;
    for (const segment of url.pathname.split("/").filter(Boolean)) {
      let decoded = segment;
      try {
        decoded = decodeURIComponent(segment);
      } catch {
        // a malformed escape: the segment as it is
      }
      const words = decoded
        .toLowerCase()
        .split(/[-_.+\s]+/)
        .filter(Boolean)
        .map(compact);
      for (let end = 1; end <= words.length; end++) {
        if (!names.includes(words.slice(0, end).join(""))) continue;
        if (words.slice(end).every(isPlaceOrNumber)) return href;
      }
    }
  }
  return null;
}
