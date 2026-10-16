import { isBrandDomain } from "@/lib/audit/extract-citations";
import type { CitedSourceType, EngineAffinity } from "./types";

/**
 * Task #41: the directory list was missing the real AU trade
 * directories/marketplaces -- hipages, oneflare, airtasker, and
 * serviceseeking are exactly the sites a local trade business (the
 * au_directory seed description in db/seed/citation-source-affinity.ts
 * already names Hipages as an example) actually gets cited from, but
 * none of them matched any pattern, so they all fell through to
 * "other". Google Business Profile is classified as review_site --
 * same underlying local-business/review data surface as the existing
 * google.com/maps pattern, not a new category. See
 * docs/ops/post-launch-db-hardening.md section 41.
 */
/**
 * Task #46: Word of Mouth (womo.com.au) was already named in this
 * category's own seed description (db/seed/citation-source-affinity.ts)
 * as an example AU directory, but its actual domain never made it into
 * this pattern list -- the Hipages lesson (task #41) again: docs and
 * code drifting out of sync. Confirmed real via web search + Wikipedia.
 *
 * industry_association: only domains independently confirmed real
 * (web search), not guessed state-variant TLDs. Master Plumbers NSW
 * (mpansw.com.au, confirmed present in live Bondi audit data) and the
 * national Master Plumbers & Mechanical Services Association of
 * Australia (plumber.com.au, confirmed) and masterplumbers.com.au
 * (confirmed, also used by the NSW body); HIA (hia.com.au, confirmed);
 * Master Builders Australia (masterbuilders.com.au, confirmed). State
 * variants like a hypothetical mpavic.com.au/mpaqld.com.au were
 * considered and deliberately excluded -- not independently
 * confirmed, and "don't guess" is an explicit constraint here. See
 * docs/ops/post-launch-db-hardening.md section 46.
 *
 * government_regulator: matched by suffix (any *.gov.au host), not by
 * enumerating specific department domains -- gov.au itself is the
 * reliable, auto-identifiable signal; trying to list every state's
 * fair-trading/licensing authority by name would mean guessing at
 * domains the same way the industry-association ones above were
 * deliberately NOT guessed at.
 *
 * Task #46 follow-up: candidates seen in Claude's citations against
 * live Bondi Audit #19 data, each independently web-verified (not
 * guessed state-TLD variants -- same bar as the rest of this comment).
 *   - mpaq.com.au -> industry_association. Master Plumbers' Association
 *     of Queensland -- confirmed via a business directory listing
 *     (top4.com.au) giving this exact URL, and MPAQ's own public
 *     contact address (events@mpaq.com.au) sharing the domain.
 *   - masterplumbers.asn.au -> industry_association. Master Plumbers &
 *     Gasfitters Association of Western Australia (MPGAWA) --
 *     confirmed via a Plumbing Connection trade-magazine contact
 *     listing naming this exact URL for the WA body.
 *   - masterplumbersact.asn.au -> industry_association. Master
 *     Plumbers ACT -- confirmed via Region Canberra news coverage
 *     naming this exact URL, corroborated by an ACT Government
 *     budget-consultation submission (budgetconsultation.act.gov.au)
 *     from the same association.
 *   - VIC and SA/TAS/NT: no state-specific domain found that isn't
 *     already covered above or couldn't be confirmed (the VIC body
 *     appears to operate under the already-listed plumber.com.au,
 *     headquartered in Brunswick VIC; SA's body appears to have
 *     rebranded with no domain on record; TAS and NT turned up no
 *     citable domain at all) -- left unclassified rather than guessed.
 *
 * Task #46 (3rd follow-up): candidates seen in Perplexity's retrieved
 * sources against live Bondi data, each web-verified before adding --
 * two were deliberately left unclassified (verdicts below).
 *   - wordofmouth.com.au -> au_directory. Same Word of Mouth review/
 *     discovery platform as womo.com.au (founded as WOMOW Pty Ltd;
 *     wordofmouth.com.au is the platform's primary domain, womo.com.au
 *     the shortened one it later also goes by).
 *   - servicetasker.com.au -> au_directory. A trade marketplace --
 *     post a task, get quotes from local tradies, ABN-checked
 *     businesses -- directly analogous to hipages/oneflare/airtasker.
 *   - homedone.com.au -> au_directory. Same shape again: find/compare
 *     local tradies and home services by reviews and credentials,
 *     17,500+ listed businesses, businesses can claim their listing.
 *   - bestinhood.com -> review_site. An independent local-business
 *     review/recommendation aggregator (not AU-specific -- 14 cities,
 *     international), same category TrustPilot (also non-AU-specific)
 *     already sits in.
 *   - fixedtoday.com.au -> left as "other", NOT classified. This is a
 *     genuine competitor plumbing business's own website (Fixed Today
 *     Plumbing, Sydney, NSW Licence 305428C) -- not a directory,
 *     marketplace, or review aggregator at all. Exactly the kind of
 *     real competitor signal the Unclassified bucket exists to
 *     surface, per the diagnosis that led to this task.
 *   - starworks.com.au -> left as "other", NOT classified. A B2B
 *     reputation-management SaaS tool businesses use to generate their
 *     OWN reviews elsewhere ("grows your reviews... sends review
 *     requests by SMS/email") -- not itself a place a consumer goes to
 *     find or review a business, so it doesn't cleanly fit
 *     au_directory or review_site. Ambiguous; left unclassified rather
 *     than guessed.
 */
