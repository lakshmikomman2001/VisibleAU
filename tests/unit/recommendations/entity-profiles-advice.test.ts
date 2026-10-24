/**
 * "Cost honesty" (25 Oct), item 4 -- entity-profile advice for local businesses (option A).
 */
import { describe, expect, it } from "vitest";
import { DIRECTORY_REGISTRY } from "@/lib/directories/registry";
import {
  displayRecommendationAction,
  displayRecommendationTitle,
} from "@/lib/recommendations/confidence-labels";
import { ENTITY_PROFILES_TITLE, entityProfilesSteps } from "@/lib/recommendations/entity-profiles";
import {
  type DirectoryVisibilityFinding,
  NO_EVIDENCE,
  type RecommendationEvidence,
} from "@/lib/recommendations/evidence";
import { evaluateTriggers } from "@/lib/recommendations/triggers";
import type { TriggerContext, TriggeredRecommendation } from "@/lib/recommendations/types";

const TITLE = "Strengthen your business profiles on Google, trade directories and local press";

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

/** The step list: everything after "Instead:" (the opening sentence explains the Wikipedia check). */
function steps(action: string): string {
  return action.slice(action.indexOf("Instead:"));
}

/** Step (2) alone -- step (1) names Google Business Profile by design. */
function directoryStep(action: string): string {
  return action.slice(action.indexOf("(2)"), action.indexOf("(3)"));
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
  it("the not-notable path's title is the new one, with no Wikipedia or Wikidata in the title or steps", () => {
    const rec = entityProfiles({ wikipedia: NO_ARTICLE });
    expect(rec.title).toBe(TITLE);
    expect(ENTITY_PROFILES_TITLE).toBe(TITLE);
    expect(displayRecommendationTitle(rec)).toBe(TITLE);
    expect(rec.expectedImpactScore).toBe("low");
    expect(`${rec.title} ${steps(rec.action)}`).not.toMatch(/wikipedia|wikidata/i);
  });

  it("the couldn't-check path shows the same title with the existing 'Check: ' prefix", () => {
    const rec = entityProfiles({ wikipedia: { status: "unavailable", reason: "HTTP 503" } });
    expect(rec.title).toBe(TITLE);
    expect(displayRecommendationTitle(rec)).toBe(`Check: ${TITLE}`);
    expect(rec.expectedImpactScore).toBe("low");
    expect(`${rec.title} ${steps(rec.action)}`).not.toMatch(/wikipedia|wikidata/i);
  });

  it("the steps are Google Business Profile, the cited directories, then local press", () => {
    const text = steps(entityProfiles({ wikipedia: NO_ARTICLE, ...CITED }).action);
    expect(text).toMatch(/\(1\) complete your Google Business Profile .* keep it current;/);
    expect(text).toMatch(
      /\(2\) claim or complete your profiles on the directories AI cited in this audit/,
    );
    expect(text).toMatch(/\(3\) get your business covered in local press or on community sites\.$/);
  });
});

describe("the directory step names only directories in this audit's evidence", () => {
  const registryNames = Object.values(DIRECTORY_REGISTRY)
    .flat()
    .map((d) => d.name);

  it("names exactly the cited ones, most-cited first", () => {
    const text = directoryStep(entityProfiles({ wikipedia: NO_ARTICLE, ...CITED }).action);
    expect(text).toContain("Word of Mouth, hipages and Yellow Pages");
    const named = registryNames.filter((n) => new RegExp(`\\b${n}\\b`).test(text));
    expect(named.sort()).toEqual(["Word of Mouth", "Yellow Pages", "hipages"].sort());
  });

  it("names none when the audit cited none, or its directory evidence is missing", () => {
    for (const directories of [
      { status: "ok" as const, data: { computedAt: "2026-10-24T00:00:00.000Z", findings: [] } },
      { status: "not_run" as const },
    ]) {
      const text = directoryStep(entityProfiles({ wikipedia: NO_ARTICLE, directories }).action);
      expect(registryNames.filter((n) => new RegExp(`\\b${n}\\b`).test(text))).toEqual([]);
      expect(text).toContain("the directories your customers use");
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

  it("a stored action with the Wikidata step shows the new steps, naming the audit's cited directories", () => {
    const stored = {
      recommendationKey: "entity-profiles",
      confidenceBasis: "verified",
      action: OLD_ACTION,
    };
    const text = displayRecommendationAction(stored, ["hipages"]);
    expect(text).not.toMatch(/wikidata/i);
    expect(steps(text)).toBe(`Instead: ${entityProfilesSteps(["hipages"])}`);
    expect(text).toContain("the directories AI cited in this audit — hipages —");
  });

  it("any other recommendation's action is shown as stored", () => {
    const stored = {
      recommendationKey: "stale-content",
      confidenceBasis: "verified",
      action: "Update the page.",
    };
    expect(displayRecommendationAction(stored, ["hipages"])).toBe("Update the page.");
  });
});
