/** "listed": the brand was genuinely confirmed present on the page.
 * "not_listed": the page loaded (or genuinely 404'd) and the brand is
 * confirmed absent -- a real negative.
 * "unverifiable": the directory blocked or failed the check (403/401/429/
 * network error/timeout) -- we have no evidence either way, so this must
 * never be reported as "not listed" (task KK). */
export type DirectoryStatus = "listed" | "not_listed" | "unverifiable";

interface DirectoryPresence {
  name: string;
  /** True only when status === "listed". Kept as the field the numeric
   * scorer sums -- an "unverifiable" directory contributes 0, same as
   * "not_listed", but must never be asserted as a confirmed absence. */
  present: boolean;
  status: DirectoryStatus;
  url: string | null;
  finding: string;
}

interface AuDirectoryResult {
  auDirectoryCount: number;
  auDirectoryPresence: DirectoryPresence[];
}

export const AU_DIRECTORIES = [
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

// A bot-identifying UA gets 403'd by several of these directories
// regardless of whether the brand is actually listed -- a realistic
// browser UA reduces that false-"unverifiable" rate (task KK).
const DIRECTORY_CHECK_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const BLOCKED_STATUS_CODES = new Set([401, 403, 429]);

export async function checkDirectory(
  dir: (typeof AU_DIRECTORIES)[number],
  brandName: string,
): Promise<DirectoryPresence> {
  const url = dir.searchUrl(brandName);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": DIRECTORY_CHECK_UA },
      redirect: "follow",
    });

    if (BLOCKED_STATUS_CODES.has(res.status)) {
      return {
        name: dir.name,
        present: false,
        status: "unverifiable",
        url: null,
        finding: `Couldn't verify — ${dir.name} blocked the check.`,
      };
    }

    if (!res.ok) {
      return {
        name: dir.name,
        present: false,
        status: "not_listed",
        url: null,
        finding: `Not found on ${dir.name}.`,
      };
    }

    // A 200 search-results page isn't itself proof of a listing -- it's
    // just as likely to be a "no results" page. Only the brand's own name
    // actually appearing in the response counts as confirmed presence.
    const body = await res.text();
    const listed = body.toLowerCase().includes(brandName.toLowerCase());

    return listed
      ? { name: dir.name, present: true, status: "listed", url, finding: `Listed on ${dir.name}.` }
      : {
          name: dir.name,
          present: false,
          status: "not_listed",
          url: null,
          finding: `Not found on ${dir.name}.`,
        };
  } catch {
    // Timeout (AbortSignal) or a network-level failure -- same "we
    // couldn't confirm either way" treatment as a blocked status code.
    return {
      name: dir.name,
      present: false,
      status: "unverifiable",
      url: null,
      finding: `Couldn't verify — ${dir.name} blocked the check.`,
    };
  }
}

export async function checkAuDirectories(brandName: string): Promise<AuDirectoryResult> {
  if (!brandName) return { auDirectoryCount: 0, auDirectoryPresence: [] };

  const results = await Promise.all(AU_DIRECTORIES.map((dir) => checkDirectory(dir, brandName)));
  const presentCount = results.filter((r) => r.present).length;

  return { auDirectoryCount: presentCount, auDirectoryPresence: results };
}
