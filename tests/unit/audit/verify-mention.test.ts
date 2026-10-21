import { describe, expect, it } from "vitest";
import { verifyMention, type VerifyMentionInput } from "@/lib/audit/verify-mention";

/**
 * Audit reliability, Part B / reliability follow-up item 1. Fixtures
 * below model the real, documented shape of prod audit_id
 * 2cab2f88-304b-45c8-b195-1b02b4aa6dca, brand "Omega Services"
 * (db/prod-fixes/diag-0082-audit30-mentions-and-sources.sql,
 * tests/unit/directories/citation-counts.test.ts's own "Omega
 * fixture") -- this file never had direct read access to the literal
 * production response text (NO MOCK DATA IN PRODUCTION is about never
 * presenting a fabricated value as a real measurement; it doesn't
 * forbid an illustrative test fixture, which this clearly is and is
 * labelled as).
 *
 * Corrected (reliability follow-up): the real, confirmed facts are
 * that OUR Omega Services is based in NORWEST, NSW. The branded-
 * answer citation of a "Thornleigh NSW" Omega Services was a
 * DIFFERENT business in a different suburb of the same state -- the
 * exact case a state-alone check would have wrongly verified.
 */
const OMEGA_BRAND: VerifyMentionInput["brand"] = {
  domain: "omegaservices.com.au",
  suburb: "Norwest",
  city: null,
  state: "NSW",
  locationConfirmedAt: new Date("2026-09-01T00:00:00Z"),
  locationMode: "fixed",
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
    it("verifies by location (the real confirmed suburb) when the grounding title carried no resolvable domain", () => {
      const text = "Tradies in Norwest recommend Omega Services for same-day repairs.";
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

  // ---------------------------------------------------------------------
  // Reliability follow-up, item 1 (honesty bug): state alone is never
  // enough. The real Claude citation this models: a Thornleigh NSW
  // "Omega Services" listing is a DIFFERENT business from ours
  // (Norwest NSW) -- same state, wrong suburb.
  // ---------------------------------------------------------------------
  describe("reliability follow-up item 1 -- state alone never verifies", () => {
    it("'Omega Services ... Thornleigh NSW' with a different website is unverified -- state must not rescue the wrong suburb", () => {
      const text = "Omega Services, Thornleigh NSW, has a great reputation for electrical work.";
      const result = verify(text, { citedSources: [{ domain: "a-different-omega.example.com.au" }] });
      expect(result).toBe("unverified");
    });

    it("'Omega Services ... Norwest' (the real confirmed suburb) is verified", () => {
      const text = "Omega Services, Norwest, has a great reputation for electrical work.";
      expect(verify(text)).toBe("verified_location");
    });

    it("'Omega Services ... NSW' with no suburb or city present in the text is unverified", () => {
      const text = "Omega Services, NSW, answered quickly.";
      expect(verify(text)).toBe("unverified");
    });

    it("state is excluded even when it's the ONLY location data confirmed on the brand (no suburb, no city)", () => {
      const text = "Omega Services, NSW, is highly rated.";
      const brand = { ...OMEGA_BRAND, suburb: null, city: null };
      expect(verify(text, { brand })).toBe("unverified");
    });

    it("city verifies the same way suburb does, when city is confirmed and suburb is null", () => {
      const text = "Omega Services is a top pick in Sydney this year.";
      const brand = { ...OMEGA_BRAND, suburb: null, city: "Sydney" };
      expect(verify(text, { brand })).toBe("verified_location");
    });

    it("an online_only brand verifies only by domain -- the location check never runs for it", () => {
      // online_only brands have no suburb by definition (Build 1, Part
      // D) -- modelled here with state still confirmed, to prove the
      // location check is skipped outright, not just "didn't match".
      const text = "Omega Services, Norwest NSW, is a top pick.";
      const brand: VerifyMentionInput["brand"] = {
        domain: "omegaservices.com.au",
        suburb: null,
        city: null,
        state: "NSW",
        locationConfirmedAt: new Date("2026-09-01T00:00:00Z"),
        locationMode: "online_only",
      };
      // Even though the text literally contains "Norwest" (which would
      // verify a FIXED brand with that confirmed suburb), this brand
      // has no suburb at all -- the real assertion is that an
      // online_only brand can ONLY ever reach verified_domain.
      expect(verify(text, { brand, citedSources: [] })).toBe("unverified");
      expect(verify(text, { brand, citedSources: [{ domain: "omegaservices.com.au" }] })).toBe(
        "verified_domain",
      );
    });
  });

  describe("location check correctness", () => {
    it("requires locationConfirmedAt -- an unconfirmed suburb never verifies, even if the text matches", () => {
      const text = "Omega Services, based in Norwest, is a solid pick.";
      const result = verify(text, { brand: { ...OMEGA_BRAND, locationConfirmedAt: null } });
      expect(result).toBe("unverified");
    });

    it("a suburb mention outside the +/-300 character window does not verify", () => {
      const filler = "x".repeat(400);
      const text = `Omega Services is a solid pick. ${filler} They're based in Norwest.`;
      const result = verify(text);
      expect(result).toBe("unverified");
    });

    it("a suburb mention inside the window verifies", () => {
      const text = "Omega Services, based in Norwest, is a solid pick.";
      const result = verify(text);
      expect(result).toBe("verified_location");
    });

    it("word-boundary matching -- ordinary prose containing the same letters as the suburb must not false-positive", () => {
      // A contrived near-miss: "Norwester" is a different word, not
      // the suburb "Norwest" -- the whole-word regex must not match
      // it as a substring.
      const text = "Omega Services weathered a Norwester wind storm last week without any damage.";
      expect(verify(text)).toBe("unverified");
    });

    it("no citedSources and no location data at all -> unverified, never thrown", () => {
      const text = "Omega Services is one option worth calling.";
      const brand = { ...OMEGA_BRAND, suburb: null, city: null, state: null, locationConfirmedAt: null };
      expect(verify(text, { brand })).toBe("unverified");
    });
  });

  it("domain check wins even when the location text would also have matched", () => {
    const text = "Omega Services, based in Norwest, lists omegaservices.com.au as their site.";
    const result = verify(text, { citedSources: [{ domain: "omegaservices.com.au" }] });
    expect(result).toBe("verified_domain");
  });
});
