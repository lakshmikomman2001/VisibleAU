export interface WikidataResult {
  present: boolean;
  url: string | null;
}

export async function checkWikidata(
  entityName: string,
  brandDomain?: string,
): Promise<WikidataResult> {
  if (process.env.LLM_MODE === "mock") {
    return { present: false, url: null };
  }

  try {
    const query = encodeURIComponent(entityName);
    const res = await fetch(
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${query}&language=en&format=json&limit=5`,
    );

    if (!res.ok) return { present: false, url: null };

    const data = (await res.json()) as { search?: Array<{ id: string; label: string; description?: string }> };

    if (!data.search?.length) return { present: false, url: null };

    const match = data.search.find((item) => {
      const labelMatch = item.label.toLowerCase() === entityName.toLowerCase();
      const descMatch = brandDomain
        ? item.description?.toLowerCase().includes(brandDomain.toLowerCase())
        : false;
      return labelMatch || descMatch;
    });

    if (match) {
      return {
        present: true,
        url: `https://www.wikidata.org/wiki/${match.id}`,
      };
    }

    return { present: false, url: null };
  } catch {
    return { present: false, url: null };
  }
}
