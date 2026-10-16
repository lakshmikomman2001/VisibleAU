/**
 * The three rules that used to print "High · confirmed" from a bare
 * score threshold (wikipedia-article, au-local-citations, stale-content)
 * now confirm only on a real, brand-specific checker result. Every
 * checker here is a plain data fixture -- nothing touches the network.
 */
import { describe, expect, it } from "vitest";
import type { DbClient } from "@/db/client";
import { buildRecommendations } from "@/lib/recommendations";
import { resolveConfidence } from "@/lib/recommendations/confidence-labels";
import {
  type DirectoryFinding,
  NO_EVIDENCE,
  type RecommendationEvidence,
} from "@/lib/recommendations/evidence";
import { evaluateTriggers, passesNotabilityGate } from "@/lib/recommendations/triggers";
import type { RecommendationWithConfidence, TriggerContext } from "@/lib/recommendations/types";

// buildRecommendations' only DB use is the recommendation_research lookup.
const noResearchDb = {
  select: () => ({ from: () => ({ where: async () => [] }) }),
} as unknown as DbClient;

function ctx(overrides: Partial<TriggerContext> = {}): TriggerContext {
  return {
    scoreFrequency: "20.00",
    scorePosition: "80.00",
    scoreSentimentNumeric: "80.00",
    scoreContextNumeric: "80.00",
    scoreAccuracy: "80.00",
    scoreComposite: "40.00",
    confidenceIntervals: {},
    vertical: "tradies",
    mentionRowCount: 6,
    ...overrides,
  };
}

/** A zero-mention audit: Frequency is a real 0; everything else is
 * insufficient_data (stored as 0). */
function zeroMentionCtx(): TriggerContext {
  return ctx({
    scoreFrequency: "0.00",
    scorePosition: "0.00",
    scoreSentimentNumeric: "0.00",
    scoreContextNumeric: "0.00",
    scoreAccuracy: "0.00",
    scoreComposite: "0.00",
    mentionRowCount: 0,
  });
}

function evidence(overrides: Partial<RecommendationEvidence> = {}): RecommendationEvidence {
  return { ...NO_EVIDENCE, ...overrides };
}

const dir = (name: string, status: DirectoryFinding["status"]): DirectoryFinding => ({
  name,
  status,
  url: status === "listed" ? `https://example.test/${name}` : null,
  finding:
    status === "listed"
      ? `Listed on ${name}.`
      : status === "not_listed"
        ? `Not found on ${name}.`
        : `Couldn't verify — ${name} blocked the check.`,
});

async function build(c: TriggerContext, e: RecommendationEvidence) {
  return buildRecommendations(c, noResearchDb, e);
}

function find(recs: RecommendationWithConfidence[], key: string) {
  return recs.find((r) => r.recommendationKey === key);
}

