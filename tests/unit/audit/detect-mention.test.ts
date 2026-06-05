import { describe, expect, it } from "vitest";
import { detectBrandMention } from "@/lib/audit/detect-mention";

describe("detectBrandMention", () => {
  const brand = { name: "Bondi Plumbing", domain: "bondiplumbing.com.au" };

  it("exact match returns found=true", async () => {
    const r = await detectBrandMention("Bondi Plumbing is the best choice.", brand);
    expect(r.found).toBe(true);
    expect(r.detectionMethod).toBe("regex");
  });
  it("case-insensitive match", async () => {
    const r = await detectBrandMention("BONDI PLUMBING is highly rated.", brand);
    expect(r.found).toBe(true);
  });
  it("hyphenated variant", async () => {
    const r = await detectBrandMention("Bondi-Plumbing offers great service.", brand);
    expect(r.found).toBe(true);
  });
  it("& vs and variant", async () => {
    const b2 = { name: "Smith and Jones Plumbing", domain: "smithjones.com.au" };
    const r = await detectBrandMention("Smith & Jones Plumbing are recommended.", b2);
    expect(r.found).toBe(true);
  });
  it("not mentioned → found=false", async () => {
    const r = await detectBrandMention("Eastern Plumbing Co is the best.", brand);
    expect(r.found).toBe(false);
    expect(r.detectionMethod).toBe("none");
  });
  it("domain stem fallback via entity detection", async () => {
    const r = await detectBrandMention("Check bondiplumbing.com.au for quotes.", brand);
    expect(r.found).toBe(true);
    expect(r.detectionMethod).toBe("entity");
  });
  it("empty response → found=false", async () => {
    const r = await detectBrandMention("", brand);
    expect(r.found).toBe(false);
  });
  it("partial name does not match (word boundary)", async () => {
    const r = await detectBrandMention("Bondi Beach is beautiful.", brand);
    expect(r.found).toBe(false);
  });
});
