/**
 * The three rules that used to print "High · confirmed" from a bare
 * score threshold (wikipedia-article, directory-visibility, stale-content)
 * now confirm only on a real, brand-specific checker result. Every
 * checker here is a plain data fixture -- nothing touches the network.
 */
import { describe, expect, it } from "vitest";
import type { DbClient } from "@/db/client";
import { buildRecommendations } from "@/lib/recommendations";
import { resolveConfidence } from "@/lib/recommendations/confidence-labels";
import {
  type DirectoryVisibilityFinding,
  NO_EVIDENCE,
  type RecommendationEvidence,
} from "@/lib/recommendations/evidence";
import {
  DIRECTORY_VISIBILITY_HIGH_SHARE,
  DIRECTORY_VISIBILITY_MEDIUM_SHARE,
  directoryVisibilityPriority,
  evaluateTriggers,
  passesNotabilityGate,
} from "@/lib/recommendations/triggers";
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

function finding(
  name: string,
  overrides: Partial<Omit<DirectoryVisibilityFinding, "name">> = {},
): DirectoryVisibilityFinding {
  const key = name.toLowerCase().replace(/\s+/g, "-");
  const url = `https://${key}.example.test/listing-123`;
  return {
    key,
    name,
    citedCount: 3,
    totalAnswers: 37,
    citedUrls: [{ url, displayUrl: url }],
    ownerProfileCited: false,
    ownerStatus: null,
    ownerConfirmedAt: null,
    ...overrides,
  };
}

function directoriesEvidence(
  findings: DirectoryVisibilityFinding[],
  computedAt = "2026-10-21T00:00:00.000Z",
): RecommendationEvidence["directories"] {
  return { status: "ok", data: { computedAt, findings } };
}

async function build(c: TriggerContext, e: RecommendationEvidence) {
  return buildRecommendations(c, noResearchDb, e);
}

function find(recs: RecommendationWithConfidence[], key: string) {
  return recs.find((r) => r.recommendationKey === key);
}

