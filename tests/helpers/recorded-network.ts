/**
 * S01B part 3 (LLD amendment 50): the answers tests use instead of the network. The whole unit and integration run
 * with the network guard on (tests/no-network.setup.ts) found two kinds of live call, both from code under test that
 * survived the failure, so the tests had passed while reaching the internet:
 * - the inline audit runner's recommendation step searching Wikipedia for the fixture business
 *   (lib/audit/run-audit-inline.ts -> gatherRecommendationEvidence -> checkWikipediaAuStatus,
 *   lib/brand-entity/wikipedia-au.ts: en.wikipedia.org);
 * - the Agent Analytics routes fetching a fixture brand's made-up site through the guarded fetcher (cdn-join:
 *   fetchRobotsTxt; coverage: crawlSite -- lib/crawler, lib/fetch/guarded-fetch.ts).
 * Each test file mocks the module it reaches with one of these:
 *
 *   vi.mock("@/lib/brand-entity/wikipedia-au", async (importOriginal) =>
 *     (await import("@/tests/helpers/recorded-network")).recordedWikipedia(importOriginal));
 */

/** What MediaWiki's search answers for an invented business: no hits, so "no article found". */
export const RECORDED_WIKIPEDIA_NO_HITS = {
  batchcomplete: "",
  query: { searchinfo: { totalhits: 0 }, search: [] },
} as const;

/** lib/brand-entity/wikipedia-au with its search answered by RECORDED_WIKIPEDIA_NO_HITS (no fetch). */
export async function recordedWikipedia<T extends object>(importOriginal: () => Promise<T>) {
  const actual = await importOriginal();
  return {
    ...actual,
    checkWikipediaAuStatus: async (brandName: string) =>
      brandName
        ? { status: "not_found" as const, query: `${brandName} Australia` }
        : { status: "unavailable" as const, reason: "no brand name", query: " Australia" },
  };
}

/** lib/fetch/guarded-fetch with every request answered as a site with nothing on it would answer it: 404. */
export async function recordedEmptySite<T extends object>(importOriginal: () => Promise<T>) {
  const actual = await importOriginal();
  return {
    ...actual,
    guardedFetch: async () =>
      new Response("Not Found", { status: 404, headers: { "content-type": "text/plain" } }),
  };
}
