export interface DirectoryResult {
  directory: string;
  present: boolean;
  url: string | null;
  reviewCount: number | null;
  avgRating: number | null;
  name: string | null;
  address: string | null;
  phone: string | null;
}

interface DirectoryConfig {
  key: string;
  label: string;
  searchUrl: (brandName: string, suburb?: string) => string;
}

const DIRECTORIES: DirectoryConfig[] = [
  {
    key: "hipages",
    label: "Hipages",
    searchUrl: (name) =>
      `https://hipages.com.au/companies/search?q=${encodeURIComponent(name)}`,
  },
  {
    key: "yellow_pages_au",
    label: "Yellow Pages AU",
    searchUrl: (name, suburb) =>
      `https://www.yellowpages.com.au/search/listings?q=${encodeURIComponent(name)}${suburb ? `&locationClue=${encodeURIComponent(suburb)}` : ""}`,
  },
  {
    key: "service_seeking",
    label: "ServiceSeeking",
    searchUrl: (name) =>
      `https://www.serviceseeking.com.au/services/all?q=${encodeURIComponent(name)}`,
  },
  {
    key: "word_of_mouth",
    label: "Word of Mouth",
    searchUrl: (name) =>
      `https://www.womo.com.au/search/?q=${encodeURIComponent(name)}`,
  },
];

async function checkSingleDirectory(
  config: DirectoryConfig,
  brandName: string,
  suburb?: string,
): Promise<DirectoryResult> {
  const base: DirectoryResult = {
    directory: config.key,
    present: false,
    url: null,
    reviewCount: null,
    avgRating: null,
    name: null,
    address: null,
    phone: null,
  };

  try {
    const url = config.searchUrl(brandName, suburb);
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; VisibleAU/1.0; +https://visibleau.com)",
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) return base;

    const html = await res.text();
    const nameLower = brandName.toLowerCase();
    const found = html.toLowerCase().includes(nameLower);

    if (found) {
      base.present = true;
      base.url = url;
    }
  } catch {
    // Timeout or network error — mark as not present
  }

  return base;
}

export async function checkAuDirectories(
  _domain: string,
  brandName: string,
  suburb?: string,
): Promise<DirectoryResult[]> {
  const results: DirectoryResult[] = [];
  for (const dir of DIRECTORIES) {
    const result = await checkSingleDirectory(dir, brandName, suburb);
    results.push(result);
    // Rate limit: 1s between directory requests
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return results;
}
