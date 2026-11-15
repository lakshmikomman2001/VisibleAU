/**
 * 17 Nov, part 1 -- the Visibility page's "Mentions and sources" card's figures and state come only from one audit's
 * own counts (lib/visibility/mentions-and-sources.ts), by the audit page's definitions; a figure that can't be
 * measured is "Not measured for this audit", never 0.0%, and then there's no state.
 */
import { describe, expect, it } from "vitest";
import { sourceCitationCard } from "@/lib/scoring/measured-display";
import { visibilityDisplay } from "@/lib/scoring/visibility-display";
import {
  type MentionsAndSourcesInput,
  mentionsAndSources,
  NAMED_OFTEN_PERCENT,
} from "@/lib/visibility/mentions-and-sources";

function audit(
  mentionedCount: number,
  sampleCount: number,
  sourcedCount: number,
  extra: Partial<MentionsAndSourcesInput> = {},
): MentionsAndSourcesInput {
  return {
    auditNumber: 50,
    headline:
      sampleCount >= 10
        ? { status: "scored", value: (mentionedCount / sampleCount) * 100 }
        : { status: "insufficient_data" },
    sampleCount,
    mentionedCount,
    sourcedCount,
    ...extra,
  };
}

const verdictOf = (input: MentionsAndSourcesInput) => {
  const r = mentionsAndSources(input);
  return r.state === "measured" ? (r.verdict?.key ?? null) : null;
};

describe("Hero's audit #50: 13 of 40, 13 of 13", () => {
  const r = mentionsAndSources(audit(13, 40, 13));
  it("shows the audit page's own figures", () => {
    expect(r.state).toBe("measured");
    if (r.state !== "measured") return;
    const page = visibilityDisplay({
      headline: { status: "scored", value: 32.5, ci: { lower: 0, upper: 0 } },
      mentionedCount: 13,
      sampleCount: 40,
    });
    const sources = sourceCitationCard({
      mentionedCount: 13,
      sourcedCount: 13,
      rankedCount: 0,
      medianPosition: null,
    });
    expect(r.mentioned).toEqual({ value: page.value, counts: page.detail, band: page.band });
    expect(r.mentioned.value).toBe("33%");
    expect(r.mentioned.counts).toBe("13 of 40");
    expect(r.sources).toMatchObject({
      state: "measured",
      value: "13 of 13",
      detail: "mentions linked a source",
      percent: "100%",
    });
    expect(sources.kind === "measured" && sources.line).toBe("13 of 13 mentions linked a source");
    expect(r.auditNumber).toBe(50);
    expect(r.verdict?.label).toBe("Named often, with sources");
  });
});

describe("the state changes only with the figures", () => {
  it("each threshold, on each side", () => {
    // Named often = at least 1 in 5 everyday answers (20%).
    expect(NAMED_OFTEN_PERCENT).toBe(20);
    expect(verdictOf(audit(8, 40, 8))).toBe("often_with_sources"); // 20%
    expect(verdictOf(audit(7, 40, 7))).toBe("rarely_with_sources"); // 17.5%
    // With sources = at least half the mentions (the report's rule).
    expect(verdictOf(audit(13, 40, 7))).toBe("often_with_sources"); // 7 of 13
    expect(verdictOf(audit(13, 40, 6))).toBe("often_few_sources"); // 6 of 13
    expect(verdictOf(audit(3, 40, 1))).toBe("rarely_few_sources");
  });

  it("nothing but the figures moves it: the audit number, engine coverage and a trend exclusion don't", () => {
    const base = verdictOf(audit(13, 40, 6));
    expect(verdictOf(audit(13, 40, 6, { auditNumber: 49 }))).toBe(base);
    expect(verdictOf(audit(13, 40, 6, { coverage: "3 of 4 engines" }))).toBe(base);
    expect(verdictOf(audit(13, 40, 6, { excludedFromTrends: "Excluded from trends: test" }))).toBe(
      base,
    );
  });
});

describe("a figure that can't be measured", () => {
  it("too few answers: not measured, with why; no figures, no state", () => {
    const r = mentionsAndSources(audit(1, 4, 1));
    expect(r.state).toBe("not_measured");
    if (r.state !== "not_measured") return;
    expect(r.reason).toBe(
      "Not measured for this audit: fewer than 10 everyday answers came back (4).",
    );
    expect(JSON.stringify(r)).not.toMatch(/0\.0%|verdict/);
  });

  it("no mention: 0% mentioned is measured, sources aren't; no state", () => {
    const r = mentionsAndSources(audit(0, 40, 0));
    expect(r.state).toBe("measured");
    if (r.state !== "measured") return;
    expect(r.mentioned.value).toBe("0%");
    expect(r.sources).toEqual({
      state: "not_measured",
      reason: "Not measured for this audit: AI didn't name you, so there's no mention to check.",
    });
    expect(r.verdict).toBeNull();
  });

  it("no audit yet", () => {
    expect(mentionsAndSources(null)).toEqual({ state: "no_audit", reason: "No audit yet" });
  });
});

describe("the card's module stays client-safe", () => {
  it("imports nothing that reaches the database (the loader is mentions-and-sources-for-audit.ts)", async () => {
    const { readFileSync } = await import("node:fs");
    const code = readFileSync("lib/visibility/mentions-and-sources.ts", "utf-8");
    const imports = [...code.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
    for (const path of imports) {
      expect(path, path).not.toMatch(
        /^@\/db|drizzle|postgres|resolve-audit-dimensions|share-of-voice"?$|engine-failure/,
      );
    }
  });
});
