import { describe, expect, it } from "vitest";
import { brandNamePattern, domainStem, normalizeBrandName } from "@/lib/brands/normalize";

describe("normalizeBrandName", () => {
  it("trims leading/trailing whitespace", () => {
    expect(normalizeBrandName("  Omega Services  ")).toBe("Omega Services");
  });
  it("collapses internal whitespace to single spaces", () => {
    expect(normalizeBrandName("Omega    Services")).toBe("Omega Services");
    expect(normalizeBrandName("Omega\tServices")).toBe("Omega Services");
  });
  it("NFKC-normalizes Unicode (e.g. fullwidth forms collapse to ASCII)", () => {
    // U+FF2F etc. (fullwidth "OMEGA") NFKC-normalizes to plain ASCII.
    expect(normalizeBrandName("ＯＭＥＧＡ")).toBe("OMEGA");
  });
  it("a leading-space stored name normalizes the same as the clean one", () => {
    expect(normalizeBrandName(" Omega Services")).toBe(normalizeBrandName("Omega Services"));
  });
});

describe("domainStem", () => {
  it("strips a .com.au TLD and non-letters", () => {
    expect(domainStem("omega-services.com.au")).toBe("omegaservices");
  });
  it("strips a plain .com TLD", () => {
    expect(domainStem("bondiplumbing.com")).toBe("bondiplumbing");
  });
  it("lowercases", () => {
    expect(domainStem("OMEGA-SERVICES.COM.AU")).toBe("omegaservices");
  });
  it("strips a protocol and path if present", () => {
    expect(domainStem("https://omega-services.com.au/contact")).toBe("omegaservices");
  });
});

describe("brandNamePattern (Vunnara Build 1, Part A)", () => {
  const NAME = "Omega Services";

  it("matches a quoted mention", () => {
    expect('"Omega Services" is a great choice.').toMatch(brandNamePattern(NAME));
  });
  it("matches a markdown-bolded mention", () => {
    expect("**Omega Services** is a great choice.").toMatch(brandNamePattern(NAME));
  });
  it("matches a trailing possessive with a bare apostrophe (name already ends in s)", () => {
    expect("Omega Services' reputation is strong.").toMatch(brandNamePattern(NAME));
  });
  it("matches a trailing possessive with 's on a name that doesn't end in s", () => {
    expect("Omega's reputation is strong.").toMatch(brandNamePattern("Omega"));
    expect("Omega’s reputation is strong.").toMatch(brandNamePattern("Omega"));
  });
  it("matches a hyphenated variant", () => {
    expect("Omega-Services offers 24/7 support.").toMatch(brandNamePattern(NAME));
  });
  it("matches regardless of case", () => {
    expect("OMEGA SERVICES is well regarded.").toMatch(brandNamePattern(NAME));
  });
  it("does not match a longer word sharing the same prefix", () => {
    expect("Omegaservicesx is a different company.").not.toMatch(brandNamePattern(NAME));
  });
  it("does not match a different word", () => {
    expect("Omega Servicing does plumbing repairs.").not.toMatch(brandNamePattern(NAME));
  });
  it("matches a leading-space stored name the same as the clean one", () => {
    const withLeadingSpace = brandNamePattern(" Omega Services");
    expect("Omega Services is great.").toMatch(withLeadingSpace);
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
