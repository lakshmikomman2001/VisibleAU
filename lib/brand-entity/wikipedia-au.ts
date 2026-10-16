interface WikipediaAuResult {
  wikipediaAuPresent: boolean;
  wikipediaAuUrl: string | null;
  wikipediaAuMentions: number;
}

/**
 * Three states, not two: "unavailable" (the API errored, timed out, or
 * returned something unparseable) must never be read as "no article
 * exists" -- the recommendation engine only claims a confirmed absence on
 * "not_found". (checkWikipediaAu below keeps its original two-state
 * contract for the Brand & Entity audit, where both collapse to false.)
 */
export type WikipediaAuStatus =
  | { status: "found"; url: string; mentions: number; query: string }
  | { status: "not_found"; query: string }
  | { status: "unavailable"; reason: string; query: string };

interface WikipediaSearchHit {
  title: string;
  snippet: string;
}

function parseSearchHits(data: unknown): WikipediaSearchHit[] | null {
  if (typeof data !== "object" || data === null) return null;
  const query = (data as { query?: unknown }).query;
  if (typeof query !== "object" || query === null) return null;
  const search = (query as { search?: unknown }).search;
  if (!Array.isArray(search)) return null;
  const hits: WikipediaSearchHit[] = [];
  for (const raw of search) {
    if (typeof raw !== "object" || raw === null) continue;
    const title = (raw as { title?: unknown }).title;
    const snippet = (raw as { snippet?: unknown }).snippet;
    if (typeof title !== "string") continue;
    hits.push({ title, snippet: typeof snippet === "string" ? snippet : "" });
  }
  return hits;
}

export async function checkWikipediaAuStatus(brandName: string): Promise<WikipediaAuStatus> {
  const query = `${brandName} Australia`;
  if (!brandName) return { status: "unavailable", reason: "no brand name", query };

  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=5`;
    const res = await fetch(searchUrl, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { status: "unavailable", reason: `HTTP ${res.status}`, query };

    const hits = parseSearchHits(await res.json());
    if (hits === null) return { status: "unavailable", reason: "unexpected response", query };
    if (hits.length === 0) return { status: "not_found", query };

    const topResult = hits[0];
    const namePattern = new RegExp(brandName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const mentions = (topResult.snippet.match(namePattern) ?? []).length;

    const hasBrandInTitle = topResult.title.toLowerCase().includes(brandName.toLowerCase());
    if (!hasBrandInTitle && mentions === 0) return { status: "not_found", query };

    return {
      status: "found",
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(topResult.title.replace(/ /g, "_"))}`,
      mentions: Math.max(1, mentions),
      query,
    };
  } catch (err) {
    return {
      status: "unavailable",
      reason: err instanceof Error ? err.message : "request failed",
      query,
    };
  }
}

export async function checkWikipediaAu(brandName: string): Promise<WikipediaAuResult> {
  const result = await checkWikipediaAuStatus(brandName);
  if (result.status !== "found") {
    return { wikipediaAuPresent: false, wikipediaAuUrl: null, wikipediaAuMentions: 0 };
  }
  return {
    wikipediaAuPresent: true,
    wikipediaAuUrl: result.url,
    wikipediaAuMentions: result.mentions,
  };
}
