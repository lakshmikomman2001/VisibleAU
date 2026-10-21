/**
 * Sri, 21 Oct follow-up, item 5 -- recomputeEntityDisplayScore is the
 * one shared read-time conversion from a brand_entity_scores row's own
 * abn/wikipedia/auTld facts to a 0-100 display percentage, replacing
 * three independent copies that each read the STORED score_of_10
 * column directly (one correctly divided by the new 8-point max, one
 * used a hardcoded literal 10, one didn't convert at all) -- any of
 * those is wrong for a row computed before this hotfix, because
 * score_of_10 used to run up to 10 (the same three facts, PLUS up to 2
 * points from the now-deleted directory checker).
 */
import { describe, expect, it } from "vitest";
import { recomputeEntityDisplayScore } from "@/lib/brand-entity/score";

describe("recomputeEntityDisplayScore", () => {
  it("every fact false -> 0", () => {
    expect(
      recomputeEntityDisplayScore({ abnVerified: false, wikipediaAuPresent: false, auTldPresent: false }),
    ).toBe(0);
  });

  it("every fact true -> 100, regardless of what score_of_10 used to allow beyond 8", () => {
    expect(
      recomputeEntityDisplayScore({ abnVerified: true, wikipediaAuPresent: true, auTldPresent: true }),
    ).toBe(100);
  });

  it("auTld only -> 2/8 = 25", () => {
    expect(
      recomputeEntityDisplayScore({ abnVerified: false, wikipediaAuPresent: false, auTldPresent: true }),
    ).toBe(25);
  });

  it("abn + wikipedia (no auTld) -> 6/8 = 75", () => {
    expect(
      recomputeEntityDisplayScore({ abnVerified: true, wikipediaAuPresent: true, auTldPresent: false }),
    ).toBe(75);
  });

  it("a null auTldPresent (the real column's nullability) is treated as false, never thrown on", () => {
    expect(
      recomputeEntityDisplayScore({ abnVerified: true, wikipediaAuPresent: false, auTldPresent: null }),
    ).toBe(38); // abn only -> 3/8 = 37.5 -> rounds to 38
  });

  // The exact scenario this item fixes: a pre-hotfix row's score_of_10
  // ran up to 10 (these same three facts, plus a now-discredited
  // directory signal worth up to 2) -- this function never reads that
  // column at all, so an old row and a new row with the SAME three
  // facts always produce the SAME display score.
  it("never reads score_of_10 -- an extra, unrelated field on the row changes nothing", () => {
    const facts = { abnVerified: true, wikipediaAuPresent: false, auTldPresent: true };
    const withoutLegacyField = recomputeEntityDisplayScore(facts);
    const withLegacyField = recomputeEntityDisplayScore({
      ...facts,
      // @ts-expect-error -- deliberately passing an extra field a real
      // DB row would have (score_of_10), to prove it's ignored.
      scoreOf10: "9.00",
    });
    expect(withLegacyField).toBe(withoutLegacyField);
    expect(withoutLegacyField).toBe(63); // abn + auTld -> 5/8 = 62.5 -> 63
  });
});
