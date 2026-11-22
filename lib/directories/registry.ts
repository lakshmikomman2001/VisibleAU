import { type CategoryKey, LOCAL_CATEGORY_KEYS } from "@/lib/prompts/templates";

/**
 * Vunnara (21 Oct, "directory listings... never scraping", Part B) -- the one place every directory this product
 * recognises is declared. Nothing here is fetched automatically; a directory's presence comes only from the owner's
 * own confirmation (brand_directory_listings) or from counting what AI answers actually cited.
 *
 * S00 part 5 (22 Nov; LLD 7.7, 8.8.3, appendix B, T6): the list lives in the directory_registry table (migration
 * 0153, directory registry), one row per domain pattern, and is read through lib/directories/registry-store.ts
 * (server code, cached per process). This module is what every caller reads, server or browser, with the same
 * functions and output shape as before: the rows the table was seeded with are DIRECTORY_REGISTRY_SEED below, used
 * until the table has been read in this process (and in the browser, which never reads it), and a test holds the
 * seed and the migration's rows identical. TechCore IT's audit #52 cited Local Business Guide, Directso, Whereis,
 * LinkedIn, Nextdoor, Birdeye and Cylex, which the list didn't know; appendix B adds them.
 *
 * Each directory has a `kind` (trades, general, health, professional, reviews, social, maps) and a `relevance`:
 * "trades" and "local" directories are the ones a brand's Directory Listings card offers and the audit's directory
 * panel counts for every brand of those types (as before); a "cited" directory shows only when an audit's answers
 * cite it. A domain the registry doesn't have is never called a directory.
 */

// Matches the market_code convention already used elsewhere (lib/platform/config-bundle.service.ts's "AU_EN").
export type MarketCode = "AU_EN" | "US_EN";

export const DIRECTORY_KINDS = [
  "trades",
  "general",
  "health",
  "professional",
  "reviews",
  "social",
  "maps",
] as const;
export type DirectoryKind = (typeof DIRECTORY_KINDS)[number];

/** How a kind is said beside a directory's name: "Local Business Guide · general directory". */
export const DIRECTORY_KIND_LABELS: Record<DirectoryKind, string> = {
  trades: "trades marketplace",
  general: "general directory",
  health: "health directory",
  professional: "professional network",
  reviews: "review site",
  social: "community network",
  maps: "maps",
};

/** "trades": the four trades types; "local": every local business type; "cited": shown only when cited. */
export type DirectoryRelevance = "trades" | "local" | "cited";

export interface DirectoryEntry {
  key: string;
  name: string;
  /** Registrable domains this directory is reachable at; the first is the canonical one shown in copy. */
  domains: readonly string[];
  /**
   * Validates an owner-pasted profile URL -- host first (one of `domains`), then the path shape. Only hipages'
   * pattern is independently verified (/connect/{slug}); every other directory uses a permissive host + path.
   */
  profileUrlPattern: RegExp;
  /** The CATEGORY_KEYS this directory is relevant to (from `relevance`; none for a "cited" directory). */
  categories: readonly CategoryKey[];
  enabled: boolean;
  /** S00 part 5: what sort of directory it is. */
  kind: DirectoryKind;
  market: MarketCode;
  relevance: DirectoryRelevance;
  /** Only pages under this path are this directory ("/company" for LinkedIn: not a person's profile). */
  pathPrefix: string | null;
}

/** One directory_registry row (db/schema/directory-registry.ts), in the shape the table has. */
export interface DirectoryRegistryRow {
  domainPattern: string;
  directoryKey: string;
  name: string;
  kind: DirectoryKind;
  market: "au" | "us";
  appliesTo: DirectoryRelevance;
  profileUrlHint: string | null;
  active: boolean;
  sortOrder: number;
}

/**
 * The rows migration 0153 (directory registry) seeds, in order: the list as it was (AU, then US, all US disabled),
 * then appendix B's additions, each "cited" so that no brand's card or count changes unless an answer cites it.
 * tests/unit/directories/registry-seed.test.ts fails if these and the migration's rows differ.
 */
