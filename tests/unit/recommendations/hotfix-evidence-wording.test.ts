/**
 * Vunnara (21 Oct), item 2 -- the hotfix's own 3 named tests. Investigation
 * (file:line, in this hotfix's report-back) confirmed lib/recommendations/
 * triggers.ts + confidence-labels.ts already implement the rule this
 * hotfix asked for (evidence-driven-rules.test.ts already covers most of
 * it from before commit 5fe41c0) -- these are the hotfix's OWN explicit
 * regression tests, traceable to this fix, using production audit #30's
 * (Omega Services) real shape where it names specific numbers.
 */
import { describe, expect, it } from "vitest";
import type { DbClient } from "@/db/client";
import { buildRecommendations } from "@/lib/recommendations";
import { NO_EVIDENCE, type RecommendationEvidence } from "@/lib/recommendations/evidence";
import type { RecommendationWithConfidence, TriggerContext } from "@/lib/recommendations/types";

const noResearchDb = {
  select: () => ({ from: () => ({ where: async () => [] }) }),
} as unknown as DbClient;

function find(recs: RecommendationWithConfidence[], key: string) {
  return recs.find((r) => r.recommendationKey === key);
}

async function build(c: TriggerContext, e: RecommendationEvidence) {
  return buildRecommendations(c, noResearchDb, e);
}

// Production audit #30 (Omega Services, plumbing/trades): 6 of 37 organic
// answers mentioned the brand (Frequency 16.2 -- scoreFrequency below is
// that same mention rate, the headline). Claude failed 4 of 13 calls
// (unrelated to this item; Part A of the audit-reliability work covers
// recording those). mentionRowCount: 6 is the real distinct-mention count
// this audit's own recommendation generation ran with.
function omegaCtx(overrides: Partial<TriggerContext> = {}): TriggerContext {
  return {
    scoreFrequency: "16.22",
    scorePosition: "71.00",
    scoreSentimentNumeric: "80.00",
    scoreContextNumeric: "80.00",
    scoreAccuracy: "100.00",
    scoreComposite: "16.22",
    confidenceIntervals: {},
    vertical: "tradies",
    mentionRowCount: 6,
    ...overrides,
  };
}

