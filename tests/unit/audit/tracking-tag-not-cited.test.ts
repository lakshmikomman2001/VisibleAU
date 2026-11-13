/**
 * 13 Nov follow-up, item 6 (the side finding from part 5): ChatGPT tags each link it gives with
 * "?utm_source=chatgpt.com", and extractCitations' bare-domain pass read that tag as a cited site, so chatgpt.com
 * counted as a source of the answer. An engine's own domain (or any other) inside a tracking tag is never a cited
 * site now; the URL itself is kept exactly as stored, and a site the answer names in its own words still counts.
 */
import { describe, expect, it } from "vitest";
import { extractCitations } from "@/lib/audit/extract-citations";
import { linkHref, withoutTrackingValues } from "@/lib/urls/strip-tracking";

const YP =
  "https://www.yellowpages.com.au/find/handyman-services/yennora-nsw-2161?utm_source=chatgpt.com";
const domains = (text: string) => extractCitations(text).map((s) => s.domain);

describe("a tracking tag is not a cited site", () => {
  it("a markdown link tagged utm_source=chatgpt.com cites the page's site, not chatgpt.com", () => {
    expect(domains(`Try [Yellow Pages](${YP}) for handymen.`)).toEqual(["yellowpages.com.au"]);
  });

  it("a bare URL the same", () => {
    expect(domains(`See ${YP}, or ask a neighbour.`)).toEqual(["yellowpages.com.au"]);
  });

  it("any engine's domain, in any tracking parameter, after other parameters", () => {
    const url =
      "https://www.hipages.com.au/connect/omega?page=2&utm_medium=referral&utm_source=copilot.microsoft.com&gclid=perplexity.io";
    expect(domains(`[hipages](${url})`)).toEqual(["hipages.com.au"]);
  });

  it("the stored URL keeps its tags exactly as the answer gave it", () => {
    const [source] = extractCitations(`Try [Yellow Pages](${YP}).`);
    expect(source).toEqual({ domain: "yellowpages.com.au", url: YP, origin: "recalled" });
  });

  it("a site the answer names in its own words still counts, chatgpt.com included", () => {
    expect(domains("You could also ask on chatgpt.com, or check oneflare.com.au.")).toEqual([
      "chatgpt.com",
      "oneflare.com.au",
    ]);
  });
});

describe("withoutTrackingValues", () => {
  it("empties tracking parameters' values and keeps every other parameter and the fragment", () => {
    expect(
      withoutTrackingValues(
        "a https://x.com.au/find?clue=electrician&utm_source=chatgpt.com&utm_medium=referral#reviews b",
      ),
    ).toBe("a https://x.com.au/find?clue=electrician&utm_source=&utm_medium=#reviews b");
    expect(withoutTrackingValues("no tags at https://x.com.au/a?id=7")).toBe(
      "no tags at https://x.com.au/a?id=7",
    );
  });

  it("uses the same parameter list as the links (linkHref)", () => {
    for (const key of ["utm_source", "gclid", "fbclid", "msclkid", "srsltid"]) {
      const url = `https://x.com.au/?${key}=chatgpt.com`;
      expect(linkHref(url)).toBe("https://x.com.au/");
      expect(withoutTrackingValues(url)).toBe(`https://x.com.au/?${key}=`);
    }
  });
});
