import { describe, expect, it } from "vitest";
import { detectBrandMention } from "@/lib/audit/detect-mention";

describe("detectBrandMention", () => {
  const brand = { name: "Bondi Plumbing", domain: "bondiplumbing.com.au" };

  it("exact match returns found=true", async () => {
    const r = await detectBrandMention("Bondi Plumbing is the best choice.", brand);
    expect(r.found).toBe(true);
    expect(r.detectionMethod).toBe("regex");
  });
  it("matchIndex points at the real character offset of the match (audit reliability Part B -- verifyMention's location window anchors on this)", async () => {
    const text = "Call us today. Bondi Plumbing is the best choice.";
    const r = await detectBrandMention(text, brand);
    expect(r.matchIndex).toBe(text.indexOf("Bondi Plumbing"));
  });
  it("entity-detection match also sets matchIndex", async () => {
    const text = "Check sydneyplumber.com.au for quotes.";
    const r = await detectBrandMention(text, { name: "Bondi Plumbing", domain: "sydneyplumber.com.au" });
    expect(r.detectionMethod).toBe("entity");
    expect(r.matchIndex).toBe(text.indexOf("sydneyplumber"));
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
    expect(r.matchIndex).toBeNull();
  });
  it("domain stem fallback via entity detection (when the domain doesn't textually resemble the name)", async () => {
    // Vunnara Build 1, Part A: brandNamePattern's separator class is
    // zero-or-more ([\s-–—&'’.]*), so a domain that's just the name with
    // no separators ("bondiplumbing") now matches via regexDetect
    // itself -- correctly, a stronger/more confident detection, not a
    // regression. This fixture uses a domain that bears no textual
    // resemblance to the brand name, so only entityDetect's domain-stem
    // match can find it, keeping real coverage of that code path.
    const r = await detectBrandMention("Check sydneyplumber.com.au for quotes.", {
      name: "Bondi Plumbing",
      domain: "sydneyplumber.com.au",
    });
    expect(r.found).toBe(true);
    expect(r.detectionMethod).toBe("entity");
  });
  it("a domain that's the name with no separator now matches via regex, not entity (stronger detection, not a regression)", async () => {
    const r = await detectBrandMention("Check bondiplumbing.com.au for quotes.", brand);
    expect(r.found).toBe(true);
    expect(r.detectionMethod).toBe("regex");
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
