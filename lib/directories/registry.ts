import type { CategoryKey } from "@/lib/prompts/templates";

/**
 * Vunnara (21 Oct, "directory listings... never scraping", Part B) --
 * the one place every directory this product recognises is declared.
 * Nothing here is fetched automatically (Part A deleted the last
 * checker that did); a directory's presence/absence comes only from
 * the owner's own confirmation (brand_directory_listings, Part C) or
 * from counting what AI answers actually cited (Part D).
 *
 * Shape chosen to be absorbed UNCHANGED by Build 2's planned
 * market_packs table (docs/latets/Phase4/Multi-Region-US-Expansion/
 * visibleau-multiregion-visibleus-assessment-and-prd-2026-07.md:152 --
 * "market_packs -- market_code, ..., directory_sources (jsonb), ..."):
 * DIRECTORY_REGISTRY[marketCode] IS the intended directory_sources
 * value for that market_pack row, entry-for-entry. Migrating this
 * registry into that table is then just: one row per MARKET_CODES
 * entry, with directory_sources = JSON.stringify(DIRECTORY_REGISTRY[
 * code]) -- no reshaping -- and every reader (getDirectoriesForMarket
 * below, and everything that calls it) swaps its one lookup from this
 * static object to a query against the tenant's own market_pack row,
 * against the exact same per-entry TypeScript shape.
 */

// Matches the market_code convention already used elsewhere (e.g.
// lib/platform/config-bundle.service.ts's "AU_EN") -- COUNTRY_LANGUAGE,
// not a new scheme.
export type MarketCode = "AU_EN" | "US_EN";

export interface DirectoryEntry {
  key: string;
  name: string;
  /** Registrable domains this directory is reachable at -- an owner-
   * pasted profile link's host must match one of these (Part C), and
   * a cited source's host is matched against these too (Part D). The
   * first entry is the canonical one shown in copy. */
  domains: readonly string[];
  /**
   * Validates an owner-pasted profile URL -- checked host-first (the
   * domain must be one of `domains`, which alone stops a link to an
   * unrelated site), then this pattern for the path shape. Only
   * hipages' pattern is independently verified (robots.txt documents
   * /connect/{slug} as its real profile path, confirmed live against
   * a real listing -- diag-0082's own cited URL,
   * hipages.com.au/connect/norwestelectricalgroup). Every other
   * directory uses a deliberately permissive fallback (host + a
   * non-empty path) rather than a guessed-at specific structure that
   * could wrongly reject a real profile link -- tighten each as its
   * real format is confirmed.
   */
  profileUrlPattern: RegExp;
  /** Which of lib/prompts/templates.ts's CATEGORY_KEYS this directory
   * is relevant to -- gates which rows the brand page's Directory
   * Listings card (Part C) and the audit page's Directories AI Cited
   * panel (Part D) show for a given brand. */
  categories: readonly CategoryKey[];
  enabled: boolean;
}

function hostPattern(domain: string): string {
  return `(?:[a-z0-9-]+\\.)?${domain.replace(/\./g, "\\.")}`;
}

/** Host + a non-empty path -- the permissive default for every
 * directory whose real profile-URL structure isn't independently
 * confirmed yet (see DirectoryEntry.profileUrlPattern's own comment). */
function genericProfilePattern(domain: string): RegExp {
  return new RegExp(`^https?://${hostPattern(domain)}/.+$`, "i");
}

const TRADE_CATEGORIES: readonly CategoryKey[] = [
  "trades_plumbing",
  "trades_electrical",
  "trades_building",
  "trades_general",
  "general",
];

// General local-business directories -- relevant to every category this
// product serves that corresponds to a real-world, physically-located
// business (trades, allied health, legal, real estate, hospitality),
// never the SaaS/software categories (a design-tools startup doesn't
// get listed on Yellow Pages).
const LOCAL_SERVICE_CATEGORIES: readonly CategoryKey[] = [
  ...TRADE_CATEGORIES,
  "allied_health_dental",
  "allied_health_physio",
  "allied_health_mental",
  "allied_health_general",
  "legal_services",
  "real_estate_agency",
  "hospitality_restaurant",
];

