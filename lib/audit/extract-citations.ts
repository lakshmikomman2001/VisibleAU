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