// ---------------------------------------------------------------------------
describe("directory-visibility -- Part D's real citation count + Part C's owner confirmation", () => {
  it("owner told us NOT listed -> 'confirmed', the only case allowed to say 'not listed'", async () => {
    const recs = await build(
      ctx(),
      evidence({
        directories: directoriesEvidence([
          finding("hipages", { ownerStatus: "not_listed", ownerConfirmedAt: "2026-10-15T00:00:00.000Z" }),
        ]),
      }),
    );
    const rec = find(recs, "directory-visibility");
    expect(rec?.confidenceLabel).toBe("confirmed");
    expect(rec?.title).toMatch(/hipages/);
    expect(rec?.action).toMatch(/you're not listed/i);
    expect(rec?.action).toContain(
      "cited in 3 of 37 answers to everyday customer questions (questions that don't name your business)",
    );
    expect(rec?.evidenceRefs.some((r) => r.url === "https://hipages.example.test/listing-123")).toBe(
      true,
    );
    expect(rec?.evidenceRefs.every((r) => r.sourceType === "checker")).toBe(true);
  });

  it("owner IS listed, but no cited URL matches their profile -> 'not your own listing', never 'not listed'", async () => {
    const recs = await build(
      ctx(),
      evidence({
        directories: directoriesEvidence([
          finding("hipages", { ownerStatus: "listed", ownerConfirmedAt: "2026-10-15T00:00:00.000Z" }),
        ]),
      }),
    );
    const rec = find(recs, "directory-visibility");
    expect(rec?.confidenceLabel).toBe("confirmed");
    expect(rec?.action).not.toMatch(/you're not listed/i);
    expect(rec?.action).toMatch(/your own confirmed hipages profile was not among those citations/i);
  });

  // "Honest estimates and labels" (23 Oct), item 2 -- production bug:
  // this used to assert "confirmed" here too, same as the genuinely-
  // confirmed cases above -- but nothing WAS confirmed; the title
  // itself only asks the owner to check. "likely" is the min(ceiling,
  // basis) this case now correctly resolves to ("inferred" basis,
  // never "verified", when the lead's ownerStatus is null).
  it("owner never confirmed anything (unsure-or-none) -> 'likely', never 'confirmed' -- prompts them to check, never claims either way", async () => {
    const recs = await build(
      ctx(),
      evidence({ directories: directoriesEvidence([finding("hipages")]) }),
    );
    const rec = find(recs, "directory-visibility");
    expect(rec?.confidenceLabel).toBe("likely");
    expect(rec?.action).not.toMatch(/you're not listed/i);
    expect(rec?.action).not.toMatch(/your own confirmed .* profile was not among/i);
    expect(rec?.action).toMatch(/haven't told us/i);
    expect(rec?.action).toMatch(/directory listings card/i);
  });

  it("owner's own profile IS among the cited URLs -> does NOT fire at all, whatever their status", async () => {
    const recs = await build(
      ctx(),
      evidence({
        directories: directoriesEvidence([
          finding("hipages", { ownerProfileCited: true, ownerStatus: "listed" }),
        ]),
      }),
    );
    expect(find(recs, "directory-visibility")).toBeUndefined();
  });

  it("a directory nothing cited never appears (Part D's toDirectoryVisibility already drops it, but confirm the rule handles an empty findings list too)", async () => {
    const recs = await build(ctx(), evidence({ directories: directoriesEvidence([]) }));
    expect(find(recs, "directory-visibility")).toBeUndefined();
  });

  it("evidence unavailable or not_run -> does NOT fire -- no score-only fallback exists for this rule any more", async () => {
    for (const e of [
      NO_EVIDENCE,
      evidence({ directories: { status: "unavailable", reason: "query failed" } }),
    ]) {
      const recs = await build(ctx({ scoreFrequency: "5.00" }), e);
      expect(find(recs, "directory-visibility")).toBeUndefined();
    }
  });

  it("fires regardless of score -- entirely evidence-driven, reads no dimension", async () => {
    const recs = await build(
      ctx({ scoreFrequency: "90.00" }),
      evidence({ directories: directoriesEvidence([finding("hipages", { ownerStatus: "not_listed" })]) }),
    );
    expect(find(recs, "directory-visibility")?.confidenceLabel).toBe("confirmed");
  });

  it("combines multiple flagged directories into one recommendation, naming each", async () => {
    const recs = await build(
      ctx(),
      evidence({
        directories: directoriesEvidence([
          finding("hipages", { ownerStatus: "not_listed" }),
          finding("Oneflare", { ownerStatus: "listed" }),
          finding("Yellow Pages"),
        ]),
      }),
    );
    const rec = find(recs, "directory-visibility");
    expect(rec?.action).toContain("hipages");
    expect(rec?.action).toContain("Oneflare");
    expect(rec?.action).toContain("Yellow Pages");
    // One ref per cited URL across every flagged directory, plus the
    // owner-confirmed ref for the one with a real confirmedAt.
    expect(rec?.evidenceRefs.length).toBeGreaterThanOrEqual(3);
  });

  // Sri, 21 Oct follow-up, item 1: no unsupported general claim, in any
  // variant -- only what Part D measured (the citation) and what Part C
  // recorded (the owner's own confirmation).
  it("never states an unsupported cause, statistic, or generalisation, in any variant", async () => {
    for (const ownerStatus of ["not_listed", "listed", "unsure", null] as const) {
      const recs = await build(
        ctx(),
        evidence({
          directories: directoriesEvidence([
            finding("hipages", { ownerStatus, ownerConfirmedAt: ownerStatus ? "2026-10-15T00:00:00.000Z" : null }),
          ]),
        }),
      );
      const action = find(recs, "directory-visibility")?.action ?? "";
      expect(action).not.toMatch(/most common/i);
      expect(action).not.toMatch(/\busually\b/i);
      expect(action).not.toMatch(/studies show/i);
      expect(action).not.toMatch(/\btypically\b/i);
      expect(action).not.toMatch(/the reason/i);
    }
  });

  // Sri, 21 Oct follow-up, item 2: every firing's TITLE carries the
  // measured n of N, written the way the registry spells the name
  // ("hipages", never "Hipages") -- and the body always points to the
  // linked evidence.
  it("the title states the measured n of N answers, and the body points to the cited pages", async () => {
    const recs = await build(
      ctx(),
      evidence({
        directories: directoriesEvidence([
          finding("hipages", { citedCount: 1, totalAnswers: 37, ownerStatus: "not_listed" }),
        ]),
      }),
    );
    const rec = find(recs, "directory-visibility");
    expect(rec?.title).toBe("AI cited hipages in 1 of 37 answers — you told us you're not listed");
    expect(rec?.action).toMatch(/see the cited pages/i);
  });

  it("title names the LEAD flagged directory and counts the rest as 'and N more'", async () => {
    const recs = await build(
      ctx(),
      evidence({
        directories: directoriesEvidence([
          finding("hipages", { citedCount: 5, totalAnswers: 37, ownerStatus: "not_listed" }),
          finding("Oneflare", { citedCount: 2, totalAnswers: 37, ownerStatus: "listed" }),
        ]),
      }),
    );
    const rec = find(recs, "directory-visibility");
    expect(rec?.title).toBe("AI cited hipages in 5 of 37 answers — you told us you're not listed, and 1 more directory");
  });

  // Sri, 21 Oct follow-up, item 3: priority tracks the measured share,
  // never a flat per-rule guess -- Omega's real 1-of-37 share (~2.7%)
  // is below DIRECTORY_VISIBILITY_MEDIUM_SHARE (5%), so it must be
  // "low", not "High".
  describe("priority tracks the measured share, not a flat per-rule guess", () => {
    it("1 of 37 (~2.7%, Omega's real share) is 'low'", async () => {
      const recs = await build(
        ctx(),
        evidence({
          directories: directoriesEvidence([
            finding("hipages", { citedCount: 1, totalAnswers: 37, ownerStatus: "not_listed" }),
          ]),
        }),
      );
      expect(find(recs, "directory-visibility")?.expectedImpactScore).toBe("low");
    });

    it("3 of 37 (~8%, above the medium floor) is 'medium'", async () => {
      const recs = await build(
        ctx(),
        evidence({
          directories: directoriesEvidence([
            finding("hipages", { citedCount: 3, totalAnswers: 37, ownerStatus: "not_listed" }),
          ]),
        }),
      );
      expect(find(recs, "directory-visibility")?.expectedImpactScore).toBe("medium");
    });

    it("8 of 37 (~22%, above the high floor) is 'high'", async () => {
      const recs = await build(
        ctx(),
        evidence({
          directories: directoriesEvidence([
            finding("hipages", { citedCount: 8, totalAnswers: 37, ownerStatus: "not_listed" }),
          ]),
        }),
      );
      expect(find(recs, "directory-visibility")?.expectedImpactScore).toBe("high");
    });

    it("combining directories takes the WORST (highest) share across them, never an average", async () => {
      const recs = await build(
        ctx(),
        evidence({
          directories: directoriesEvidence([
            finding("hipages", { citedCount: 1, totalAnswers: 37, ownerStatus: "not_listed" }), // low
            finding("Oneflare", { citedCount: 8, totalAnswers: 37, ownerStatus: "listed" }), // high
          ]),
        }),
      );
      expect(find(recs, "directory-visibility")?.expectedImpactScore).toBe("high");
    });
  });
});

describe("directoryVisibilityPriority (the exported thresholds directly)", () => {
  it("uses the named DIRECTORY_VISIBILITY_HIGH_SHARE / _MEDIUM_SHARE constants as the boundaries", () => {
    const total = 1000;
    const atHigh = Math.ceil(DIRECTORY_VISIBILITY_HIGH_SHARE * total);
    const atMedium = Math.ceil(DIRECTORY_VISIBILITY_MEDIUM_SHARE * total);
    expect(directoryVisibilityPriority(atHigh, total)).toBe("high");
    expect(directoryVisibilityPriority(atHigh - 1, total)).not.toBe("high");
    expect(directoryVisibilityPriority(atMedium, total)).not.toBe("low");
    expect(directoryVisibilityPriority(atMedium - 1, total)).toBe("low");
  });

  it("0 total answers is 'low', never a division by zero", () => {
    expect(directoryVisibilityPriority(0, 0)).toBe("low");
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
        "directory-visibility",
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
    // directory-visibility is deliberately absent from this list -- unlike
    // the retired au-local-citations, it has no score-only fallback at
    // all; with NO_EVIDENCE it correctly stays silent (covered above).
    const keys = (await build(zeroMentionCtx(), NO_EVIDENCE)).map((r) => r.recommendationKey);
    expect(keys).toEqual(
      expect.arrayContaining(["entity-profiles", "reddit-absence", "medium-presence", "linkedin-presence"]),
    );
  });

  // Task #46 Phase 3, Part C: "faq-content" (reads Context) is dropped
  // from this list -- unlike Position/Accuracy, Context's exclusion is
  // permanent (not_measured, no real classifier), so it does NOT start
  // firing just because mentions now exist, the way expert-quotes/
  // comparison-article (real mention-dependent dimensions) do.
  it("the same low scores DO fire mention-dependent rules once mentions exist", async () => {
    const keys = (await build({ ...zeroMentionCtx(), mentionRowCount: 4 }, NO_EVIDENCE)).map(
      (r) => r.recommendationKey,
    );
    expect(keys).toEqual(expect.arrayContaining(["expert-quotes", "comparison-article"]));
    expect(keys).not.toContain("faq-content");
  });

  it("a checker-verified finding is mention-independent and still confirms on a zero-mention audit", async () => {
    const recs = await build(
      zeroMentionCtx(),
      evidence({
        directories: directoriesEvidence([finding("hipages", { ownerStatus: "not_listed" })]),
      }),
    );
    expect(find(recs, "directory-visibility")?.confidenceLabel).toBe("confirmed");
  });
});

// ---------------------------------------------------------------------------
describe("confidence = min(static ceiling, evidence basis)", () => {
  it("score-only ('inferred') can never reach 'confirmed', even under a 'confirmed' ceiling", () => {
    expect(resolveConfidence("directory-visibility", "inferred")).toBe("likely");
    expect(resolveConfidence("stale-content", "inferred")).toBe("likely");
  });

  it("'verified' is still capped by a lower ceiling", () => {
    expect(resolveConfidence("comparison-article", "verified")).toBe("hypothesis");
    expect(resolveConfidence("faq-content", "verified")).toBe("likely");
  });

  // Task #46 Phase 3, Part C: "faq-content" (reads Context) and
  // "press-mentions" (reads Sentiment) dropped from this list -- both are
  // now permanently disabled (unconditionally not_measured), so neither
  // fires here regardless of score, leaving 6 of the original 8.
  it("the remaining 6 score-only rules keep exactly their previous labels", async () => {
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
      "expert-quotes": "likely",
      "cited-statistics": "likely",
      "reddit-absence": "likely",
      "comparison-article": "hypothesis",
      "medium-presence": "hypothesis",
      "linkedin-presence": "hypothesis",
    };
    for (const [key, label] of Object.entries(expected)) {
      expect(find(recs, key)?.confidenceLabel, key).toBe(label);
    }
    expect(find(recs, "faq-content")).toBeUndefined();
    expect(find(recs, "press-mentions")).toBeUndefined();
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