export const DIRECTORY_REGISTRY: Record<MarketCode, readonly DirectoryEntry[]> = {
  AU_EN: [
    {
      key: "hipages",
      name: "Hipages",
      domains: ["hipages.com.au"],
      // Verified: robots.txt's own AI-crawler comment names /connect/
      // as the profile path ("Directory (/find) and profile (/connect)
      // pages"); diag-0082's real cited URL for a competitor confirms
      // the live shape, hipages.com.au/connect/{slug}.
      profileUrlPattern: new RegExp(`^https?://${hostPattern("hipages.com.au")}/connect/[a-z0-9-]+/?$`, "i"),
      categories: TRADE_CATEGORIES,
      enabled: true,
    },
    {
      key: "serviceseeking",
      name: "ServiceSeeking",
      domains: ["serviceseeking.com.au"],
      profileUrlPattern: genericProfilePattern("serviceseeking.com.au"),
      categories: TRADE_CATEGORIES,
      enabled: true,
    },
    {
      key: "oneflare",
      name: "Oneflare",
      domains: ["oneflare.com.au"],
      profileUrlPattern: genericProfilePattern("oneflare.com.au"),
      categories: TRADE_CATEGORIES,
      enabled: true,
    },
    {
      key: "airtasker",
      name: "Airtasker",
      domains: ["airtasker.com"],
      profileUrlPattern: genericProfilePattern("airtasker.com"),
      categories: TRADE_CATEGORIES,
      enabled: true,
    },
    {
      key: "yellow_pages_au",
      name: "Yellow Pages",
      domains: ["yellowpages.com.au"],
      profileUrlPattern: genericProfilePattern("yellowpages.com.au"),
      categories: LOCAL_SERVICE_CATEGORIES,
      enabled: true,
    },
    {
      key: "true_local",
      name: "True Local",
      domains: ["truelocal.com.au"],
      profileUrlPattern: genericProfilePattern("truelocal.com.au"),
      categories: LOCAL_SERVICE_CATEGORIES,
      enabled: true,
    },
    {
      key: "localsearch",
      name: "Localsearch",
      domains: ["localsearch.com.au"],
      profileUrlPattern: genericProfilePattern("localsearch.com.au"),
      categories: LOCAL_SERVICE_CATEGORIES,
      enabled: true,
    },
    {
      key: "product_review",
      name: "ProductReview",
      domains: ["productreview.com.au"],
      profileUrlPattern: genericProfilePattern("productreview.com.au"),
      categories: LOCAL_SERVICE_CATEGORIES,
      enabled: true,
    },
    {
      key: "word_of_mouth",
      name: "Word of Mouth",
      // Both domains the platform goes by -- lib/visibility/
      // citation-source-classifier.ts already treats these as the same
      // au_directory source for citation classification (task #46, 3rd
      // follow-up); this registry agrees.
      domains: ["wordofmouth.com.au", "womo.com.au"],
      profileUrlPattern: genericProfilePattern("wordofmouth.com.au"),
      categories: LOCAL_SERVICE_CATEGORIES,
      enabled: true,
    },
    {
      key: "google_business_profile",
      name: "Google Business Profile",
      domains: ["google.com", "business.google.com", "g.page"],
      // Google's own profile/maps URLs vary widely (g.page/..., maps
      // short links, business.google.com/...) -- intentionally the
      // loosest pattern here, host-matched only.
      profileUrlPattern: new RegExp(
        `^https?://${hostPattern("google.com")}/.+$|^https?://${hostPattern("business.google.com")}/.+$|^https?://${hostPattern("g.page")}/.+$`,
        "i",
      ),
      categories: LOCAL_SERVICE_CATEGORIES,
      enabled: true,
    },
  ],
  US_EN: [
    {
      key: "yelp",
      name: "Yelp",
      domains: ["yelp.com"],
      profileUrlPattern: genericProfilePattern("yelp.com"),
      categories: LOCAL_SERVICE_CATEGORIES,
      enabled: false,
    },
    {
      key: "angi",
      name: "Angi",
      domains: ["angi.com"],
      profileUrlPattern: genericProfilePattern("angi.com"),
      categories: TRADE_CATEGORIES,
      enabled: false,
    },
    {
      key: "thumbtack",
      name: "Thumbtack",
      domains: ["thumbtack.com"],
      profileUrlPattern: genericProfilePattern("thumbtack.com"),
      categories: TRADE_CATEGORIES,
      enabled: false,
    },
    {
      key: "homeadvisor",
      name: "HomeAdvisor",
      domains: ["homeadvisor.com"],
      profileUrlPattern: genericProfilePattern("homeadvisor.com"),
      categories: TRADE_CATEGORIES,
      enabled: false,
    },
    {
      key: "bbb",
      name: "Better Business Bureau",
      domains: ["bbb.org"],
      profileUrlPattern: genericProfilePattern("bbb.org"),
      categories: LOCAL_SERVICE_CATEGORIES,
      enabled: false,
    },
    {
      key: "nextdoor",
      name: "Nextdoor",
      domains: ["nextdoor.com"],
      profileUrlPattern: genericProfilePattern("nextdoor.com"),
      categories: LOCAL_SERVICE_CATEGORIES,
      enabled: false,
    },
    {
      key: "houzz",
      name: "Houzz",
      domains: ["houzz.com"],
      profileUrlPattern: genericProfilePattern("houzz.com"),
      categories: TRADE_CATEGORIES,
      enabled: false,
    },
  ],
};

