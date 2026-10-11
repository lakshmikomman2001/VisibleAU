export interface CitedSource {
  domain: string;
  url: string;
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
      sources.push({ domain, url });
    }
  }

  const bareUrls = [...response.matchAll(/https?:\/\/[^\s,)>'"]+/gi)];
  for (const m of bareUrls) {
    const url = m[0].replace(/[.,;)]+$/, "");
    try {
      const domain = new URL(url).hostname.replace(/^www\./, "");
      if (!seen.has(domain)) {
        seen.add(domain);
        sources.push({ domain, url });
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
      sources.push({ domain, url: `https://${domain}` });
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
 * different merge behaviours. See
 * docs/ops/post-launch-db-hardening.md section 43.
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
        merged.push({ domain, url });
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
