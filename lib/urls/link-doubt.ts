/**
 * 13 Nov follow-up, item 5 (part 5's recommendation; Sri approved it). Audit #48 listed
 * yellowpages.com.au/yennora-nsw-2161-nsw-2161-nsw-2161-nsw-2161-nsw-2161/handyman-services among the pages AI
 * cited: the string came from the AI's answer as stored (our code shows it unchanged). A cited page we can't vouch
 * for is marked "This link may not work", from what's already stored -- nothing is fetched, and the link still
 * opens the URL as stored:
 * - "written_by_ai": the AI wrote the URL in its answer's text (origin "recalled"), rather than its engine
 *   returning it as a search result ("retrieved"). A bare domain the answer named ("hipages.com.au", stored as
 *   https://hipages.com.au) is a site, not a page anyone typed, so it isn't marked;
 * - "repeated_path": its path repeats the same part three or more times in a row, the shape of a mistyped or
 *   runaway link ("nsw-2161" five times above, or /nsw/nsw/nsw).
 */
export type LinkDoubt = "written_by_ai" | "repeated_path";

export const LINK_MAY_NOT_WORK = "This link may not work";

const REASONS: Record<LinkDoubt, string> = {
  written_by_ai:
    "The AI wrote this link in its answer; it wasn't one of the pages its search returned, so it may not exist.",
  repeated_path:
    "This link's address repeats the same part over and over, so it may have been mistyped.",
};

/** Why a link is marked, for its tooltip. */
export function linkDoubtReason(doubt: LinkDoubt): string {
  return REASONS[doubt];
}

/** The path's words ("yennora", "nsw", "2161", ...), split at "/", "-", "_" and ".". */
function pathTokens(url: URL): string[] {
  return url.pathname
    .split(/[/\-_.]+/)
    .filter(Boolean)
    .map((t) => t.toLowerCase());
}

/** Whether a run of one to three words repeats three or more times in a row. */
export function hasRepeatedPath(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  const tokens = pathTokens(url);
  for (let size = 1; size <= 3; size++) {
    for (let start = 0; start + size * 3 <= tokens.length; start++) {
      const unit = tokens.slice(start, start + size).join("/");
      let repeats = 1;
      while (
        start + size * (repeats + 1) <= tokens.length &&
        tokens.slice(start + size * repeats, start + size * (repeats + 1)).join("/") === unit
      ) {
        repeats++;
      }
      if (repeats >= 3) return true;
    }
  }
  return false;
}

/** A page, not just a site: something after the host. */
function namesAPage(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.pathname.replace(/\/+$/, "") !== "" || url.search !== "";
  } catch {
    return false;
  }
}

/**
 * Why a cited link may not work, or null. `origin` is the stored source's ("retrieved" / "recalled"); pass it as
 * undefined where it isn't stored (an Action Center evidence link), and only the address itself is judged.
 */
export function linkDoubt(source: { url: string; origin?: string }): LinkDoubt | null {
  if (hasRepeatedPath(source.url)) return "repeated_path";
  if (source.origin === "recalled" && namesAPage(source.url)) return "written_by_ai";
  return null;
}
