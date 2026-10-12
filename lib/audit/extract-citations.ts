import { parse } from "tldts";
import { type Engine, ENGINE_SUPPLIES_STRUCTURED_CITATIONS } from "@/lib/llm/interface";

/**
 * Task #45: "retrieved" (a provider's own structured citation metadata,
 * e.g. Perplexity's citations/search_results -- a live search actually
 * ran) vs "recalled" (a domain-shaped string pattern-matched out of the
 * model's own generated text -- not verified against anything, may be
 * stale or entirely invented). extractCitations() always produces
 * "recalled" entries (it only ever scans text); mergeCitedSources()
 * tags the structured ones "retrieved". See
 * docs/ops/post-launch-db-hardening.md section 45.
 */
export type CitationOrigin = "retrieved" | "recalled";

export interface CitedSource {
  domain: string;
  url: string;
  origin: CitationOrigin;
}

/**
 * Task #46: a match from any of the three passes below is only kept if
 * its host resolves to a real ICANN registrable domain
 * (toRegistrableDomain) -- dropped otherwise (debug-logged, no PII: the
 * dropped string is model-generated text, not anything about a real
 * person). Closes the gap where a hallucinated URL's host (an IP,
 * "localhost", a single-label internal hostname, or a made-up TLD) or
 * a text-pattern false-positive was being stored and silently inflating
 * downstream citationCount -- see docs/ops/post-launch-db-hardening.md
 * section 46.
 */
function keepIfValidDomain(domain: string, seen: Set<string>): boolean {
  if (seen.has(domain)) return false;
  seen.add(domain);
  if (toRegistrableDomain(domain) === null) {
    console.debug("[extract-citations] dropped unparseable host", { domain });
    return false;
  }
  return true;
}

export function extractCitations(response: string): CitedSource[] {
  const seen = new Set<string>();
  const sources: CitedSource[] = [];

  const markdownLinks = [...response.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi)];
  for (const m of markdownLinks) {
    const url = m[2];
    try {
      const domain = new URL(url).hostname.replace(/^www\./, "");
      if (keepIfValidDomain(domain, seen)) {
        sources.push({ domain, url, origin: "recalled" });
      }
    } catch {
      /* malformed URL */
    }
  }

  const bareUrls = [...response.matchAll(/https?:\/\/[^\s,)>'"]+/gi)];
  for (const m of bareUrls) {
    const url = m[0].replace(/[.,;)]+$/, "");
    try {
      const domain = new URL(url).hostname.replace(/^www\./, "");
      if (keepIfValidDomain(domain, seen)) {
        sources.push({ domain, url, origin: "recalled" });
      }
    } catch {
      /* malformed URL */
    }
  }

  // Task #46: the label immediately before the suffix now requires at
  // least 2 characters (was 1+) -- kills the clearest false-positive
  // shape found during diagnosis, a version-string/abbreviation
  // fragment coincidentally ending in a real suffix (e.g. "v2.1.com" ->
  // "1.com", "U.S.com" -> "S.com") that a registrable-domain check
  // alone can't catch, because "1.com"/"s.com" are themselves
  // syntactically valid (if unlikely) domains. Doesn't fully close this
  // class -- a 2+-char fragment that happens to form a real-looking
  // word is still indistinguishable from a genuine short domain -- see
  // docs/ops/post-launch-db-hardening.md section 46.
  const domainRefs = [
    ...response.matchAll(
      /\b([a-z0-9][a-z0-9-]*[a-z0-9]\.(?:com\.au|com|net|org|io|co\.nz))\b/gi,
    ),
  ];
  for (const m of domainRefs) {
    const domain = m[1].toLowerCase();
    if (keepIfValidDomain(domain, seen)) {
      sources.push({ domain, url: `https://${domain}`, origin: "recalled" });
    }
  }

  return sources;
}

/**
 * Task #43: merges a provider's structured citation URLs (e.g.
 * Perplexity's CompleteOutput.citedUrls) with text-pattern-extracted
 * ones, de-duplicated by domain. Structured URLs are listed first --
 * they're the more reliable source (the provider's own citation
 * metadata, not a text-pattern guess) -- so they win as the "primary"
 * source where only the first entry is used (classify-citation-sources.ts).
 * Shared by both audit runners (lib/audit/run-audit-inline.ts and
 * inngest/functions/run-audit.ts) so they can't drift into two
 * different merge behaviours. Task #45: structured URLs are tagged
 * "retrieved"; extracted ones arrive already tagged "recalled" by
 * extractCitations(). See docs/ops/post-launch-db-hardening.md
 * sections 43 and 45.
 */
export function mergeCitedSources(
  extracted: CitedSource[],
  structuredUrls: string[] | undefined,
): CitedSource[] {
  const seen = new Set<string>();
  const merged: CitedSource[] = [];

  for (const url of structuredUrls ?? []) {
    try {
      const domain = new URL(url).hostname.replace(/^www\./, "");
      if (!seen.has(domain)) {
        seen.add(domain);
        merged.push({ domain, url, origin: "retrieved" });
      }
    } catch {
      /* malformed URL */
    }
  }

  for (const s of extracted) {
    if (!seen.has(s.domain)) {
      seen.add(s.domain);
      merged.push(s);
    }
  }

  return merged;
}