describe("item 2, test 1 -- a trigger's premise: no evidence means no factual claim", () => {
  it("directory-visibility: an unavailable citation count makes no claim at all -- not even a hedged one", async () => {
    // Vunnara (21 Oct, Part E): the retired au-local-citations had a
    // score-only "we couldn't verify..." fallback for exactly this case.
    // directory-visibility has none -- it is entirely evidence-driven
    // (reads: [], threshold: () => false), so "unavailable" evidence
    // means no recommendation at all, never a hedged guess.
    const recs = await build(omegaCtx(), {
      ...NO_EVIDENCE,
      directories: { status: "unavailable", reason: "timed out after 15000ms" },
    });
    expect(find(recs, "directory-visibility")).toBeUndefined();
  });

  it("entity-profiles (Wikipedia path): a check that COULDN'T run never states 'there's no article' as fact", async () => {
    const recs = await build(omegaCtx(), {
      ...NO_EVIDENCE,
      wikipedia: { status: "unavailable", reason: "HTTP 503" },
    });
    const rec = find(recs, "entity-profiles");
    expect(rec?.confidenceLabel).not.toBe("confirmed");
    expect(rec?.action).not.toMatch(/there's no wikipedia article/i);
    expect(rec?.action).toMatch(/couldn't check wikipedia/i);
  });

  it("no checker ever reaches 'confirmed' without a real per-brand result (NO_EVIDENCE for every rule)", async () => {
    const recs = await build(omegaCtx(), NO_EVIDENCE);
    expect(recs.filter((r) => r.confidenceLabel === "confirmed")).toHaveLength(0);
  });
});

describe("item 2, test 2 -- Omega's audit #30 shape gives evidence-based wording", () => {
  it("Omega's real audit #30 hipages citation (norwestelectricalgroup) -- cited, never assumed to be Omega's own listing", async () => {
    // Vunnara (21 Oct, Part E): the retired au-local-citations's
    // checkAuDirectories result is replaced by audit #30's REAL evidence
    // -- Perplexity cited hipages.com.au/connect/norwestelectricalgroup
    // (a DIFFERENT electrician's real listing) answering a "most
    // reliable electricians" prompt, one of this audit's real 37 organic
    // answers (db/prod-fixes/diag-0082-audit30-mentions-and-sources.sql).
    // Omega's own confirmed status for hipages isn't known from that
    // production data, so ownerStatus is null here -- the honest
    // unsure-or-none case, never guessed as "not listed".
    const recs = await build(omegaCtx(), {
      ...NO_EVIDENCE,
      directories: {
        status: "ok",
        data: {
          computedAt: "2026-10-21T00:00:00.000Z",
          findings: [
            {
              key: "hipages",
              name: "hipages",
              citedCount: 1,
              totalAnswers: 37,
              citedUrls: [
                {
                  url: "https://hipages.com.au/connect/norwestelectricalgroup",
                  displayUrl: "https://hipages.com.au/connect/norwestelectricalgroup",
                },
              ],
              ownerProfileCited: false,
              ownerStatus: null,
              ownerConfirmedAt: null,
            },
          ],
        },
      },
    });
    const rec = find(recs, "directory-visibility");
    // "Honest estimates and labels" (23 Oct), item 2 -- Omega never
    // confirmed anything here (ownerStatus/ownerConfirmedAt both null,
    // per this test's own comment above), so this is "likely"
    // (measured, not confirmed), never "confirmed".
    expect(rec?.confidenceLabel).toBe("likely");
    // Never a presence claim either way -- Omega never confirmed anything.
    expect(rec?.action).not.toMatch(/you're not listed/i);
    expect(rec?.action).not.toMatch(/your own confirmed .* profile was not among/i);
    expect(rec?.action).toContain(
      "hipages was cited in 1 of 37 answers to everyday customer questions (questions that don't name your business)",
    );
    expect(rec?.evidenceRefs.map((r) => r.url)).toContain(
      "https://hipages.com.au/connect/norwestelectricalgroup",
    );
    expect(rec?.evidenceRefs.every((r) => r.sourceType === "checker")).toBe(true);
  });

  it("the Wikipedia-path recommendation for Omega states only the one fact it checked, framed as advice -- never implying Omega should have a Wikipedia page", async () => {
    const recs = await build(omegaCtx(), {
      ...NO_EVIDENCE,
      wikipedia: {
        status: "ok",
        data: { articleExists: false, articleUrl: null, query: "Omega Services Australia" },
      },
    });
    const rec = find(recs, "entity-profiles");
    expect(rec?.confidenceLabel).toBe("confirmed");
    expect(rec?.action).toContain("there's no Wikipedia article for your business");
    expect(rec?.action).toMatch(/that's normal for a local business/i);
    expect(rec?.action).toMatch(/we don't recommend writing one yet/i);
    expect(rec?.evidenceRefs[0]?.summary).toContain('"Omega Services Australia": no article found');
  });
});

describe("item 2, test 3 -- the 'beyond Wikipedia' trigger's premise", () => {
  it("fires at 'likely' (not 'confirmed') when Wikipedia couldn't be checked -- its premise ('no article exists') was never actually verified", async () => {
    const recs = await build(omegaCtx(), {
      ...NO_EVIDENCE,
      wikipedia: { status: "unavailable", reason: "network" },
    });
    const rec = find(recs, "entity-profiles");
    expect(rec?.confidenceLabel).toBe("likely");
  });

  it("never fires the Wikipedia-ARTICLE ask (draft one) without a real notability signal -- the premise for THAT claim", async () => {
    const recs = await build(omegaCtx(), {
      ...NO_EVIDENCE,
      wikipedia: {
        status: "ok",
        data: { articleExists: false, articleUrl: null, query: "Omega Services Australia" },
      },
      // notability: "not_run" (NO_EVIDENCE's default) -- no real
      // press/notability checker exists yet (triggers.ts's own
      // documented, honest limitation).
    });
    expect(find(recs, "wikipedia-article")).toBeUndefined();
    expect(find(recs, "entity-profiles")).toBeDefined();
  });

  it("never fires at all once a real Wikipedia article is confirmed to exist -- the premise ('no article') is false", async () => {
    const recs = await build(omegaCtx(), {
      ...NO_EVIDENCE,
      wikipedia: {
        status: "ok",
        data: {
          articleExists: true,
          articleUrl: "https://en.wikipedia.org/wiki/Omega_Services",
          query: "Omega Services Australia",
        },
      },
    });
    expect(find(recs, "entity-profiles")).toBeUndefined();
    expect(find(recs, "wikipedia-article")).toBeUndefined();
  });
});