export const DIRECTORY_REGISTRY_SEED: readonly DirectoryRegistryRow[] = [
  row(
    "hipages.com.au",
    "hipages",
    "hipages",
    "trades",
    "au",
    "trades",
    10,
    "hipages.com.au/connect/{slug}",
  ),
  row("serviceseeking.com.au", "serviceseeking", "ServiceSeeking", "trades", "au", "trades", 20),
  row("oneflare.com.au", "oneflare", "Oneflare", "trades", "au", "trades", 30),
  row("airtasker.com", "airtasker", "Airtasker", "trades", "au", "trades", 40),
  row("yellowpages.com.au", "yellow_pages_au", "Yellow Pages", "general", "au", "local", 50),
  row("truelocal.com.au", "true_local", "True Local", "general", "au", "local", 60),
  row("localsearch.com.au", "localsearch", "Localsearch", "general", "au", "local", 70),
  row("productreview.com.au", "product_review", "ProductReview", "reviews", "au", "local", 80),
  row("wordofmouth.com.au", "word_of_mouth", "Word of Mouth", "general", "au", "local", 90),
  row("womo.com.au", "word_of_mouth", "Word of Mouth", "general", "au", "local", 91),
  row(
    "google.com",
    "google_business_profile",
    "Google Business Profile",
    "maps",
    "au",
    "local",
    100,
  ),
  row(
    "business.google.com",
    "google_business_profile",
    "Google Business Profile",
    "maps",
    "au",
    "local",
    101,
  ),
  row("g.page", "google_business_profile", "Google Business Profile", "maps", "au", "local", 102),
  row(
    "localbusinessguide.com.au",
    "local_business_guide",
    "Local Business Guide",
    "general",
    "au",
    "cited",
    200,
  ),
  row("directso.com.au", "directso", "Directso", "general", "au", "cited", 210),
  row("whereis.com", "whereis", "Whereis", "maps", "au", "cited", 220),
  row("cylex-australia.com", "cylex", "Cylex", "general", "au", "cited", 230),
  row("au.nextdoor.com", "nextdoor_au", "Nextdoor", "social", "au", "cited", 240),
  row("reviews.birdeye.com", "birdeye", "Birdeye", "reviews", "au", "cited", 250),
  row("birdeye.com", "birdeye", "Birdeye", "reviews", "au", "cited", 251),
  row("linkedin.com/company", "linkedin", "LinkedIn", "professional", "au", "cited", 260),
  row("au.linkedin.com/company", "linkedin", "LinkedIn", "professional", "au", "cited", 261),
  row("hotfrog.com.au", "hotfrog", "Hotfrog", "general", "au", "cited", 270),
  row("startlocal.com.au", "startlocal", "StartLocal", "general", "au", "cited", 280),
  row("aussieweb.com.au", "aussieweb", "AussieWeb", "general", "au", "cited", 290),
  row("yelp.com.au", "yelp_au", "Yelp", "reviews", "au", "cited", 300),
  row("healthengine.com.au", "healthengine", "HealthEngine", "health", "au", "cited", 310),
  row("hotdoc.com.au", "hotdoc", "HotDoc", "health", "au", "cited", 320),
  row("yelp.com", "yelp", "Yelp", "reviews", "us", "local", 1010, null, false),
  row("angi.com", "angi", "Angi", "trades", "us", "trades", 1020, null, false),
  row("thumbtack.com", "thumbtack", "Thumbtack", "trades", "us", "trades", 1030, null, false),
  row("homeadvisor.com", "homeadvisor", "HomeAdvisor", "trades", "us", "trades", 1040, null, false),
  row("bbb.org", "bbb", "Better Business Bureau", "reviews", "us", "local", 1050, null, false),
  row("nextdoor.com", "nextdoor", "Nextdoor", "social", "us", "local", 1060, null, false),
  row("houzz.com", "houzz", "Houzz", "trades", "us", "trades", 1070, null, false),
];