const URL_PATTERNS: Array<{ pattern: RegExp; type: CitedSourceType }> = [
  { pattern: /reddit\.com/i, type: "reddit_thread" },
  { pattern: /linkedin\.com/i, type: "linkedin_post" },
  { pattern: /youtube\.com|youtu\.be/i, type: "youtube_video" },
  { pattern: /wikipedia\.org/i, type: "wikipedia" },
  {
    pattern:
      /yellowpages\.com\.au|truelocal\.com\.au|hotfrog\.com\.au|localsearch\.com\.au|hipages\.com\.au|oneflare\.com\.au|airtasker\.com|serviceseeking\.com\.au|\bwomo\.com\.au|\bwordofmouth\.com\.au\b|\bservicetasker\.com\.au\b|\bhomedone\.com\.au\b/i,
    type: "au_directory",
  },
  {
    pattern:
      /productreview\.com\.au|trustpilot\.com|google\.com\/maps|business\.google\.com|g\.page|\bbestinhood\.com\b/i,
    type: "review_site",
  },
  {
    pattern: /news\.com\.au|abc\.net\.au|smh\.com\.au|theaustralian\.com|9news\.com|7news\.com/i,
    type: "news_article",
  },
  // Task #46: unlike the generic/brand-name domains above, "plumber"
  // and "hia" are common enough substrings that an unanchored pattern
  // would also match an unrelated real business's domain merely
  // ending in these characters (e.g. "bobsplumber.com.au") -- \b
  // anchors so only the exact domain (or a subdomain of it) matches.
  {
    pattern:
      /\bmpansw\.com\.au\b|\bmasterplumbers\.com\.au\b|\bplumber\.com\.au\b|\bmasterbuilders\.com\.au\b|\bhia\.com\.au\b|\bmpaq\.com\.au\b|\bmasterplumbers\.asn\.au\b|\bmasterplumbersact\.asn\.au\b/i,
    type: "industry_association",
  },
  { pattern: /\.gov\.au\b/i, type: "government_regulator" },
];

const ENGINE_AFFINITY_MAP: Partial<Record<CitedSourceType, EngineAffinity>> = {
  reddit_thread: "perplexity_primary",
  linkedin_post: "chatgpt_primary",
  youtube_video: "gemini_primary",
  wikipedia: "all",
  news_article: "all",
};

export function classifySourceType(url: string): CitedSourceType {
  for (const { pattern, type } of URL_PATTERNS) {
    if (pattern.test(url)) return type;
  }
  return "other";
}

export function classifySourceTypeWithBrand(url: string, brandDomain: string): CitedSourceType {
  // Task #46 (6th follow-up): was a substring-of-URL check -- matched a
  // competitor whose domain merely CONTAINS the brand's domain (e.g.
  // bondiplumbingservices.com.au) as "brand_owned". Now the same
  // registrable-domain comparison every other brand check uses. See
  // isBrandDomain's own docstring (lib/audit/extract-citations.ts).
  if (isBrandDomain(url, brandDomain)) {
    return "brand_owned";
  }
  return classifySourceType(url);
}

export function getEngineAffinity(sourceType: CitedSourceType): EngineAffinity {
  return ENGINE_AFFINITY_MAP[sourceType] ?? null;
}

export interface ClassifiedSource {
  url: string;
  sourceType: CitedSourceType;
  engineAffinity: EngineAffinity;
}

export function classifyCitedSources(
  sources: Array<{ url: string }>,
  brandDomain: string,
): ClassifiedSource[] {
  return sources.map((s) => {
    const sourceType = classifySourceTypeWithBrand(s.url, brandDomain);
    return {
      url: s.url,
      sourceType,
      engineAffinity: getEngineAffinity(sourceType),
    };
  });
}
