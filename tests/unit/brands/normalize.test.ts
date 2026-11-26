import { describe, expect, it } from "vitest";
import { brandNamePattern, domainStem, normalizeBrandName } from "@/lib/brands/normalize";

describe("normalizeBrandName", () => {
  it("trims leading/trailing whitespace", () => {
    expect(normalizeBrandName("  Yabby Services  ")).toBe("Yabby Services");
  });
  it("collapses internal whitespace to single spaces", () => {
    expect(normalizeBrandName("Yabby    Services")).toBe("Yabby Services");
    expect(normalizeBrandName("Yabby\tServices")).toBe("Yabby Services");
  });
  it("NFKC-normalizes Unicode (e.g. fullwidth forms collapse to ASCII)", () => {
    // U+FF2F etc. (fullwidth "YABBY") NFKC-normalizes to plain ASCII.
    expect(normalizeBrandName("ＹＡＢＢＹ")).toBe("YABBY");
  });
  it("a leading-space stored name normalizes the same as the clean one", () => {
    expect(normalizeBrandName(" Yabby Services")).toBe(normalizeBrandName("Yabby Services"));
  });
});

describe("domainStem", () => {
  it("strips a .com.au TLD and non-letters", () => {
    expect(domainStem("yabby-services.com.au")).toBe("yabbyservices");
  });
  it("strips a plain .com TLD", () => {
    expect(domainStem("galahplumbing.com")).toBe("galahplumbing");
  });
  it("lowercases", () => {
    expect(domainStem("YABBY-SERVICES.COM.AU")).toBe("yabbyservices");
  });
  it("strips a protocol and path if present", () => {
    expect(domainStem("https://yabby-services.com.au/contact")).toBe("yabbyservices");
  });
});

describe("brandNamePattern (Vunnara Build 1, Part A)", () => {
  const NAME = "Yabby Services";

  it("matches a quoted mention", () => {
    expect('"Yabby Services" is a great choice.').toMatch(brandNamePattern(NAME));
  });
  it("matches a markdown-bolded mention", () => {
    expect("**Yabby Services** is a great choice.").toMatch(brandNamePattern(NAME));
  });
  it("matches a trailing possessive with a bare apostrophe (name already ends in s)", () => {
    expect("Yabby Services' reputation is strong.").toMatch(brandNamePattern(NAME));
  });
  it("matches a trailing possessive with 's on a name that doesn't end in s", () => {
    expect("Yabby's reputation is strong.").toMatch(brandNamePattern("Yabby"));
    expect("Yabby’s reputation is strong.").toMatch(brandNamePattern("Yabby"));
  });
  it("matches a hyphenated variant", () => {
    expect("Yabby-Services offers 24/7 support.").toMatch(brandNamePattern(NAME));
  });
  it("matches regardless of case", () => {
    expect("YABBY SERVICES is well regarded.").toMatch(brandNamePattern(NAME));
  });
  it("does not match a longer word sharing the same prefix", () => {
    expect("Yabbyservicesx is a different company.").not.toMatch(brandNamePattern(NAME));
  });
  it("does not match a different word", () => {
    expect("Yabby Servicing does plumbing repairs.").not.toMatch(brandNamePattern(NAME));
  });
  it("matches a leading-space stored name the same as the clean one", () => {
    const withLeadingSpace = brandNamePattern(" Yabby Services");
    expect("Yabby Services is great.").toMatch(withLeadingSpace);
  });
  it("escapes regex metacharacters in the name", () => {
    expect("A+ Plumbing is great.").toMatch(brandNamePattern("A+ Plumbing"));
    expect("AX Plumbing is different.").not.toMatch(brandNamePattern("A+ Plumbing"));
  });
  it("treats 'and' and '&' as interchangeable", () => {
    // A fresh RegExp per assertion -- brandNamePattern returns a global
    // ("g") regex, and reusing one instance across .test() calls would
    // carry its lastIndex over between strings.
    expect("Smith & Jones Plumbing are recommended.").toMatch(
      brandNamePattern("Smith and Jones Plumbing"),
    );
    expect("Smith and Jones Plumbing are recommended.").toMatch(
      brandNamePattern("Smith and Jones Plumbing"),
    );
  });
});
