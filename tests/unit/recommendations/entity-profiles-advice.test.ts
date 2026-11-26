/**
 * "Cost honesty" (25 Oct), item 4 -- entity-profile advice for local businesses (option A).
 *
 * S01C part 2c, LLD amendment 61: "The Wikipedia check's item says only its result and the next step: 'Get covered in
 * local press or on community sites' ('We checked: there's no Wikipedia article for your business. That's normal for
 * a local business: Wikipedia needs significant coverage in independent sources, so we don't recommend writing one
 * yet. Coverage in local press or on community sites is the step that helps.'); its Google Business Profile and
 * directory steps repeated the findings and rule j." The title and the action changed with it; the step list and the
 * directory step it named are gone, so those tests now check that the item names neither.
 */
import { describe, expect, it } from "vitest";
import { DIRECTORY_REGISTRY } from "@/lib/directories/registry";
import {
  displayRecommendationAction,
  displayRecommendationTitle,
} from "@/lib/recommendations/confidence-labels";
import { ENTITY_PROFILES_TITLE } from "@/lib/recommendations/entity-profiles";
import {
  type DirectoryVisibilityFinding,
  NO_EVIDENCE,
  type RecommendationEvidence,
} from "@/lib/recommendations/evidence";
import { evaluateTriggers } from "@/lib/recommendations/triggers";
import type { TriggerContext, TriggeredRecommendation } from "@/lib/recommendations/types";

const TITLE = "Get covered in local press or on community sites";
const CHECKED =
  "We checked: there's no Wikipedia article for your business. That's normal for a local business: Wikipedia needs significant coverage in independent sources, so we don't recommend writing one yet. Coverage in local press or on community sites is the step that helps.";
const NOT_CHECKED =
  "We couldn't check Wikipedia this audit. For most local businesses Wikipedia isn't the realistic route: Wikipedia needs significant coverage in independent sources. Coverage in local press or on community sites is the step that helps.";

const ctx: TriggerContext = {
  scoreFrequency: "20.00",
  scoreSentimentNumeric: "80.00",
  scoreContextNumeric: "80.00",
  scoreComposite: "20.00",
  confidenceIntervals: {},
  vertical: "tradies",
  mentionDetail: { mentionedCount: 6, rankedCount: 6, medianPosition: 2, sourcedCount: 5 },
};

const NO_ARTICLE = {
  status: "ok" as const,
  data: { articleExists: false, articleUrl: null, query: "Omega Services Australia" },
};

function finding(name: string, citedCount: number): DirectoryVisibilityFinding {
  const url = `https://${name.toLowerCase().replace(/\s+/g, "")}.example.test/listing`;
  return {
    key: name.toLowerCase().replace(/\s+/g, "_"),
    name,
    citedCount,
    totalAnswers: 40,
    citedUrls: [{ url, displayUrl: url }],
    ownerProfileCited: false,
    ownerStatus: null,
    ownerConfirmedAt: null,
  };
}

function entityProfiles(overrides: Partial<RecommendationEvidence>): TriggeredRecommendation {
  const rec = evaluateTriggers(ctx, { ...NO_EVIDENCE, ...overrides }).find(
    (r) => r.recommendationKey === "entity-profiles",
  );
  if (!rec) throw new Error("entity-profiles did not fire");
  return rec;
}

const CITED = {
  directories: {
    status: "ok" as const,
    data: {
      computedAt: "2026-10-24T00:00:00.000Z",
      findings: [finding("hipages", 9), finding("Word of Mouth", 12), finding("Yellow Pages", 3)],
    },
  },
};