function row(
  domainPattern: string,
  directoryKey: string,
  name: string,
  kind: DirectoryKind,
  market: "au" | "us",
  appliesTo: DirectoryRelevance,
  sortOrder: number,
  profileUrlHint: string | null = null,
  active = true,
): DirectoryRegistryRow {
  return {
    domainPattern,
    directoryKey,
    name,
    kind,
    market,
    appliesTo,
    profileUrlHint,
    active,
    sortOrder,
  };
}

/** The four trades types (16 Nov, part 1: the general type left this list). */
const TRADE_CATEGORIES: readonly CategoryKey[] = [
  "trades_plumbing",
  "trades_electrical",
  "trades_building",
  "trades_general",
];

/** 17 Nov, part 1: every local business type (lib/prompts/templates.ts), never a software type. */
const LOCAL_SERVICE_CATEGORIES: readonly CategoryKey[] = LOCAL_CATEGORY_KEYS;

function categoriesFor(relevance: DirectoryRelevance): readonly CategoryKey[] {
  if (relevance === "trades") return TRADE_CATEGORIES;
  if (relevance === "local") return LOCAL_SERVICE_CATEGORIES;
  return [];
}

function hostPattern(domain: string): string {
  return `(?:[a-z0-9-]+\\.)?${domain.replace(/\./g, "\\.")}`;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * hipages' profile path is verified (robots.txt documents /connect/{slug}; diag-0082's own cited URL); Google's
 * profile URLs vary so widely it's host-matched only; every other directory gets the permissive host + a non-empty
 * path (under its path prefix, if it has one) rather than a guessed structure that could reject a real profile.
 */
function profileUrlPatternFor(
  key: string,
  domains: readonly string[],
  pathPrefix: string | null,
): RegExp {
  if (key === "hipages")
    return new RegExp(`^https?://${hostPattern("hipages.com.au")}/connect/[a-z0-9-]+/?$`, "i");
  if (key === "google_business_profile")
    return new RegExp(domains.map((d) => `^https?://${hostPattern(d)}/.+$`).join("|"), "i");
  const path = pathPrefix ? `${escapeRegExp(pathPrefix)}/` : "/";
  return new RegExp(`^https?://${hostPattern(domains[0] ?? "")}${path}.+$`, "i");
}

function splitPattern(pattern: string): { host: string; path: string | null } {
  const slash = pattern.indexOf("/");
  return slash < 0
    ? { host: pattern, path: null }
    : { host: pattern.slice(0, slash), path: pattern.slice(slash).replace(/\/+$/, "") || null };
}

/** The registry, by market, from its rows (the table's, or the seed): one entry per directory, in row order. */
export function buildDirectoryRegistry(
  rows: readonly DirectoryRegistryRow[],
): Record<MarketCode, readonly DirectoryEntry[]> {
  const byKey = new Map<string, DirectoryRegistryRow[]>();
  for (const r of [...rows].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const list = byKey.get(r.directoryKey);
    if (list) list.push(r);
    else byKey.set(r.directoryKey, [r]);
  }
  const out: Record<MarketCode, DirectoryEntry[]> = { AU_EN: [], US_EN: [] };
  for (const [key, group] of byKey) {
    const first = group[0];
    const parts = group.map((g) => splitPattern(g.domainPattern));
    const domains = [...new Set(parts.map((p) => p.host))];
    const pathPrefix = parts[0]?.path ?? null;
    const market: MarketCode = first.market === "us" ? "US_EN" : "AU_EN";
    out[market].push({
      key,
      name: first.name,
      domains,
      profileUrlPattern: profileUrlPatternFor(key, domains, pathPrefix),
      categories: categoriesFor(first.appliesTo),
      enabled: group.some((g) => g.active),
      kind: first.kind,
      market,
      relevance: first.appliesTo,
      pathPrefix,
    });
  }
  return out;
}

