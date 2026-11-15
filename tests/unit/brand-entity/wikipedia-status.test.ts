/**
 * 17 Nov, part 3 -- a Wikipedia lookup that failed (timeout, HTTP error) was stored as "not found", and the
 * Brand & Entity page said "Checked Wikipedia — no Australian page found". The technical audit keeps the lookup's
 * own state now (findings.brandEntity.wikipediaAuStatus); agent readiness reads it too (it hard-coded false).
 */
import { describe, expect, it } from "vitest";
import { wikipediaStatusFromFindings } from "@/lib/brand-entity/wikipedia-au";

describe("wikipediaStatusFromFindings", () => {
  it("reads the stored state", () => {
    for (const status of ["found", "not_found", "unavailable"] as const) {
      expect(wikipediaStatusFromFindings({ brandEntity: { wikipediaAuStatus: status } })).toBe(
        status,
      );
    }
  });

  it("an audit from before 17 Nov (true/false only) can't say: null", () => {
    expect(wikipediaStatusFromFindings({ brandEntity: { wikipediaAuPresent: false } })).toBeNull();
    expect(wikipediaStatusFromFindings({})).toBeNull();
    expect(wikipediaStatusFromFindings(null)).toBeNull();
    expect(wikipediaStatusFromFindings({ brandEntity: { wikipediaAuStatus: "maybe" } })).toBeNull();
  });
});