/** Maps a brand's `region` (db/schema/enums.ts's regionEnum) to the
 * directory registry's own market keying -- this product is AU-first
 * (AGENTS.md), so every region other than "us" resolves to AU_EN today;
 * this is the one place that mapping lives, so Part D's citation
 * counting and this file's own API route can't drift from each other. */
export function marketCodeForRegion(region: string): MarketCode {
  return region === "us" ? "US_EN" : "AU_EN";
}

export function getDirectoriesForMarket(
  marketCode: MarketCode,
  opts: { enabledOnly?: boolean } = {},
): readonly DirectoryEntry[] {
  const all = DIRECTORY_REGISTRY[marketCode] ?? [];
  return opts.enabledOnly === false ? all : all.filter((d) => d.enabled);
}

/** The enabled directories relevant to a specific brand -- its market
 * (via `region`) and at least one of its confirmed `categories`
 * overlapping the directory's own `categories`. A brand with no
 * confirmed categories yet sees every enabled directory for its
 * market, never zero -- there's nothing to narrow by, not a reason to
 * hide the card entirely. The one shared filter the brand page's
 * Directory Listings card (Part C) and its own API route use, so they
 * can't drift into two different ideas of "relevant to this brand". */
export function getDirectoriesForBrand(
  region: string,
  categories: readonly string[],
): readonly DirectoryEntry[] {
  const market = marketCodeForRegion(region);
  const all = getDirectoriesForMarket(market);
  if (categories.length === 0) return all;
  return all.filter((d) => d.categories.some((c) => categories.includes(c)));
}

/** Every directory across every market whose `domains` includes the
 * given registrable domain (or a subdomain of it) -- the one shared
 * lookup Part D's citation counting needs, host-matched the same way
 * the rest of this codebase matches a brand's own domain
 * (lib/audit/extract-citations.ts's isBrandDomain). */
export function findDirectoryByDomain(domain: string): DirectoryEntry | null {
  const needle = domain.toLowerCase().replace(/^www\./, "");
  for (const entries of Object.values(DIRECTORY_REGISTRY)) {
    for (const entry of entries) {
      if (entry.domains.some((d) => needle === d || needle.endsWith(`.${d}`))) {
        return entry;
      }
    }
  }
  return null;
}
