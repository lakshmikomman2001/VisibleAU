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

export function extractCitations(response: string): CitedSource[] {
  const seen = new Set<string>();
  const sources: CitedSource[] = [];

  const markdownLinks = [...response.matchAll(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi)];
  for (const m of markdownLinks) {
    const url = m[2];
    const domain = new URL(url).hostname.replace(/^www\./, "");
    if (!seen.has(domain)) {
      seen.add(domain);
      sources.push({ domain, url, origin: "recalled" });
    }
  }

  const bareUrls = [...response.matchAll(/https?:\/\/[^\s,)>'"]+/gi)];
  for (const m of bareUrls) {
    const url = m[0].replace(/[.,;)]+$/, "");
    try {
      const domain = new URL(url).hostname.replace(/^www\./, "");
      if (!seen.has(domain)) {
        seen.add(domain);
        sources.push({ domain, url, origin: "recalled" });
      }
    } catch {
      /* malformed URL */
    }
  }

  const domainRefs = [
    ...response.matchAll(
      /\b([a-z0-9]([a-z0-9-]*[a-z0-9])?\.(?:com\.au|com|net|org|io|co\.nz))\b/gi,
    ),
  ];
  for (const m of domainRefs) {
    const domain = m[1].toLowerCase();
    if (!seen.has(domain)) {
      seen.add(domain);
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

const AU_STYLE_SUFFIXES = new Set(["com.au", "net.au", "org.au", "co.nz"]);

/**
 * Task #45: best-effort registrable-domain reduction for top_domains
 * roll-ups (e.g. "blog.hipages.com.au" -> "hipages.com.au") -- not a
 * full public-suffix-list implementation (no such dependency exists in
 * this project), just the handful of AU-relevant multi-part suffixes
 * already used throughout lib/visibility/citation-source-classifier.ts
 * and this file's own domainRefs pattern. "Where practical": a hostname
 * that doesn't match a known suffix shape is returned unchanged rather
 * than guessed at.
 */
export function toRegistrableDomain(hostname: string): string {
  const h = hostname.toLowerCase().replace(/^www\./, "");
  const labels = h.split(".");
  if (labels.length <= 2) return h;

  const lastTwo = labels.slice(-2).join(".");
  if (AU_STYLE_SUFFIXES.has(lastTwo) && labels.length > 3) {
    return labels.slice(-3).join(".");
  }
  if (!AU_STYLE_SUFFIXES.has(lastTwo) && labels.length > 2) {
    return labels.slice(-2).join(".");
  }
  return h;
}
