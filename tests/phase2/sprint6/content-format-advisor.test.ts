import { describe, it, expect } from "vitest";
import { recommendFormat } from "@/lib/retrieval/content-format-advisor";

describe("recommendFormat — 3:1 listicle:how-to rule", () => {
  it("recommends how_to when listicle dominant (>=3:0 ratio)", () => {
    const result = recommendFormat("chatgpt", "informational", {
      listicle: 5,
      how_to_guide: 0,
    });
    expect(result.recommended).toBe("how_to_guide");
  });

  it("recommends how_to when listicle:how-to ratio > 3:1", () => {
    const result = recommendFormat("chatgpt", "informational", {
      listicle: 8,
      how_to_guide: 1,
    });
    expect(result.recommended).toBe("how_to_guide");
  });

  it("returns engine default when mix is balanced", () => {
    const result = recommendFormat("chatgpt", "informational", {
      listicle: 3,
      how_to_guide: 3,
    });
    expect(result.recommended).toBeDefined();
  });

  it("returns engine default for empty mix", () => {
    const result = recommendFormat("chatgpt", "informational", {});
    expect(result.recommended).toBeDefined();
    expect(result.reason).toBeDefined();
  });
});
