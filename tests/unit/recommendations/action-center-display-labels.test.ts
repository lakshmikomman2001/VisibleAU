/**
 * "Two wrong labels on the Action Center" (24 Oct).
 *
 * Item 1 -- a directory-visibility item reads "You told us" / "Confirmed" only when an owner
 * statement for a directory its title names backs it; citation counts alone read "Measured in
 * this audit" / "Measured". Production's Omega item ("AI cited hipages in 9 of 40 answers --
 * confirm your status, and 6 more directories") was stored with confidence_basis 'verified' by
 * code from before ccb2719, while brand_directory_listings had no rows for Omega at all.
 *
 * Item 2 -- entity-profiles is Low and names its real steps; the notable-business path
 * ("Draft a Wikipedia article") keeps its High.
 *
 * Item 3 -- one basis -> label mapping, read by both the pill and the meta line.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type DisplayBasis,
  displayBasisLabels,
  displayImpact,
  displayRecommendationTitle,
  type OwnerDirectoryStatement,
  resolveDisplayBasis,
} from "@/lib/recommendations/confidence-labels";
import { ENTITY_PROFILES_TITLE } from "@/lib/recommendations/entity-profiles";
import {
  type DirectoryVisibilityFinding,
  NO_EVIDENCE,
  type RecommendationEvidence,
} from "@/lib/recommendations/evidence";
import { evaluateTriggers } from "@/lib/recommendations/triggers";
import type { TriggerContext } from "@/lib/recommendations/types";

function ctx(overrides: Partial<TriggerContext> = {}): TriggerContext {
  return {
    scoreFrequency: "20.00",
    scoreSentimentNumeric: "80.00",
    scoreContextNumeric: "80.00",
    scoreComposite: "40.00",
    confidenceIntervals: {},
    vertical: "tradies",
    mentionDetail: { mentionedCount: 6, rankedCount: 6, medianPosition: 2, sourcedCount: 5 },
    ...overrides,
  };
}

function evidence(overrides: Partial<RecommendationEvidence> = {}): RecommendationEvidence {
  return { ...NO_EVIDENCE, ...overrides };
}

function citationRef(directory: string, n: number) {
  return {
    source: directory,
    url: `https://${directory.toLowerCase().replace(/\s+/g, "")}.com.au/connect/competitor-${n}`,
    summary: `${directory} was cited in 9 of 40 answers to everyday customer questions (questions that don't name your business) (checked 2026-10-20).`,
    sourceType: "checker",
  };
}

// The stored shape of production's Omega item: 27 citation refs across 7 directories, no owner refs.
const OMEGA_DIRECTORY_ITEM = {
  recommendationKey: "directory-visibility",
  confidenceBasis: "verified",
  title: "AI cited hipages in 9 of 40 answers — confirm your status, and 6 more directories",
  evidenceRefs: Array.from({ length: 27 }, (_, i) =>
    citationRef(
      [
        "hipages",
        "ServiceSeeking",
        "Oneflare",
        "Airtasker",
        "Yellow Pages",
        "True Local",
        "Word of Mouth",
      ][i % 7],
      i,
    ),
  ),
};

const OWNER_STATED_ITEM = {
  recommendationKey: "directory-visibility",
  confidenceBasis: "verified",
  title: "AI cited hipages in 9 of 40 answers — you told us you're not listed",
  evidenceRefs: [
    citationRef("hipages", 1),
    {
      source: "hipages",
      url: "",
      summary: "You told us on 2026-10-19 that you're not listed on hipages.",
      sourceType: "checker",
    },
  ],
};

const HIPAGES_NOT_LISTED: OwnerDirectoryStatement = {
  directoryKey: "hipages",
  status: "not_listed",
};

describe("directory-visibility basis (item 1)", () => {
  it("Omega's stored item with no owner rows is 'Measured in this audit' / 'Measured', never 'You told us' / 'Confirmed'", () => {
    const basis = resolveDisplayBasis(OMEGA_DIRECTORY_ITEM, []);
    expect(basis).toBe("measured_citations");
    expect(displayBasisLabels(basis)).toEqual({ chip: "Measured", text: "Measured in this audit" });
  });

  it("with an owner row for the lead directory that the item was generated from, it's 'You told us' / 'Confirmed'", () => {
    const basis = resolveDisplayBasis(OWNER_STATED_ITEM, [HIPAGES_NOT_LISTED]);
    expect(basis).toBe("owner_confirmed");
    expect(displayBasisLabels(basis)).toEqual({ chip: "Confirmed", text: "You told us" });
  });

  it("an owner who confirms AFTER the item was generated doesn't relabel it -- its text still asks them to confirm", () => {
    expect(resolveDisplayBasis(OMEGA_DIRECTORY_ITEM, [HIPAGES_NOT_LISTED])).toBe(
      "measured_citations",
    );
  });

  it("an owner row for a directory the title doesn't name isn't 'You told us'", () => {
    expect(
      resolveDisplayBasis(OWNER_STATED_ITEM, [{ directoryKey: "oneflare", status: "not_listed" }]),
    ).toBe("measured_citations");
  });

  it("'Not sure' is not a statement", () => {
    expect(
      resolveDisplayBasis(OWNER_STATED_ITEM, [{ directoryKey: "hipages", status: "unsure" }]),
    ).toBe("measured_citations");
  });

  it("an 'inferred' row (generated with no owner statement) stays Measured whatever the owner says later", () => {
    expect(
      resolveDisplayBasis({ ...OWNER_STATED_ITEM, confidenceBasis: "inferred" }, [
        HIPAGES_NOT_LISTED,
      ]),
    ).toBe("measured_citations");
  });

  it("reads the original Part E title format too ('AI is citing X and Y, but you told us you're not listed')", () => {
    const partE = {
      ...OWNER_STATED_ITEM,
      title: "AI is citing hipages and Oneflare, but you told us you're not listed",
      evidenceRefs: [
        citationRef("Oneflare", 1),
        {
          source: "Oneflare",
          url: "",
          summary: "You told us on 2026-10-21 that you're not listed on Oneflare.",
          sourceType: "checker",
        },
      ],
    };
    expect(resolveDisplayBasis(partE, [{ directoryKey: "oneflare", status: "not_listed" }])).toBe(
      "owner_confirmed",
    );
  });

  it("a legacy row (no confidence_basis) is still 'Not verified'", () => {
    expect(
      resolveDisplayBasis({ ...OWNER_STATED_ITEM, confidenceBasis: null }, [HIPAGES_NOT_LISTED]),
    ).toBe("unverified");
  });

  describe("round trip through the real rule (evaluateTriggers)", () => {
    function finding(
      overrides: Partial<DirectoryVisibilityFinding> = {},
    ): DirectoryVisibilityFinding {
      const url = "https://hipages.com.au/connect/competitor-1";
      return {
        key: "hipages",
        name: "hipages",
        citedCount: 9,
        totalAnswers: 40,
        citedUrls: [{ url, displayUrl: url }],
        ownerProfileCited: false,
        ownerStatus: null,
        ownerConfirmedAt: null,
        ...overrides,
      };
    }

    function generate(f: DirectoryVisibilityFinding) {
      const recs = evaluateTriggers(
        ctx(),
        evidence({
          directories: {
            status: "ok",
            data: { computedAt: "2026-10-20T00:00:00.000Z", findings: [f] },
          },
        }),
      );
      const rec = recs.find((r) => r.recommendationKey === "directory-visibility");
      if (!rec) throw new Error("directory-visibility did not fire");
      return rec;
    }

    it("a finding the owner never confirmed renders Measured", () => {
      expect(resolveDisplayBasis(generate(finding()), [])).toBe("measured_citations");
    });

    it("a finding the owner said 'not listed' to renders You told us", () => {
      const rec = generate(
        finding({ ownerStatus: "not_listed", ownerConfirmedAt: "2026-10-19T00:00:00.000Z" }),
      );
      expect(rec.title).toMatch(/you told us you're not listed/);
      expect(resolveDisplayBasis(rec, [HIPAGES_NOT_LISTED])).toBe("owner_confirmed");
    });
  });
});

describe("entity-profiles priority and title (item 2)", () => {
  const noArticle = {
    status: "ok" as const,
    data: { articleExists: false, articleUrl: null, query: "Omega Services Australia" },
  };

  it("a local business that isn't notable for Wikipedia gets Low and a title naming the real steps", () => {
    const rec = evaluateTriggers(ctx(), evidence({ wikipedia: noArticle })).find(
      (r) => r.recommendationKey === "entity-profiles",
    );
    expect(rec?.expectedImpactScore).toBe("low");
    expect(rec?.title).toBe(ENTITY_PROFILES_TITLE);
    expect(rec?.title).not.toMatch(/wikipedia/i);
    // The title's three names are the action's own three steps.
    expect(rec?.action).toMatch(/Google Business Profile/);
    expect(rec?.action).toMatch(/directories/);
    expect(rec?.action).toMatch(/local press/);
  });

  it("the 'couldn't check Wikipedia' path is Low too -- same steps, even less evidence", () => {
    const rec = evaluateTriggers(
      ctx(),
      evidence({ wikipedia: { status: "unavailable", reason: "HTTP 503" } }),
    ).find((r) => r.recommendationKey === "entity-profiles");
    expect(rec?.expectedImpactScore).toBe("low");
  });

  it("the notable path keeps its current behaviour: High, 'Draft a Wikipedia article for your business'", () => {
    const recs = evaluateTriggers(
      ctx(),
      evidence({
        wikipedia: noArticle,
        notability: {
          status: "ok",
          data: {
            qualifyingSources: [
              { outlet: "The Daily Telegraph", scope: "regional", url: "https://example.test/a" },
              { outlet: "Inner West Courier", scope: "local", url: "https://example.test/b" },
            ],
          },
        },
      }),
    );
    expect(recs.find((r) => r.recommendationKey === "entity-profiles")).toBeUndefined();
    const rec = recs.find((r) => r.recommendationKey === "wikipedia-article");
    expect(rec?.expectedImpactScore).toBe("high");
    expect(rec?.title).toBe("Draft a Wikipedia article for your business");
  });

  it("an item stored before this change reads Low with the new title at read time, no data change", () => {
    const stored = {
      recommendationKey: "entity-profiles",
      confidenceBasis: "verified",
      title: "Build your entity profile beyond Wikipedia",
      expectedImpactScore: "high",
    };
    expect(displayImpact(stored)).toBe("low");
    expect(displayRecommendationTitle(stored)).toBe(ENTITY_PROFILES_TITLE);
  });

  it("read time leaves a stored wikipedia-article (notable path) item alone", () => {
    const stored = {
      recommendationKey: "wikipedia-article",
      confidenceBasis: "verified",
      title: "Draft a Wikipedia article for your business",
      expectedImpactScore: "high",
    };
    expect(displayImpact(stored)).toBe("high");
    expect(displayRecommendationTitle(stored)).toBe("Draft a Wikipedia article for your business");
  });
});

describe("one basis -> label mapping (item 3)", () => {
  const EXPECTED: Record<DisplayBasis, { chip: string; text: string }> = {
    measured_citations: { chip: "Measured", text: "Measured in this audit" },
    owner_confirmed: { chip: "Confirmed", text: "You told us" },
    checked_source: { chip: "Checked", text: "Checked 20 Oct 2026" },
    unverified: { chip: "Not verified", text: "Not verified" },
  };

  it.each(Object.keys(EXPECTED) as DisplayBasis[])("%s", (basis) => {
    expect(displayBasisLabels(basis, new Date("2026-10-20T03:00:00.000Z"))).toEqual(
      EXPECTED[basis],
    );
  });

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sourceFiles(path);
      return /\.(ts|tsx)$/.test(name) ? [path] : [];
    });
  }

  it("no file outside lib/recommendations/confidence-labels.ts maps a basis to its pill or meta text", () => {
    const BASIS_TO_LABEL =
      /(owner_confirmed|checked_source|measured_citations|unverified)["']?\s*:\s*["'`](Confirmed|Checked|Measured|Not verified|You told us)/;
    const offenders = ["app", "components", "lib"]
      .flatMap(sourceFiles)
      .filter(
        (path) => !path.replace(/\\/g, "/").endsWith("lib/recommendations/confidence-labels.ts"),
      )
      .filter((path) => {
        const src = readFileSync(path, "utf8");
        return BASIS_TO_LABEL.test(src) || src.includes('"Measured in this audit"');
      });
    expect(offenders).toEqual([]);
  });
});
