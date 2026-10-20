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
  it("au-local-citations: a directory check that COULDN'T run never states 'you're not listed' as fact", async () => {
    const recs = await build(omegaCtx(), {
      ...NO_EVIDENCE,
      directories: { status: "unavailable", reason: "timed out after 15000ms" },
    });
    const rec = find(recs, "au-local-citations");
    expect(rec?.confidenceLabel).not.toBe("confirmed");
    expect(rec?.action).not.toMatch(/you're not listed/i);
    expect(rec?.action).toMatch(/couldn't verify/i);
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
  it("names exactly the directories checkAuDirectories found missing for Omega, with real checker evidenceRefs", async () => {
    const recs = await build(omegaCtx(), {
      ...NO_EVIDENCE,
      directories: {
        status: "ok",
        data: {
          results: [
            { name: "Hipages", status: "not_listed", url: null, finding: "Not found on Hipages." },
            {
              name: "ServiceSeeking",
              status: "not_listed",
              url: null,
              finding: "Not found on ServiceSeeking.",
            },
            {
              name: "Yellow Pages AU",
              status: "listed",
              url: "https://yellowpages.com.au/omega-services",
              finding: "Listed on Yellow Pages AU.",
            },
          ],
        },
      },
    });
    const rec = find(recs, "au-local-citations");
    expect(rec?.confidenceLabel).toBe("confirmed");
    expect(rec?.title).toBe("You're not listed on Hipages and ServiceSeeking");
    // The evidence is a real checker finding per directory, not a citation
    // count -- a directory PRESENCE check (checkAuDirectories), never an
    // invented number. Yellow Pages (found listed) is never named as missing.
    expect(rec?.evidenceRefs.map((r) => r.source)).toEqual(["Hipages", "ServiceSeeking"]);
    expect(rec?.evidenceRefs.every((r) => r.sourceType === "checker")).toBe(true);
    expect(rec?.action).not.toContain("Yellow Pages");
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
