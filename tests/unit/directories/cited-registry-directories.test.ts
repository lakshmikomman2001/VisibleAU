/**
 * S00 part 5 (22 Nov; LLD 8.8.3, T6): the audit's directory panel and the report's "Where AI looks" show any
 * registry directory the audit's answers cited, with its kind; a domain the registry doesn't know is never called
 * a directory. A brand's own type's directories show as before (cited or not); the advice reads only those.
 *
 * - TechCore IT, audit #52's shape (a general local business): Local Business Guide, Directso, Whereis, LinkedIn,
 *   Nextdoor, Birdeye and Cylex were cited and not shown; now each is, with its count and kind.
 * - Hero Home Services, audit #54's shape (a trades business): the ten relevant directories' figures are what they
 *   were; a directory appears beside them only when an answer cites it.
 * The audits' own answers are production data (not in the repo); these are answers' cited sources in their shape.
 */
import { describe, expect, it, vi } from "vitest";
import { citations } from "@/db/schema";
import { getDirectoryCitationsForAudit } from "@/lib/directories/citation-counts";
import { DIRECTORY_KIND_LABELS } from "@/lib/directories/registry";
import { toDirectoryVisibility } from "@/lib/recommendations/gather-evidence";

type Row = Record<string, unknown>;

function mockTx(citationRows: Row[]) {
  const select = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockImplementation((table: unknown) => ({
      where: vi.fn().mockResolvedValue(table === citations ? citationRows : []),
    })),
  }));
  return { select } as unknown as Parameters<typeof getDirectoryCitationsForAudit>[0];
}

const source = (url: string) => ({
  domain: new URL(url).hostname,
  url,
  origin: "retrieved",
  cited: true,
});
const answer = (...urls: string[]) => ({ citedSources: urls.map(source) });

const TECHCORE = {
  id: "brand-techcore",
  region: "au",
  categories: ["general"],
  name: "TechCore IT",
  domain: "techcoreit.com.au",
};
const HERO = {
  id: "brand-hero",
  region: "au",
  categories: ["trades_general"],
  name: "Hero Home Services",
  domain: "herohomeservices.com.au",
};

/** Answers shaped like audit #52's: the directories T6 lists, plus pages that are no directory. */
const TECHCORE_52 = [
  answer("https://www.localbusinessguide.com.au/techcore-it", "https://techcoreit.com.au/services"),
  answer(
    "https://www.localbusinessguide.com.au/techcore-it",
    "https://www.directso.com.au/techcore-it",
  ),
  answer(
    "https://www.whereis.com/nsw/riverstone-2765/techcore-it",
    "https://au.linkedin.com/company/techcore-it",
  ),
  answer(
    "https://au.linkedin.com/company/techcore-it",
    "https://au.nextdoor.com/pages/techcore-it-riverstone",
  ),
  answer(
    "https://reviews.birdeye.com/techcore-it-123",
    "https://www.cylex-australia.com/company/techcore-it.html",
  ),
  answer("https://www.reddit.com/r/sydney/comments/x", "https://au.linkedin.com/in/a-person"),
  answer(
    "https://www.localbusinessguide.com.au/another",
    "https://www.cylex-australia.com/company/other.html",
  ),
];

