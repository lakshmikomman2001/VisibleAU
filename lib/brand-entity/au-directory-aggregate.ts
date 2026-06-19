interface DirectoryPresence {
  name: string;
  present: boolean;
  url: string | null;
}

interface AuDirectoryResult {
  auDirectoryCount: number;
  auDirectoryPresence: DirectoryPresence[];
}

const AU_DIRECTORIES = [
  {
    name: "Hipages",
    searchUrl: (brand: string) =>
      `https://hipages.com.au/find/${encodeURIComponent(brand.toLowerCase().replace(/\s/g, "-"))}`,
  },
  {
    name: "Yellow Pages AU",
    searchUrl: (brand: string) =>
      `https://www.yellowpages.com.au/find/${encodeURIComponent(brand.toLowerCase())}`,
  },
  {
    name: "ServiceSeeking",
    searchUrl: (brand: string) =>
      `https://www.serviceseeking.com.au/search?term=${encodeURIComponent(brand)}`,
  },
  {
    name: "Word of Mouth",
    searchUrl: (brand: string) =>
      `https://www.wordofmouth.com.au/search?q=${encodeURIComponent(brand)}`,
  },
];

async function checkDirectory(
  dir: (typeof AU_DIRECTORIES)[number],
  brandName: string,
): Promise<DirectoryPresence> {
  try {
    const url = dir.searchUrl(brandName);
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "VisibleAU-Audit-Bot/1.0" },
      redirect: "follow",
    });
    if (res.ok || res.status === 301 || res.status === 302) {
      return { name: dir.name, present: true, url };
    }
    return { name: dir.name, present: false, url: null };
  } catch {
    return { name: dir.name, present: false, url: null };
  }
}

export async function checkAuDirectories(brandName: string): Promise<AuDirectoryResult> {
  if (!brandName) return { auDirectoryCount: 0, auDirectoryPresence: [] };

  const results = await Promise.all(AU_DIRECTORIES.map((dir) => checkDirectory(dir, brandName)));
  const presentCount = results.filter((r) => r.present).length;

  return { auDirectoryCount: presentCount, auDirectoryPresence: results };
}
