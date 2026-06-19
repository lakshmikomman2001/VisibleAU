interface WikipediaAuResult {
  wikipediaAuPresent: boolean;
  wikipediaAuUrl: string | null;
  wikipediaAuMentions: number;
}

export async function checkWikipediaAu(brandName: string): Promise<WikipediaAuResult> {
  const empty: WikipediaAuResult = {
    wikipediaAuPresent: false,
    wikipediaAuUrl: null,
    wikipediaAuMentions: 0,
  };
  if (!brandName) return empty;

  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(brandName + " Australia")}&format=json&srlimit=5`;
    const res = await fetch(searchUrl, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return empty;

    const data = await res.json();
    const results = data?.query?.search ?? [];
    if (results.length === 0) return empty;

    const topResult = results[0];
    const title = topResult.title as string;
    const snippet = (topResult.snippet as string) ?? "";
    const namePattern = new RegExp(brandName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const mentions = (snippet.match(namePattern) ?? []).length;

    const hasBrandInTitle = title.toLowerCase().includes(brandName.toLowerCase());
    if (!hasBrandInTitle && mentions === 0) return empty;

    return {
      wikipediaAuPresent: true,
      wikipediaAuUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
      wikipediaAuMentions: Math.max(1, mentions),
    };
  } catch {
    return empty;
  }
}