describe("the not-notable and couldn't-check paths", () => {
  it("the not-notable path's title is the new one, with no Wikipedia or Wikidata in the title", () => {
    const rec = entityProfiles({ wikipedia: NO_ARTICLE });
    expect(rec.title).toBe(TITLE);
    expect(ENTITY_PROFILES_TITLE).toBe(TITLE);
    expect(displayRecommendationTitle(rec)).toBe(TITLE);
    expect(rec.expectedImpactScore).toBe("low");
    expect(rec.title).not.toMatch(/wikipedia|wikidata/i);
    expect(rec.action).toBe(CHECKED);
  });

  it("the couldn't-check path shows the same title with the existing 'Check: ' prefix", () => {
    const rec = entityProfiles({ wikipedia: { status: "unavailable", reason: "HTTP 503" } });
    expect(rec.title).toBe(TITLE);
    expect(displayRecommendationTitle(rec)).toBe(`Check: ${TITLE}`);
    expect(rec.expectedImpactScore).toBe("low");
    expect(rec.action).toBe(NOT_CHECKED);
  });

  it("the item says only the check's result and the next step: no profile or directory steps, no dashes", () => {
    const text = entityProfiles({ wikipedia: NO_ARTICLE, ...CITED }).action;
    expect(text).not.toMatch(/Google Business Profile|claim or complete|\(1\)|wikidata/i);
    expect(text).not.toMatch(/[—–]| - /);
    expect(text).toMatch(/Coverage in local press or on community sites is the step that helps\.$/);
  });
});

describe("the item names no directory (the directory findings do)", () => {
  const registryNames = Object.values(DIRECTORY_REGISTRY)
    .flat()
    .map((d) => d.name);

  it("whether the audit cited some, none, or its directory evidence is missing", () => {
    for (const directories of [
      CITED.directories,
      { status: "ok" as const, data: { computedAt: "2026-10-24T00:00:00.000Z", findings: [] } },
      { status: "not_run" as const },
    ]) {
      const text = entityProfiles({ wikipedia: NO_ARTICLE, directories }).action;
      expect(registryNames.filter((n) => new RegExp(`\\b${n}\\b`).test(text))).toEqual([]);
    }
  });
});

describe("the notable path is unchanged", () => {
  it("still asks for a Wikipedia article, at High", () => {
    const recs = evaluateTriggers(ctx, {
      ...NO_EVIDENCE,
      wikipedia: NO_ARTICLE,
      notability: {
        status: "ok",
        data: {
          qualifyingSources: [
            { url: "https://abc.test/a", outlet: "ABC News", scope: "national" },
            { url: "https://smh.test/b", outlet: "Sydney Morning Herald", scope: "regional" },
          ],
        },
      },
    });
    expect(recs.find((r) => r.recommendationKey === "entity-profiles")).toBeUndefined();
    const rec = recs.find((r) => r.recommendationKey === "wikipedia-article");
    expect(rec?.title).toBe("Draft a Wikipedia article for your business");
    expect(rec?.expectedImpactScore).toBe("high");
    expect(rec?.action).toContain("ABC News and Sydney Morning Herald");
  });
});

describe("existing items change at read time, from stored fields", () => {
  const OLD_ACTION =
    "We checked: there's no Wikipedia article for your business. Instead: (1) complete your Google Business Profile; (2) create a Wikidata item for your business; (3) pitch a story to local and regional press.";

  it("a legacy 'Check: Build your entity profile beyond Wikipedia' row reads with the new title", () => {
    const stored = {
      recommendationKey: "entity-profiles",
      confidenceBasis: null,
      title: "Build your entity profile beyond Wikipedia",
    };
    expect(displayRecommendationTitle(stored)).toBe(`Check: ${TITLE}`);
  });

  it("a stored action with the Wikidata step shows the current words, naming no directory", () => {
    const stored = {
      recommendationKey: "entity-profiles",
      confidenceBasis: "verified",
      action: OLD_ACTION,
    };
    const text = displayRecommendationAction(stored);
    expect(text).not.toMatch(/wikidata/i);
    expect(text).toBe(CHECKED);
    expect(text).not.toContain("hipages");
  });

  it("any other recommendation's action is shown as stored", () => {
    const stored = {
      recommendationKey: "stale-content",
      confidenceBasis: "verified",
      action: "Update the page.",
    };
    expect(displayRecommendationAction(stored)).toBe("Update the page.");
  });
});
