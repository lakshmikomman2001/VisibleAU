import { describe, expect, it } from "vitest";
import {
  classifyCitedSources,
  classifySourceType,
  classifySourceTypeWithBrand,
  getEngineAffinity,
} from "@/lib/visibility/citation-source-classifier";

describe("citation-source-classifier", () => {
  it("classifies Reddit URLs", () => {
    expect(classifySourceType("https://reddit.com/r/australia/comments/abc")).toBe("reddit_thread");
  });

  it("classifies LinkedIn URLs", () => {
    expect(classifySourceType("https://linkedin.com/posts/someone")).toBe("linkedin_post");
  });

  it("classifies YouTube URLs", () => {
    expect(classifySourceType("https://youtube.com/watch?v=abc")).toBe("youtube_video");
    expect(classifySourceType("https://youtu.be/abc")).toBe("youtube_video");
  });

  it("classifies Wikipedia URLs", () => {
    expect(classifySourceType("https://en.wikipedia.org/wiki/Something")).toBe("wikipedia");
  });

  it("classifies AU directory URLs", () => {
    expect(classifySourceType("https://yellowpages.com.au/find/plumber")).toBe("au_directory");
    expect(classifySourceType("https://truelocal.com.au/business")).toBe("au_directory");
  });

  // Task #41: these are the real AU trade directories/marketplaces that
  // were missing from URL_PATTERNS -- citations to them fell through to
  // "other" despite au_directory's own seed description
  // (db/seed/citation-source-affinity.ts) already naming Hipages as an
  // example.
  it("classifies the previously-missing real AU trade directories as au_directory, not 'other'", () => {
    expect(classifySourceType("https://hipages.com.au/connect/plumber")).toBe("au_directory");
    expect(classifySourceType("https://www.oneflare.com.au/profile/abc")).toBe("au_directory");
    expect(classifySourceType("https://www.airtasker.com/tasks/plumbing")).toBe("au_directory");
    expect(classifySourceType("https://www.serviceseeking.com.au/plumbers")).toBe("au_directory");
  });

  it("classifies review site URLs", () => {
    expect(classifySourceType("https://productreview.com.au/p/brand")).toBe("review_site");
    expect(classifySourceType("https://trustpilot.com/review/brand")).toBe("review_site");
  });

  it("classifies Google Business Profile as review_site (same local-business/review data surface as google.com/maps)", () => {
    expect(classifySourceType("https://business.google.com/abc")).toBe("review_site");
    expect(classifySourceType("https://g.page/bondiplumbing")).toBe("review_site");
  });

  it("classifies news URLs", () => {
    expect(classifySourceType("https://news.com.au/national/story")).toBe("news_article");
    expect(classifySourceType("https://abc.net.au/news/story")).toBe("news_article");
  });

  it("classifies brand-owned URLs", () => {
    expect(classifySourceTypeWithBrand("https://mybrand.com.au/about", "mybrand.com.au")).toBe(
      "brand_owned",
    );
  });

  // Task #46 (6th follow-up): classifySourceTypeWithBrand now goes
  // through the shared isBrandDomain() registrable-domain comparison
  // (lib/audit/extract-citations.ts) instead of a substring-of-URL
  // check -- this table is the exact scenario set the task asked for.
  it.each([
    ["https://www.bondiplumbing.com.au/contact", "bondiplumbing.com.au", true],
    ["bondiplumbing.com.au", "bondiplumbing.com.au", true],
    ["https://bondiplumbingservices.com.au", "bondiplumbing.com.au", false],
    ["https://hipages.com.au/connect/bondiplumbing", "bondiplumbing.com.au", false],
    ["https://bondiplumbing.com.au.evil.example", "bondiplumbing.com.au", false],
    ["https://WWW.BONDIPLUMBING.COM.AU/Contact", "bondiplumbing.com.au", true],
    ["https://bondiplumbing.com.au./contact", "bondiplumbing.com.au", true],
    ["https://bondiplumbing.com.au/contact", "", false],
  ] as const)("brand match for %s vs brandDomain=%s is %s", (url, brandDomain, expected) => {
    const type = classifySourceTypeWithBrand(url, brandDomain);
    expect(type === "brand_owned").toBe(expected);
    if (!expected) {
      // hipages.com.au still classifies as a real directory, never silently "other".
      if (url.includes("hipages.com.au")) expect(type).toBe("au_directory");
    }
  });

  it("returns 'other' for unrecognized URLs", () => {
    expect(classifySourceType("https://random-site.io/page")).toBe("other");
  });

  it("returns correct engine affinity", () => {
    expect(getEngineAffinity("reddit_thread")).toBe("perplexity_primary");
    expect(getEngineAffinity("linkedin_post")).toBe("chatgpt_primary");
    expect(getEngineAffinity("youtube_video")).toBe("gemini_primary");
    expect(getEngineAffinity("wikipedia")).toBe("all");
    expect(getEngineAffinity("other")).toBeNull();
  });

  // Task #46: womo.com.au (Word of Mouth) was already named in the
  // au_directory seed description but never actually matched by this
  // pattern list -- the same docs/code drift task #41 found for Hipages.
  it("classifies Word of Mouth as au_directory", () => {
    expect(classifySourceType("https://www.womo.com.au/biz/bondi-plumbing")).toBe("au_directory");
  });

  // Task #46 Part B: trade/industry bodies -- domains confirmed real via
  // web search (not guessed), seen in live Bondi audit data.
  it.each([
    ["https://mpansw.com.au/find-a-plumber", "industry_association"],
    ["https://www.masterplumbers.com.au/directory", "industry_association"],
    ["https://plumber.com.au/members", "industry_association"],
    ["https://www.masterbuilders.com.au/who-we-are", "industry_association"],
    ["https://hia.com.au/our-industry", "industry_association"],
  ])("classifies %s as %s", (url, expected) => {
    expect(classifySourceType(url)).toBe(expected);
  });

  // Task #46 Part B: government_regulator is matched by the gov.au
  // suffix itself, not by enumerating specific department domains.
  it.each([
    ["https://www.fairtrading.nsw.gov.au/licensing", "government_regulator"],
    ["https://www.service.nsw.gov.au/transaction/renew", "government_regulator"],
    ["https://www.business.gov.au/registration", "government_regulator"],
    ["https://www.qbcc.qld.gov.au/licensing", "government_regulator"],
  ])("classifies %s as %s", (url, expected) => {
    expect(classifySourceType(url)).toBe(expected);
  });

  // Task #46 follow-up: mpaq.com.au (QLD), masterplumbers.asn.au (WA)
  // and masterplumbersact.asn.au (ACT) -- each independently
  // web-verified (see the classifier's own doc comment for the
  // one-line source per domain), not guessed state-TLD variants.
  it.each([
    ["https://www.mpaq.com.au/find-a-plumber", "industry_association"],
    ["https://masterplumbers.asn.au/members", "industry_association"],
    ["https://www.masterplumbersact.asn.au/find-a-plumber", "industry_association"],
  ])("classifies %s as %s", (url, expected) => {
    expect(classifySourceType(url)).toBe(expected);
  });

  // masterplumbersact.asn.au contains "masterplumbers" as a substring --
  // confirms the ACT domain's own \b anchoring doesn't let the WA/national
  // masterplumbers.asn.au or masterplumbers.com.au patterns swallow it,
  // and vice versa; each remains a distinct, exact-domain match.
  it("does not cross-match masterplumbersact.asn.au against the WA or national Master Plumbers domains", () => {
    expect(classifySourceType("https://masterplumbersact.asn.au/about")).toBe("industry_association");
    expect(classifySourceType("https://masterplumbers.asn.au/about")).toBe("industry_association");
    expect(classifySourceType("https://masterplumbers.com.au/about")).toBe("industry_association");
  });

  // Task #46: "plumber.com.au"/"hia.com.au" are common enough substrings
  // that an unanchored pattern would also match an UNRELATED real
  // business's own domain merely ending in these characters -- a
  // genuine competitor, not the industry body. \b anchoring in the
  // classifier must prevent this.
  it("does NOT classify an unrelated business domain that merely ends in 'plumber.com.au' as industry_association", () => {
    expect(classifySourceType("https://bobsplumber.com.au/contact")).toBe("other");
    expect(classifySourceType("https://sydneyplumber.com.au/services")).toBe("other");
  });

  // Task #46 (3rd follow-up): candidates seen in Perplexity's retrieved
  // sources against live Bondi data, each independently web-verified
  // before classifying (see the classifier's own doc comment for the
  // one-line justification per domain).
  it.each([
    ["https://www.wordofmouth.com.au/biz/bondi-plumbing", "au_directory"],
    ["https://servicetasker.com.au/task/plumber-sydney", "au_directory"],
    ["https://www.homedone.com.au/plumbers/sydney", "au_directory"],
    ["https://www.bestinhood.com/sydney/plumbers", "review_site"],
  ])("classifies %s as %s", (url, expected) => {
    expect(classifySourceType(url)).toBe(expected);
  });

  // Confirmed genuine businesses/ambiguous tools, not directories or
  // review aggregators -- deliberately left "other", not guessed at.
  it.each(["https://fixedtoday.com.au/our-difference", "https://www.starworks.com.au/"])(
    "leaves %s as 'other' -- a genuine business / ambiguous tool, not a directory or review site",
    (url) => {
      expect(classifySourceType(url)).toBe("other");
    },
  );

  // Task #46 (3rd follow-up): confirms a specific department subdomain
  // (verify.licence.nsw.gov.au) both classifies as government_regulator
  // (suffix-matched, same as any other gov.au host) and -- the Part D
  // concern from the prior follow-up -- groups by its own full
  // hostname, not collapsed to nsw.gov.au alongside every other NSW
  // department.
  it("verify.licence.nsw.gov.au classifies as government_regulator", () => {
    expect(classifySourceType("https://verify.licence.nsw.gov.au/check")).toBe(
      "government_regulator",
    );
  });

  it("classifies multiple cited sources at once", () => {
    const result = classifyCitedSources(
      [
        { url: "https://reddit.com/r/test" },
        { url: "https://mybrand.com.au/page" },
        { url: "https://random.com" },
      ],
      "mybrand.com.au",
    );

    expect(result).toHaveLength(3);
    expect(result[0].sourceType).toBe("reddit_thread");
    expect(result[1].sourceType).toBe("brand_owned");
    expect(result[2].sourceType).toBe("other");
  });
});