// ---------------------------------------------------------------------------
describe("au-local-citations -- checkAuDirectories", () => {
  it("names exactly the directories the checker found missing, at 'confirmed'", async () => {
    const recs = await build(
      ctx(),
      evidence({
        directories: {
          status: "ok",
          data: {
            results: [
              dir("Hipages", "not_listed"),
              dir("Yellow Pages AU", "listed"),
              dir("ServiceSeeking", "not_listed"),
              dir("Word of Mouth", "listed"),
            ],
          },
        },
      }),
    );
    const rec = find(recs, "au-local-citations");
    expect(rec?.confidenceLabel).toBe("confirmed");
    expect(rec?.title).toBe("You're not listed on Hipages and ServiceSeeking");
    expect(rec?.action).toContain("You're not listed on Hipages and ServiceSeeking");
    expect(rec?.action).toContain("add your business to both");
    // Listed directories are never named as missing.
    expect(rec?.action).not.toContain("Yellow Pages AU");
    expect(rec?.action).not.toContain("Word of Mouth");
    expect(rec?.evidenceRefs.map((r) => r.source)).toEqual(["Hipages", "ServiceSeeking"]);
    expect(rec?.evidenceRefs.every((r) => r.sourceType === "checker")).toBe(true);
  });

  it("confirms a verified gap even when Frequency is high (the evidence, not the score, fires it)", async () => {
    const recs = await build(
      ctx({ scoreFrequency: "90.00" }),
      evidence({
        directories: {
          status: "ok",
          data: { results: [dir("Hipages", "not_listed"), dir("Yellow Pages AU", "listed")] },
        },
      }),
    );
    expect(find(recs, "au-local-citations")?.confidenceLabel).toBe("confirmed");
  });

  it("separately flags unverifiable directories, never as 'not listed'", async () => {
    const recs = await build(
      ctx(),
      evidence({
        directories: {
          status: "ok",
          data: {
            results: [dir("Hipages", "not_listed"), dir("Yellow Pages AU", "unverifiable")],
          },
        },
      }),
    );
    const rec = find(recs, "au-local-citations");
    expect(rec?.title).toBe("You're not listed on Hipages");
    expect(rec?.action).toContain("We couldn't verify Yellow Pages AU");
  });

  it("does NOT fire when every directory confirms the listing", async () => {
    const recs = await build(
      ctx({ scoreFrequency: "5.00" }),
      evidence({
        directories: {
          status: "ok",
          data: {
            results: ["Hipages", "Yellow Pages AU", "ServiceSeeking", "Word of Mouth"].map((n) =>
              dir(n, "listed"),
            ),
          },
        },
      }),
    );
    expect(find(recs, "au-local-citations")).toBeUndefined();
  });

  it("checker unavailable -> 'likely', copy says it wasn't verified this time", async () => {
    const recs = await build(
      ctx(),
      evidence({ directories: { status: "unavailable", reason: "timed out after 15000ms" } }),
    );
    const rec = find(recs, "au-local-citations");
    expect(rec?.confidenceLabel).toBe("likely");
    expect(rec?.action).toMatch(/couldn't verify your directory listings this audit/i);
    expect(rec?.action).not.toMatch(/you're not listed/i);
  });

  it("all directories unverifiable (blocked) -> inconclusive 'likely', naming them as unverified", async () => {
    const recs = await build(
      ctx(),
      evidence({
        directories: {
          status: "ok",
          data: { results: [dir("Hipages", "unverifiable"), dir("Word of Mouth", "unverifiable")] },
        },
      }),
    );
    const rec = find(recs, "au-local-citations");
    expect(rec?.confidenceLabel).toBe("likely");
    expect(rec?.action).toContain("couldn't verify your listing on Hipages and Word of Mouth");
  });
});

// ---------------------------------------------------------------------------
describe("stale-content -- crawled Last-Modified dates (classifyFreshness)", () => {
  const stalePages = evidence({
    pageFreshness: {
      status: "ok",
      data: {
        datedPages: [
          {
            url: "https://bondiplumbing.test/pricing",
            lastModified: "2025-06-01T00:00:00.000Z",
            daysSinceModified: 502,
            freshnessRisk: "stale",
          },
          {
            url: "https://bondiplumbing.test/",
            lastModified: "2026-10-01T00:00:00.000Z",
            daysSinceModified: 15,
            freshnessRisk: "fresh",
          },
          {
            url: "https://bondiplumbing.test/services",
            lastModified: "2026-06-01T00:00:00.000Z",
            daysSinceModified: 137,
            freshnessRisk: "stale",
          },
        ],
        undatedPageCount: 2,
      },
    },
  });

  it("lists the actual stale page URLs at 'confirmed', oldest first, fresh pages excluded", async () => {
    const rec = find(await build(ctx(), stalePages), "stale-content");
    expect(rec?.confidenceLabel).toBe("confirmed");
    expect(rec?.title).toBe("Refresh 2 pages that haven't changed in 90+ days");
    expect(rec?.action).toContain(
      "https://bondiplumbing.test/pricing (502 days) and https://bondiplumbing.test/services (137 days)",
    );
    expect(rec?.action).not.toContain("https://bondiplumbing.test/ ");
    expect(rec?.evidenceRefs.map((r) => r.url)).toEqual([
      "https://bondiplumbing.test/pricing",
      "https://bondiplumbing.test/services",
    ]);
  });

  it("is tagged with the display-only 'content' group, not 'accuracy'", async () => {
    const rec = find(await build(ctx(), stalePages), "stale-content");
    expect(rec?.dimension).toBe("content");
  });

  it("does NOT fire when every dated page is fresh, whatever the scores", async () => {
    const recs = await build(
      ctx({ scoreAccuracy: "5.00" }),
      evidence({
        pageFreshness: {
          status: "ok",
          data: {
            datedPages: [
              {
                url: "https://x.test/",
                lastModified: "2026-10-01T00:00:00.000Z",
                daysSinceModified: 15,
                freshnessRisk: "fresh",
              },
            ],
            undatedPageCount: 0,
          },
        },
      }),
    );
    expect(find(recs, "stale-content")).toBeUndefined();
  });

  it("undated pages are an unknown age, never 'stale'", async () => {
    const recs = await build(
      ctx(),
      evidence({
        pageFreshness: { status: "ok", data: { datedPages: [], undatedPageCount: 12 } },
      }),
    );
    expect(find(recs, "stale-content")).toBeUndefined();
  });

  it("no crawl data (unavailable) -> not emitted at all: no score measures page age, so there is nothing to downgrade to", async () => {
    const recs = await build(
      ctx({ scoreAccuracy: "5.00" }),
      evidence({ pageFreshness: { status: "unavailable", reason: "no recent content crawl" } }),
    );
    expect(find(recs, "stale-content")).toBeUndefined();
  });

  it("caps the inline list at 5 URLs with an 'and N more' tail", async () => {
    const datedPages = Array.from({ length: 7 }, (_, i) => ({
      url: `https://x.test/p${i}`,
      lastModified: "2025-01-01T00:00:00.000Z",
      daysSinceModified: 600 - i,
      freshnessRisk: "stale" as const,
    }));
    const rec = find(
      await build(
        ctx(),
        evidence({ pageFreshness: { status: "ok", data: { datedPages, undatedPageCount: 0 } } }),
      ),
      "stale-content",
    );
    expect(rec?.action).toContain("and 2 more");
    expect(rec?.evidenceRefs).toHaveLength(7);
  });
});

// ---------------------------------------------------------------------------
describe("wikipedia-article / entity-profiles -- checkWikipediaAuStatus + notability gate", () => {
  const noArticle = {
    status: "ok" as const,
    data: { articleExists: false, articleUrl: null, query: "Bondi Plumbing Australia" },
  };

  it("no article + no notability signal -> 'confirmed' entity-profiles alternatives, NOT a Wikipedia-article ask", async () => {
    const recs = await build(ctx(), evidence({ wikipedia: noArticle }));
    expect(find(recs, "wikipedia-article")).toBeUndefined();
    const rec = find(recs, "entity-profiles");
    expect(rec?.confidenceLabel).toBe("confirmed");
    expect(rec?.action).toContain("there's no Wikipedia article for your business");
    expect(rec?.action).toContain("Google Business Profile");
    expect(rec?.action).toContain("Wikidata");
    expect(rec?.action).toMatch(/local and regional press/);
    expect(rec?.action).toMatch(/we don't recommend writing one yet/);
    expect(rec?.evidenceRefs[0]?.summary).toContain('"Bondi Plumbing Australia": no article found');
  });

  it("copy never promises what WP:NCORP would reject (no 'local coverage is enough')", async () => {
    const rec = find(await build(ctx(), evidence({ wikipedia: noArticle })), "entity-profiles");
    expect(rec?.action).toMatch(/local coverage on its own usually isn't enough/);
    expect(rec?.action).not.toMatch(/draft .*wikipedia article/i);
  });

  it("no article + notability gate passed -> 'confirmed' Wikipedia-article ask naming the outlets", async () => {
    const recs = await build(
      ctx(),
      evidence({
        wikipedia: noArticle,
        notability: {
          status: "ok",
          data: {
            qualifyingSources: [
              { url: "https://abc.test/a", outlet: "ABC News", scope: "national" },
              { url: "https://smh.test/b", outlet: "Sydney Morning Herald", scope: "regional" },
            ],
          },
        },
      }),
    );
    const rec = find(recs, "wikipedia-article");
    expect(rec?.confidenceLabel).toBe("confirmed");
    expect(rec?.action).toContain("ABC News and Sydney Morning Herald");
    expect(rec?.action).toContain("Articles for Creation");
    expect(find(recs, "entity-profiles")).toBeUndefined();
  });

  it("local-only coverage does NOT pass the notability gate", () => {
    expect(
      passesNotabilityGate({
        qualifyingSources: [
          { url: "https://a.test", outlet: "Wentworth Courier", scope: "local" },
          { url: "https://b.test", outlet: "Bondi View", scope: "local" },
        ],
      }),
    ).toBe(false);
    // ...nor does a single outlet, however big.
    expect(
      passesNotabilityGate({
        qualifyingSources: [
          { url: "https://a.test/1", outlet: "ABC News", scope: "national" },
          { url: "https://a.test/2", outlet: "ABC News", scope: "national" },
        ],
      }),
    ).toBe(false);
  });

  it("does NOT fire at all when the checker confirms an article already exists", async () => {
    const recs = await build(
      ctx({ scoreFrequency: "5.00" }),
      evidence({
        wikipedia: {
          status: "ok",
          data: {
            articleExists: true,
            articleUrl: "https://en.wikipedia.org/wiki/Bondi_Plumbing",
            query: "Bondi Plumbing Australia",
          },
        },
      }),
    );
    expect(find(recs, "wikipedia-article")).toBeUndefined();
    expect(find(recs, "entity-profiles")).toBeUndefined();
  });

  it("checker unavailable -> 'likely' alternatives, saying Wikipedia wasn't checked", async () => {
    const recs = await build(
      ctx(),
      evidence({ wikipedia: { status: "unavailable", reason: "HTTP 503" } }),
    );
    const rec = find(recs, "entity-profiles");
    expect(rec?.confidenceLabel).toBe("likely");
    expect(rec?.action).toMatch(/couldn't check Wikipedia this audit/);
    expect(find(recs, "wikipedia-article")).toBeUndefined();
  });

  it("not relevant (Frequency >= 40) -> neither variant fires", async () => {
    const recs = await build(ctx({ scoreFrequency: "60.00" }), evidence({ wikipedia: noArticle }));
    expect(find(recs, "wikipedia-article")).toBeUndefined();
    expect(find(recs, "entity-profiles")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
describe("insufficient-data gate (0 mention rows)", () => {
  it("none of the three checker-backed rules is 'confirmed' on a zero-mention audit without checker evidence", async () => {
    for (const e of [
      NO_EVIDENCE,
      evidence({
        directories: { status: "unavailable", reason: "network" },
        wikipedia: { status: "unavailable", reason: "network" },
        pageFreshness: { status: "unavailable", reason: "no crawl" },
      }),
    ]) {
      const recs = await build(zeroMentionCtx(), e);
      for (const key of [
        "wikipedia-article",
        "entity-profiles",
        "au-local-citations",
        "stale-content",
      ]) {
        expect(find(recs, key)?.confidenceLabel).not.toBe("confirmed");
      }
    }
  });

  it("rules reading Position/Sentiment/Context/Source-citation never fire on a zero-mention audit", async () => {
    const keys = (await build(zeroMentionCtx(), NO_EVIDENCE)).map((r) => r.recommendationKey);
    for (const k of [
      "faq-content", // context
      "expert-quotes", // accuracy
      "cited-statistics", // accuracy
      "comparison-article", // position
      "press-mentions", // frequency + sentiment
    ]) {
      expect(keys).not.toContain(k);
    }
  });

  it("Frequency-only rules still fire: 0 mentions out of N calls IS a real measurement", async () => {
    const keys = (await build(zeroMentionCtx(), NO_EVIDENCE)).map((r) => r.recommendationKey);
    expect(keys).toEqual(
      expect.arrayContaining([
        "au-local-citations",
        "entity-profiles",
        "reddit-absence",
        "medium-presence",
        "linkedin-presence",
      ]),
    );
  });

  it("the same low scores DO fire mention-dependent rules once mentions exist", async () => {
    const keys = (await build({ ...zeroMentionCtx(), mentionRowCount: 4 }, NO_EVIDENCE)).map(
      (r) => r.recommendationKey,
    );
    expect(keys).toEqual(
      expect.arrayContaining(["faq-content", "expert-quotes", "comparison-article"]),
    );
  });

  it("a checker-verified finding is mention-independent and still confirms on a zero-mention audit", async () => {
    const recs = await build(
      zeroMentionCtx(),
      evidence({
        directories: { status: "ok", data: { results: [dir("Hipages", "not_listed")] } },
      }),
    );
    expect(find(recs, "au-local-citations")?.confidenceLabel).toBe("confirmed");
  });
});

// ---------------------------------------------------------------------------
describe("confidence = min(static ceiling, evidence basis)", () => {
  it("score-only ('inferred') can never reach 'confirmed', even under a 'confirmed' ceiling", () => {
    expect(resolveConfidence("au-local-citations", "inferred")).toBe("likely");
    expect(resolveConfidence("stale-content", "inferred")).toBe("likely");
  });

  it("'verified' is still capped by a lower ceiling", () => {
    expect(resolveConfidence("comparison-article", "verified")).toBe("hypothesis");
    expect(resolveConfidence("faq-content", "verified")).toBe("likely");
  });

  it("the 8 score-only rules keep exactly their previous labels", async () => {
    const recs = await build(
      ctx({
        scoreFrequency: "10.00",
        scorePosition: "10.00",
        scoreAccuracy: "10.00",
        scoreContextNumeric: "10.00",
        scoreSentimentNumeric: "60.00",
      }),
      NO_EVIDENCE,
    );
    const expected: Record<string, string> = {
      "faq-content": "likely",
      "expert-quotes": "likely",
      "cited-statistics": "likely",
      "reddit-absence": "likely",
      "press-mentions": "likely",
      "comparison-article": "hypothesis",
      "medium-presence": "hypothesis",
      "linkedin-presence": "hypothesis",
    };
    for (const [key, label] of Object.entries(expected)) {
      expect(find(recs, key)?.confidenceLabel, key).toBe(label);
    }
  });

  it("only a rule with checker evidence is ever 'confirmed'", async () => {
    const recs = await build(
      ctx({ scoreFrequency: "5.00", scoreAccuracy: "5.00", scoreContextNumeric: "5.00" }),
      NO_EVIDENCE,
    );
    expect(recs.filter((r) => r.confidenceLabel === "confirmed")).toHaveLength(0);
  });
});

describe("evaluateTriggers default evidence", () => {
  it("omitting evidence behaves exactly like NO_EVIDENCE", () => {
    const c = ctx({ scoreFrequency: "10.00" });
    expect(evaluateTriggers(c)).toEqual(evaluateTriggers(c, NO_EVIDENCE));
  });
});
