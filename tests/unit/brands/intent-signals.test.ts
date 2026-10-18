import { describe, expect, it } from "vitest";
import { sanitizeIntentSignal, sanitizeIntentSignals } from "@/lib/brands/intent-signals";

describe("sanitizeIntentSignal (Vunnara Build 1, Part C.7)", () => {
  it("strips 'near me', keeping the rest", () => {
    expect(sanitizeIntentSignal("plumber near me Bondi")).toBe("plumber Bondi");
  });
  it("strips 'nearby'", () => {
    expect(sanitizeIntentSignal("find a nearby plumber")).toBe("find a plumber");
  });
  it("strips 'in my area'", () => {
    expect(sanitizeIntentSignal("electrician in my area")).toBe("electrician");
  });
  it("strips 'close to me'", () => {
    expect(sanitizeIntentSignal("dentist close to me")).toBe("dentist");
  });
  it("is case-insensitive", () => {
    expect(sanitizeIntentSignal("Plumber NEAR ME")).toBe("Plumber");
  });
  it("drops a signal that becomes empty after stripping", () => {
    expect(sanitizeIntentSignal("near me")).toBeNull();
    expect(sanitizeIntentSignal("  nearby  ")).toBeNull();
  });
  it("leaves a signal with no location-dependent phrase unchanged", () => {
    expect(sanitizeIntentSignal("emergency plumbing services Sydney")).toBe(
      "emergency plumbing services Sydney",
    );
  });
  it("is safe to call repeatedly across many different strings (no global-regex lastIndex carryover)", () => {
    const inputs = [
      "plumber near me",
      "emergency plumbing services Sydney",
      "electrician in my area",
      "residential plumbing repairs Bondi Beach",
      "dentist close to me",
    ];
    const results = inputs.map(sanitizeIntentSignal);
    expect(results).toEqual([
      "plumber",
      "emergency plumbing services Sydney",
      "electrician",
      "residential plumbing repairs Bondi Beach",
      "dentist",
    ]);
  });
});

describe("sanitizeIntentSignals", () => {
  it("filters out drops and de-duplicates (case-insensitive)", () => {
    expect(
      sanitizeIntentSignals([
        "plumber near me Bondi",
        "near me",
        "Plumber Bondi",
        "emergency plumbing services Sydney",
      ]),
    ).toEqual(["plumber Bondi", "emergency plumbing services Sydney"]);
  });
});