/** Task #45: entries stored before this task (no per-entry `origin` at
 * all) are inferred from the engine alone -- citation-supplying engines
 * (Perplexity) are assumed "retrieved" (structured URLs were always
 * listed first by mergeCitedSources, so almost every pre-existing entry
 * for that engine genuinely was one), everything else "recalled" (the
 * other three engines never had a structured source to begin with). Not
 * a per-URL re-derivation -- the original structured list was never
 * itself persisted separately, only the merged citedSources array. */
export function resolveCitationOrigin(
  entry: { origin?: CitationOrigin },
  engine: Engine,
): CitationOrigin {
  if (entry.origin) return entry.origin;
  return ENGINE_SUPPLIES_STRUCTURED_CITATIONS[engine] ? "retrieved" : "recalled";
}

/**
 * Task #45 follow-up: registrable-domain (eTLD+1) reduction for
 * top_domains roll-ups (e.g. "blog.hipages.com.au" -> "hipages.com.au"),
 * backed by `tldts` -- a maintained, TypeScript-native Public Suffix
 * List implementation with zero runtime dependencies -- rather than a
 * hand-rolled suffix list. The original hand-rolled version only knew
 * com.au/net.au/org.au/co.nz, so every OTHER multi-part AU suffix
 * (gov.au, edu.au, asn.au, id.au, and the state-government
 * nsw.gov.au/vic.gov.au/etc. shapes) silently fell through to a plain
 * "last two labels" reduction -- collapsing e.g.
 * "fairtrading.nsw.gov.au" down to "gov.au", merging every unrelated
 * government agency's citations into one row. Preferred over `psl`
 * (less actively maintained, no built-in types).
 *
 * Task #46: `getDomain()` alone (the original implementation here) is
 * too lenient for count-integrity purposes -- it happily returns
 * "example.invalidmadeuptld" or "report.pdf" as if they were real
 * registrable domains, because its fallback behaviour treats ANY
 * unrecognised final label as if it might be an obscure-but-real TLD,
 * rather than rejecting it. `parse()` exposes `isIcann`, which is
 * `true` only when the matched suffix is a genuine ICANN-delegated TLD
 * (confirmed via direct testing against tldts: "x.pdf"/"report.pdf"/
 * "example.invalidmadeuptld" all get `isIcann: false`, while every
 * previously-tested real case -- com.au, com, co.nz, gov.au, even the
 * Google-run gTLD ".page" -- is `isIcann: true`). Checking `isIcann`
 * is what actually delivers "a valid ICANN registrable domain", not
 * just "a syntactically domain-shaped string".
 */
export function toRegistrableDomain(hostname: string): string | null {
  const result = parse(hostname);
  if (!result.isIcann || !result.domain) return null;
  return result.domain;
}

const GOV_EDU_AU_SUFFIX = /\.(gov|edu)\.au$/;

/**
 * Task #46 Part D: for gov.au/edu.au, the registrable domain is too
 * coarse -- tldts correctly reduces "fairtrading.nsw.gov.au" to
 * "nsw.gov.au" (nsw.gov.au is itself the PSL's public suffix there),
 * which is right for eTLD+1 purposes but wrong for THIS product: NSW
 * Fair Trading, Service NSW, and every other nsw.gov.au agency are
 * different departments a tradie cares about separately (licence
 * verification, consumer complaints, business registration are
 * different journeys). For these two suffixes only, group/display by
 * the full hostname (minus "www.") instead. Every other domain keeps
 * the normal registrable-domain grouping (toRegistrableDomain).
 * Returns null under the same conditions toRegistrableDomain does --
 * callers that already checked validity there can treat a null here as
 * "won't happen".
 */
export function toDisplayDomain(hostname: string): string | null {
  const registrable = toRegistrableDomain(hostname);
  if (registrable === null) return null;
  if (!GOV_EDU_AU_SUFFIX.test(registrable) && registrable !== "gov.au" && registrable !== "edu.au") {
    return registrable;
  }
  return hostname
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^www\./, "");
}

/**
 * Task #46 (6th follow-up): the one shared "is this domain the brand's
 * own" check. Registrable-domain-to-registrable-domain equality, built
 * on toRegistrableDomain -- so a www./subdomain variant of the brand's
 * domain still matches, and a domain that merely CONTAINS the brand's
 * domain as a substring (a competitor like bondiplumbingservices.com.au,
 * or a hallucinated bondiplumbing.com.au.evil.example) never does. A
 * missing or unparseable brand domain never matches anything. Replaces
 * classifySourceTypeWithBrand's substring-of-URL check and
 * citation-intelligence.ts's previously-inline equivalent of this same
 * comparison -- see docs/ops/post-launch-db-hardening.md section 46
 * (6th follow-up).
 */
export function isBrandDomain(urlOrHost: string, brandDomain: string | null | undefined): boolean {
  if (!brandDomain) return false;
  const brandRegistrable = toRegistrableDomain(brandDomain);
  if (brandRegistrable === null) return false;

  let host: string;
  try {
    host = urlOrHost.includes("://") ? new URL(urlOrHost).hostname : urlOrHost;
  } catch {
    return false;
  }
  const candidateRegistrable = toRegistrableDomain(host);
  return candidateRegistrable !== null && candidateRegistrable === brandRegistrable;
}
