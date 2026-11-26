import { describe, expect, it } from "vitest";
import { verifyMention, type VerifyMentionInput } from "@/lib/audit/verify-mention";

/**
 * Audit reliability, Part B / reliability follow-up item 1. Fixtures
 * below model the real, documented shape of prod audit_id
 * 2cab2f88-304b-45c8-b195-1b02b4aa6dca, brand "Yabby Services"
 * (db/prod-fixes/diag-0082-audit30-mentions-and-sources.sql,
 * tests/unit/directories/citation-counts.test.ts's own "Omega
 * fixture") -- this file never had direct read access to the literal
 * production response text (NO MOCK DATA IN PRODUCTION is about never
 * presenting a fabricated value as a real measurement; it doesn't
 * forbid an illustrative test fixture, which this clearly is and is
 * labelled as).
 *
 * Corrected (reliability follow-up): the real, confirmed facts are
 * that OUR Yabby Services is based in NORWEST, NSW. The branded-
 * answer citation of a "Thornleigh NSW" Yabby Services was a
 * DIFFERENT business in a different suburb of the same state -- the
 * exact case a state-alone check would have wrongly verified.
 */
const OMEGA_BRAND: VerifyMentionInput["brand"] = {
  domain: "yabbyservices.com.au",
  suburb: "Norwest",
  city: null,
  state: "NSW",
  locationConfirmedAt: new Date("2026-09-01T00:00:00Z"),
  locationMode: "fixed",
};