/** The registry as the migration seeded it. */
export const DIRECTORY_REGISTRY: Record<MarketCode, readonly DirectoryEntry[]> =
  buildDirectoryRegistry(DIRECTORY_REGISTRY_SEED);

let current: Record<MarketCode, readonly DirectoryEntry[]> = DIRECTORY_REGISTRY;

/**
 * Replaces what every function below reads with the table's rows (lib/directories/registry-store.ts, server only).
 * An empty list is ignored: the registry is never emptied by a read that found nothing.
 */
export function applyDirectoryRegistryRows(rows: readonly DirectoryRegistryRow[]): void {
  if (rows.length === 0) return;
  current = buildDirectoryRegistry(rows);
}

/** Back to the seed (tests). */
export function resetDirectoryRegistry(): void {
  current = DIRECTORY_REGISTRY;
}

/** Maps a brand's `region` to the registry's market keying: AU-first, every region but "us" is AU_EN. */
export function marketCodeForRegion(region: string): MarketCode {
  return region === "us" ? "US_EN" : "AU_EN";
}

export function getDirectoriesForMarket(
  marketCode: MarketCode,
  opts: { enabledOnly?: boolean } = {},
): readonly DirectoryEntry[] {
  const all = current[marketCode] ?? [];
  return opts.enabledOnly === false ? all : all.filter((d) => d.enabled);
}

/**
 * The enabled directories relevant to a specific brand -- its market and at least one of its confirmed categories
 * overlapping the directory's own. A brand with no confirmed categories yet sees every enabled trades and local
 * directory for its market, never zero. A "cited" directory is never "relevant": it shows only when cited.
 */
export function getDirectoriesForBrand(
  region: string,
  categories: readonly string[],
): readonly DirectoryEntry[] {
  const all = getDirectoriesForMarket(marketCodeForRegion(region)).filter(
    (d) => d.relevance !== "cited",
  );
  if (categories.length === 0) return all;
  return all.filter((d) => d.categories.some((c) => categories.includes(c)));
}

/** Every directory, in any market, whose display name appears in `text` as a whole phrase. */
export function directoriesNamedIn(text: string): DirectoryEntry[] {
  const named: DirectoryEntry[] = [];
  for (const entries of Object.values(current)) {
    for (const entry of entries) {
      const escaped = escapeRegExp(entry.name);
      if (new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`).test(text)) named.push(entry);
    }
  }
  return named;
}

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * Every directory across every market whose `domains` includes the given registrable domain (or a subdomain of
 * it) -- host-matched the way lib/audit/extract-citations.ts matches a brand's own domain. A directory that is only
 * some paths of its site (LinkedIn's company pages) is never matched by the host alone.
 */
export function findDirectoryByDomain(domain: string): DirectoryEntry | null {
  const needle = domain.toLowerCase().replace(/^www\./, "");
  for (const entries of Object.values(current)) {
    for (const entry of entries) {
      if (entry.pathPrefix) continue;
      if (entry.domains.some((d) => hostMatches(needle, d))) return entry;
    }
  }
  return null;
}

/**
 * The directory a cited source belongs to: its host, and, for a directory that is only some paths of its site,
 * the page's path ("linkedin.com/company/techcore-it" is LinkedIn; "linkedin.com/in/someone" isn't). Without a
 * usable URL, the host alone, as findDirectoryByDomain.
 */
export function findDirectoryForSource(domain: string, url: string | null): DirectoryEntry | null {
  let path: string | null = null;
  let host = domain.toLowerCase().replace(/^www\./, "");
  if (url) {
    try {
      const parsed = new URL(url);
      path = parsed.pathname.toLowerCase();
      if (parsed.hostname) host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      path = null;
    }
  }
  if (path !== null) {
    for (const entries of Object.values(current)) {
      for (const entry of entries) {
        const prefix = entry.pathPrefix;
        if (!prefix || !entry.domains.some((d) => hostMatches(host, d))) continue;
        if (path === prefix || path.startsWith(`${prefix}/`)) return entry;
      }
    }
  }
  return findDirectoryByDomain(domain);
}
