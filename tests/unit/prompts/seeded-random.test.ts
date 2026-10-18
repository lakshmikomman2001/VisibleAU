import { describe, expect, it } from "vitest";
import { seededShuffle } from "@/lib/prompts/seeded-random";

describe("seededShuffle", () => {
  it("is deterministic -- the same seed always produces the same order", () => {
    const arr = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const first = seededShuffle(arr, "brand-123");
    const second = seededShuffle(arr, "brand-123");
    expect(second).toEqual(first);
  });

  it("produces a different order for a different seed", () => {
    const arr = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const a = seededShuffle(arr, "brand-123");
    const b = seededShuffle(arr, "brand-456");
    expect(a).not.toEqual(b);
  });

  it("never reorders via Math.random -- stubbing it out changes nothing", () => {
    const arr = ["a", "b", "c", "d", "e"];
    const before = seededShuffle(arr, "seed-x");
    const original = Math.random;
    Math.random = () => 0;
    try {
      const after = seededShuffle(arr, "seed-x");
      expect(after).toEqual(before);
    } finally {
      Math.random = original;
    }
  });

  it("does not mutate the input array", () => {
    const arr = ["a", "b", "c"];
    const copy = [...arr];
    seededShuffle(arr, "seed");
    expect(arr).toEqual(copy);
  });

  it("preserves every element -- a permutation, not a resample", () => {
    const arr = ["a", "b", "c", "d", "e", "f"];
    const shuffled = seededShuffle(arr, "seed-y");
    expect([...shuffled].sort()).toEqual([...arr].sort());
  });
});