function verify(
  responseText: string,
  overrides: Partial<VerifyMentionInput> = {},
): ReturnType<typeof verifyMention> {
  return verifyMention({
    matchIndex: responseText.indexOf("Yabby Services"),
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
        text: "For reliable plumbing in the Hills District, Yabby Services (yabbyservices.com.au) consistently receives positive reviews from local customers.",
        domain: "yabbyservices.com.au",
      },
      {
        text: "Local tradies worth calling include Yabby Services, who you can book at yabbyservices.com.au.",
        domain: "yabbyservices.com.au",
      },
      {
        text: "Yabby Services is a well-regarded option -- see yabbyservices.com.au for their service area and pricing.",
        domain: "yabbyservices.com.au",
      },
      {
        text: "Several electricians serve the area, including Yabby Services (www.yabbyservices.com.au), who offer same-day callouts.",
        domain: "www.yabbyservices.com.au",
      },
      {
        text: "Yabby Services has strong reviews online; their site is yabbyservices.com.au and they're open weekends.",
        domain: "yabbyservices.com.au",
      },
      {
        text: "One highly-rated choice is Yabby Services. Visit yabbyservices.com.au to request a free quote.",
        domain: "yabbyservices.com.au",
      },
    ];

    it.each(excerpts)("verifies '$domain' as the brand's own domain", ({ text, domain }) => {
      expect(verify(text, { citedSources: [{ domain }] })).toBe("verified_domain");
    });

    it("also verifies via a non-www subdomain of the brand's own domain", () => {
      const text = "Yabby Services takes bookings online at booking.yabbyservices.com.au.";
      expect(verify(text, { citedSources: [{ domain: "booking.yabbyservices.com.au" }] })).toBe(
        "verified_domain",
      );
    });
  });

  it("a different-suburb Yabby Services citing a different website comes out unverified", () => {
    const text =
      "If you're near Frankston, Yabby Services (yabby-plumbing.com.au) handles emergency callouts any time of day.";
    const result = verify(text, { citedSources: [{ domain: "yabby-plumbing.com.au" }] });
    expect(result).toBe("unverified");
  });

  // "Mention detection" (6 Nov), part 5: a Gemini grounding link's stored source carries the site its
  // grounding title named (lib/llm/web-search-config.ts's geminiAnswerSources), so Gemini verifies from
  // what's stored, the same rule as every other engine.
  describe("Gemini grounding -- the stored source's site, not the redirect host", () => {
    it("verifies by location (the real confirmed suburb) when the grounding title carried no resolvable domain", () => {
      const text = "Tradies in Norwest recommend Yabby Services for same-day repairs.";
      const result = verify(text, {
        citedSources: [{ domain: "vertexaisearch.cloud.google.com" }],
      });
      expect(result).toBe("verified_location");
    });

    it("verifies by domain when the grounding title named the brand's real domain", () => {
      const text = "A popular choice is Yabby Services.";
      const result = verify(text, { citedSources: [{ domain: "yabbyservices.com.au" }] });
      expect(result).toBe("verified_domain");
    });

    it("stays unverified when the grounding title named someone else's domain", () => {
      const text = "A popular choice is Yabby Services, say some Facebook reviews.";
      const result = verify(text, { citedSources: [{ domain: "yabby-plumbing.com.au" }] });
      expect(result).toBe("unverified");
    });
  });

  // "Mention detection" (6 Nov), part 5: Claude's stored sources include every search result; only the
  // pages the answer cited verify. A result it didn't cite (cited: false) was seen in search, nothing more.
  describe("Claude -- only a cited page verifies, not a search result", () => {
    it("the brand's site only among the search results: not verified_domain (unverified with no location nearby)", () => {
      const text = "A popular choice is Yabby Services.";
      const result = verify(text, {
        citedSources: [{ domain: "yabbyservices.com.au", cited: false }],
      });
      expect(result).toBe("unverified");
    });

    it("the brand's site only among the search results, the suburb next to the name: verified_location", () => {
      const text = "In Norwest, a popular choice is Yabby Services.";
      const result = verify(text, {
        citedSources: [{ domain: "yabbyservices.com.au", cited: false }],
      });
      expect(result).toBe("verified_location");
    });

    it("the answer cites the brand's site: verified_domain", () => {
      const text = "A popular choice is Yabby Services.";
      const result = verify(text, { citedSources: [{ domain: "yabbyservices.com.au" }] });
      expect(result).toBe("verified_domain");
    });
  });

  // ---------------------------------------------------------------------
  // Reliability follow-up, item 1 (honesty bug): state alone is never
  // enough. The real Claude citation this models: a Thornleigh NSW
  // "Yabby Services" listing is a DIFFERENT business from ours
  // (Norwest NSW) -- same state, wrong suburb.
  // ---------------------------------------------------------------------
  describe("reliability follow-up item 1 -- state alone never verifies", () => {
    it("'Yabby Services ... Thornleigh NSW' with a different website is unverified -- state must not rescue the wrong suburb", () => {
      const text = "Yabby Services, Thornleigh NSW, has a great reputation for electrical work.";
      const result = verify(text, {
        citedSources: [{ domain: "a-different-omega.example.com.au" }],
      });
      expect(result).toBe("unverified");
    });

    it("'Yabby Services ... Norwest' (the real confirmed suburb) is verified", () => {
      const text = "Yabby Services, Norwest, has a great reputation for electrical work.";
      expect(verify(text)).toBe("verified_location");
    });

    it("'Yabby Services ... NSW' with no suburb or city present in the text is unverified", () => {
      const text = "Yabby Services, NSW, answered quickly.";
      expect(verify(text)).toBe("unverified");
    });

    it("state is excluded even when it's the ONLY location data confirmed on the brand (no suburb, no city)", () => {
      const text = "Yabby Services, NSW, is highly rated.";
      const brand = { ...OMEGA_BRAND, suburb: null, city: null };
      expect(verify(text, { brand })).toBe("unverified");
    });

    it("city verifies the same way suburb does, when city is confirmed and suburb is null", () => {
      const text = "Yabby Services is a top pick in Sydney this year.";
      const brand = { ...OMEGA_BRAND, suburb: null, city: "Sydney" };
      expect(verify(text, { brand })).toBe("verified_location");
    });

    it("an online_only brand verifies only by domain -- the location check never runs for it", () => {
      // online_only brands have no suburb by definition (Build 1, Part
      // D) -- modelled here with state still confirmed, to prove the
      // location check is skipped outright, not just "didn't match".
      const text = "Yabby Services, Norwest NSW, is a top pick.";
      const brand: VerifyMentionInput["brand"] = {
        domain: "yabbyservices.com.au",
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
      expect(verify(text, { brand, citedSources: [{ domain: "yabbyservices.com.au" }] })).toBe(
        "verified_domain",
      );
    });
  });

  describe("location check correctness", () => {
    it("requires locationConfirmedAt -- an unconfirmed suburb never verifies, even if the text matches", () => {
      const text = "Yabby Services, based in Norwest, is a solid pick.";
      const result = verify(text, { brand: { ...OMEGA_BRAND, locationConfirmedAt: null } });
      expect(result).toBe("unverified");
    });

    it("a suburb mention outside the +/-300 character window does not verify", () => {
      const filler = "x".repeat(400);
      const text = `Yabby Services is a solid pick. ${filler} They're based in Norwest.`;
      const result = verify(text);
      expect(result).toBe("unverified");
    });

    it("a suburb mention inside the window verifies", () => {
      const text = "Yabby Services, based in Norwest, is a solid pick.";
      const result = verify(text);
      expect(result).toBe("verified_location");
    });

    it("word-boundary matching -- ordinary prose containing the same letters as the suburb must not false-positive", () => {
      // A contrived near-miss: "Norwester" is a different word, not
      // the suburb "Norwest" -- the whole-word regex must not match
      // it as a substring.
      const text = "Yabby Services weathered a Norwester wind storm last week without any damage.";
      expect(verify(text)).toBe("unverified");
    });

    it("no citedSources and no location data at all -> unverified, never thrown", () => {
      const text = "Yabby Services is one option worth calling.";
      const brand = {
        ...OMEGA_BRAND,
        suburb: null,
        city: null,
        state: null,
        locationConfirmedAt: null,
      };
      expect(verify(text, { brand })).toBe("unverified");
    });
  });

  it("domain check wins even when the location text would also have matched", () => {
    const text = "Yabby Services, based in Norwest, lists yabbyservices.com.au as their site.";
    const result = verify(text, { citedSources: [{ domain: "yabbyservices.com.au" }] });
    expect(result).toBe("verified_domain");
  });
});
