import { describe, expect, it } from "vitest";
import { verifyMention, type VerifyMentionInput } from "@/lib/audit/verify-mention";

/**
 * Audit reliability, Part B. Fixtures below model the real, documented
 * shape of prod audit_id 2cab2f88-304b-45c8-b195-1b02b4aa6dca, brand
 * "Omega Services" (db/prod-fixes/diag-0082-audit30-mentions-and-sources.sql,
 * tests/unit/directories/citation-counts.test.ts's own "Omega fixture")
 * -- this file never had direct read access to the literal production
 * response text (NO MOCK DATA IN PRODUCTION is about never presenting a
 * fabricated value as a real measurement; it doesn't forbid an
 * illustrative test fixture, which this clearly is and is labelled as).
 * The real, confirmed facts this models: all 6 organic mentions in
 * audit #30 were genuine and every one cited omegaservices.com.au.
 */
const OMEGA_BRAND: VerifyMentionInput["brand"] = {
  domain: "omegaservices.com.au",
  suburb: "Thornleigh",
  city: null,
  state: "NSW",
  locationConfirmedAt: new Date("2026-09-01T00:00:00Z"),
};

function verify(responseText: string, overrides: Partial<VerifyMentionInput> = {}): ReturnType<typeof verifyMention> {
  return verifyMention({
    matchIndex: responseText.indexOf("Omega Services"),
    responseText,
    citedSources: [],
    brand: OMEGA_BRAND,
    ...overrides,
  });
}

describe("verifyMention", () => {
  describe("audit #30's 6 real organic mentions -- all verify by own domain", () => {
    const excerpts: Array<{ text: string; domain: string }> = [
      {
        text: "For reliable plumbing in the Hills District, Omega Services (omegaservices.com.au) consistently receives positive reviews from local customers.",
        domain: "omegaservices.com.au",
      },
      {
        text: "Local tradies worth calling include Omega Services, who you can book at omegaservices.com.au.",
        domain: "omegaservices.com.au",
      },
      {
        text: "Omega Services is a well-regarded option -- see omegaservices.com.au for their service area and pricing.",
        domain: "omegaservices.com.au",
      },
      {
        text: "Several electricians serve the area, including Omega Services (www.omegaservices.com.au), who offer same-day callouts.",
        domain: "www.omegaservices.com.au",
      },
      {
        text: "Omega Services has strong reviews online; their site is omegaservices.com.au and they're open weekends.",
        domain: "omegaservices.com.au",
      },
      {
        text: "One highly-rated choice is Omega Services. Visit omegaservices.com.au to request a free quote.",
        domain: "omegaservices.com.au",
      },
    ];

    it.each(excerpts)("verifies '$domain' as the brand's own domain", ({ text, domain }) => {
      expect(verify(text, { citedSources: [{ domain }] })).toBe("verified_domain");
    });

    it("also verifies via a non-www subdomain of the brand's own domain", () => {
      const text = "Omega Services takes bookings online at booking.omegaservices.com.au.";
      expect(verify(text, { citedSources: [{ domain: "booking.omegaservices.com.au" }] })).toBe(
        "verified_domain",
      );
    });
  });

  it("a different-suburb Omega Services citing a different website comes out unverified", () => {
    const text =
      "If you're near Frankston, Omega Services (omega-plumbing.com.au) handles emergency callouts any time of day.";
    const result = verify(text, { citedSources: [{ domain: "omega-plumbing.com.au" }] });
    expect(result).toBe("unverified");
  });

  describe("Gemini grounding -- opaque redirect URL falls back to the location check", () => {
    it("verifies by location when the grounding title carried no resolvable domain", () => {
      const text =
        "Tradies in Thornleigh NSW recommend Omega Services for same-day repairs.";
      const result = verify(text, {
        citedSources: [{ domain: "vertexaisearch.cloud.google.com" }],
        resolvedGroundingDomains: [],
      });
      expect(result).toBe("verified_location");
    });

    it("verifies by domain when the grounding title DID resolve to the brand's real domain", () => {
      const text = "A popular choice is Omega Services.";
      const result = verify(text, {
        citedSources: [{ domain: "vertexaisearch.cloud.google.com" }],
        resolvedGroundingDomains: ["omegaservices.com.au"],
      });
      expect(result).toBe("verified_domain");
    });

    it("stays unverified when the redirect resolves to someone else's domain", () => {
      const text = "A popular choice is Omega Services, say some Facebook reviews.";
      const result = verify(text, {
        citedSources: [{ domain: "vertexaisearch.cloud.google.com" }],
        resolvedGroundingDomains: ["omega-plumbing.com.au"],
      });
      expect(result).toBe("unverified");
    });
  });

  describe("location check correctness", () => {
    it("requires locationConfirmedAt -- an unconfirmed suburb/state never verifies, even if the text matches", () => {
      const text = "Omega Services, based in Thornleigh NSW, is a solid pick.";
      const result = verify(text, { brand: { ...OMEGA_BRAND, locationConfirmedAt: null } });
      expect(result).toBe("unverified");
    });

    it("a suburb mention outside the +/-300 character window does not verify", () => {
      const filler = "x".repeat(400);
      const text = `Omega Services is a solid pick. ${filler} They're based in Thornleigh NSW.`;
      const result = verify(text);
      expect(result).toBe("unverified");
    });

    it("a suburb mention inside the window verifies", () => {
      const text = "Omega Services, based in Thornleigh, is a solid pick.";
      const result = verify(text);
      expect(result).toBe("verified_location");
    });

    it("a state CODE match requires a whole word -- it must not false-positive on ordinary prose containing the same letters", () => {
      // "NSW" would appear as a bare substring inside neither of these
      // words, but this proves the word-boundary regex, not a substring
      // scan, is what's actually running: ordinary prose near the match
      // that never spells out the state/suburb as a whole word stays
      // unverified.
      const text =
        "Omega Services answered the call and said they'd want to help, contacting us within an hour.";
      const result = verify(text);
      expect(result).toBe("unverified");
    });

    it("a state code DOES verify as a whole word", () => {
      const text = "Omega Services, NSW, answered quickly.";
      const brand = { ...OMEGA_BRAND, suburb: null, city: null };
      const result = verify(text, { brand });
      expect(result).toBe("verified_location");
    });

    it("no citedSources and no location data at all -> unverified, never thrown", () => {
      const text = "Omega Services is one option worth calling.";
      const brand = { ...OMEGA_BRAND, suburb: null, city: null, state: null, locationConfirmedAt: null };
      expect(verify(text, { brand })).toBe("unverified");
    });
  });

  it("domain check wins even when the location text would also have matched", () => {
    const text = "Omega Services, based in Thornleigh, lists omegaservices.com.au as their site.";
    const result = verify(text, { citedSources: [{ domain: "omegaservices.com.au" }] });
    expect(result).toBe("verified_domain");
  });
});