describe("TechCore IT (audit #52's shape): every cited registry directory, with its count and kind", () => {
  it("lists Local Business Guide, Directso, Whereis, LinkedIn, Nextdoor, Birdeye and Cylex", async () => {
    const { results, totalAnswers } = await getDirectoryCitationsForAudit(
      mockTx(TECHCORE_52),
      "audit-52",
      TECHCORE,
    );
    expect(totalAnswers).toBe(7);
    const cited = results
      .filter((r) => r.citedCount > 0)
      .map((r) => [r.directory.name, r.citedCount, r.directory.kind, r.relevantToBrand]);
    expect(cited).toEqual([
      ["Local Business Guide", 3, "general", false],
      ["Directso", 1, "general", false],
      ["Whereis", 1, "maps", false],
      ["Cylex", 2, "general", false],
      ["Nextdoor", 1, "social", false],
      ["Birdeye", 1, "reviews", false],
      ["LinkedIn", 2, "professional", false],
    ]);
  });

  it("its own type's directories still show (none cited here), first, as before", async () => {
    const { results } = await getDirectoryCitationsForAudit(
      mockTx(TECHCORE_52),
      "audit-52",
      TECHCORE,
    );
    const relevant = results.filter((r) => r.relevantToBrand);
    expect(relevant.map((r) => r.directory.key)).toEqual([
      "yellow_pages_au",
      "true_local",
      "localsearch",
      "product_review",
      "word_of_mouth",
      "google_business_profile",
    ]);
    expect(relevant.every((r) => r.citedCount === 0)).toBe(true);
    expect(results.slice(0, 6)).toEqual(relevant);
  });

  it("the brand's own site, Reddit and a person's LinkedIn profile are never called directories", async () => {
    const { results } = await getDirectoryCitationsForAudit(
      mockTx(TECHCORE_52),
      "audit-52",
      TECHCORE,
    );
    const urls = results.flatMap((r) => r.citedUrls.map((u) => u.url));
    expect(urls).not.toContain("https://techcoreit.com.au/services");
    expect(urls.some((u) => u.includes("reddit.com"))).toBe(false);
    expect(urls).not.toContain("https://au.linkedin.com/in/a-person");
    expect(
      results.find((r) => r.directory.key === "linkedin")?.citedUrls.map((u) => u.url),
    ).toEqual(["https://au.linkedin.com/company/techcore-it"]);
  });

  it("each kind has its words", () => {
    expect(DIRECTORY_KIND_LABELS).toMatchObject({
      general: "general directory",
      maps: "maps",
      social: "community network",
    });
  });

  it("the advice reads the brand's own type's directories only, as before (none here)", async () => {
    const raw = await getDirectoryCitationsForAudit(mockTx(TECHCORE_52), "audit-52", TECHCORE);
    const evidence = toDirectoryVisibility(raw);
    expect(evidence.status === "ok" && evidence.data.findings).toEqual([]);
  });
});

/** Answers shaped like audit #54's: trades marketplaces and the general local directories. */
const HERO_54 = [
  answer(
    "https://hipages.com.au/connect/hero-home-services",
    "https://www.yellowpages.com.au/nsw/yennora/hero",
  ),
  answer("https://hipages.com.au/connect/other-handyman"),
  answer(
    "https://www.oneflare.com.au/b/hero-home-services",
    "https://www.localsearch.com.au/profile/hero",
  ),
  answer("https://www.wordofmouth.com.au/reviews/hero"),
  answer(),
];

describe("Hero Home Services (audit #54's shape): unchanged unless a new directory is cited", () => {
  it("the ten relevant directories, in order, with the counts they had; nothing else", async () => {
    const { results } = await getDirectoryCitationsForAudit(mockTx(HERO_54), "audit-54", HERO);
    expect(results.map((r) => [r.directory.key, r.citedCount, r.relevantToBrand])).toEqual([
      ["hipages", 2, true],
      ["serviceseeking", 0, true],
      ["oneflare", 1, true],
      ["airtasker", 0, true],
      ["yellow_pages_au", 1, true],
      ["true_local", 0, true],
      ["localsearch", 1, true],
      ["product_review", 0, true],
      ["word_of_mouth", 1, true],
      ["google_business_profile", 0, true],
    ]);
  });

  it("a cited Hotfrog page adds one row after them, and changes none of theirs", async () => {
    const before = await getDirectoryCitationsForAudit(mockTx(HERO_54), "audit-54", HERO);
    const withHotfrog = [
      ...HERO_54,
      answer("https://www.hotfrog.com.au/company/hero-home-services"),
    ];
    const after = await getDirectoryCitationsForAudit(mockTx(withHotfrog), "audit-54", HERO);
    expect(after.results.slice(0, 10).map((r) => [r.directory.key, r.citedCount])).toEqual(
      before.results.map((r) => [r.directory.key, r.citedCount]),
    );
    expect(
      after.results.slice(10).map((r) => [r.directory.name, r.citedCount, r.directory.kind]),
    ).toEqual([["Hotfrog", 1, "general"]]);
  });

  it("the advice is what it was: Hotfrog isn't in it", async () => {
    const withHotfrog = [
      ...HERO_54,
      answer("https://www.hotfrog.com.au/company/hero-home-services"),
    ];
    const evidence = toDirectoryVisibility(
      await getDirectoryCitationsForAudit(mockTx(withHotfrog), "audit-54", HERO),
    );
    const keys = evidence.status === "ok" ? evidence.data.findings.map((f) => f.key) : [];
    expect(keys).toEqual([
      "hipages",
      "oneflare",
      "yellow_pages_au",
      "localsearch",
      "word_of_mouth",
    ]);
  });
});
