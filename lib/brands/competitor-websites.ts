/**
 * Fair competitor counting (7 Nov): a competitor's website, as stored in brands.competitor_websites and
 * matched against the hosts of the sources an answer cited (lib/audit/verify-mention.ts's
 * isBrandDomain, which already allows www. and subdomains).
 */

/** "https://www.RivalPlumbing.com.au/contact" -> "rivalplumbing.com.au"; null when it isn't a host. */
export function normalizeWebsite(raw: string): string | null {
  const host = raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/:\d+$/, "")
    .replace(/^www\./, "");
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(host)
    ? host
    : null;
}

export type CompetitorWebsiteResult =
  | { ok: true; websites: Record<string, string> }
  | { ok: false; error: string };

/**
 * The websites to store: each competitor's normalised host, an empty value removing it, and only for
 * names that are among the brand's competitors (so a renamed or removed competitor's site goes too).
 */
export function competitorWebsitesToStore(
  competitors: readonly string[],
  current: Readonly<Record<string, string>>,
  changes: Readonly<Record<string, string>> | undefined,
): CompetitorWebsiteResult {
  const next: Record<string, string> = {};
  for (const name of competitors) {
    if (current[name]) next[name] = current[name];
  }
  for (const [name, raw] of Object.entries(changes ?? {})) {
    if (!competitors.includes(name)) {
      return { ok: false, error: `${name} isn't one of this brand's competitors` };
    }
    if (raw.trim() === "") {
      delete next[name];
      continue;
    }
    const host = normalizeWebsite(raw);
    if (!host) return { ok: false, error: `${raw} isn't a website address` };
    next[name] = host;
  }
  return { ok: true, websites: next };
}
