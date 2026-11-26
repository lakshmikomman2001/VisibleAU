/**
 * S01 part 11 (LLD 8.8.6, amendment 25; contract P01.abnField, P01.abn): the ABN field's rule and the ABN suggestion.
 * - normaliseAbnInput: spaces as typed are fine, digits are saved; empty is allowed (no ABN); anything else, or 11
 *   digits that fail the ATO check, is refused with the contract's words.
 * - searchAbnByName: the ABR's MatchingNames for the name (recorded responses from S01 part 1, no live calls), kept to
 *   current names that are the business's name, filtered by postcode (else state) in code, each candidate confirmed
 *   with AbnDetails; a suggestion only for exactly one Active match. No GUID, or the bypass: no lookup at all.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { searchAbnByName } from "@/lib/brand-entity/abn-lookup";
import { normaliseAbnInput } from "@/lib/brands/abn";

// Recorded on 23 Nov 2026 with the configured GUID (S01 part 1 report), trimmed to the fields the code reads.
const MATCHING = (names: object[]) => `callback(${JSON.stringify({ Message: "", Names: names })})`;
const NUMBATEK_NAME = {
  Abn: "51824753605",
  AbnStatus: "0000000001",
  IsCurrent: true,
  Name: "NumbaTek IT",
  NameType: "Business Name",
  Postcode: "2765",
  Score: 100,
  State: "NSW",
};
const OTHER_NAME = {
  Abn: "51824753556",
  AbnStatus: "0000000001",
  IsCurrent: true,
  Name: "Numbatek IT Solutions",
  NameType: "Trading Name",
  Postcode: "3000",
  Score: 92,
  State: "VIC",
};
const DETAILS = `callback(${JSON.stringify({
  Abn: "51824753605",
  AbnStatus: "Active",
  EntityName: "QUOLLEN GROUP PTY LTD",
  BusinessName: ["NumbaTek IT"],
  AddressPostcode: "2765",
  AddressState: "NSW",
  Message: "",
})})`;

function abr(routes: { matching: string; details?: string }) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      if (url.includes("MatchingNames.aspx")) return new Response(routes.matching);
      if (url.includes("AbnDetails.aspx")) return new Response(routes.details ?? "callback({})");
      return new Response("not found", { status: 404 });
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("the ABN field's rule (P01.abnField)", () => {
  it("spaces as typed are fine; the digits are saved", () => {
    expect(normaliseAbnInput("51 824 753 605")).toEqual({ ok: true, abn: "51824753605" });
  });

  it("empty is allowed: no ABN", () => {
    expect(normaliseAbnInput("")).toEqual({ ok: true, abn: null });
    expect(normaliseAbnInput("   ")).toEqual({ ok: true, abn: null });
  });

  it("not 11 digits, or digits that fail the ATO check, are refused in the contract's words", () => {
    expect(normaliseAbnInput("1770171094")).toEqual({
      ok: false,
      error: "Enter the 11 digits of an ABN.",
    });
    expect(normaliseAbnInput("51 824 753 606")).toEqual({
      ok: false,
      error: "This isn't a valid ABN. Check the digits.",
    });
  });
});

describe("searchAbnByName (recorded ABR responses)", () => {
  it("one current match for the name in the brand's postcode, confirmed Active: the suggestion", async () => {
    vi.stubEnv("ABN_LOOKUP_GUID", "test-guid");
    const calls = abr({ matching: MATCHING([NUMBATEK_NAME, OTHER_NAME]), details: DETAILS });
    const s = await searchAbnByName("NumbaTek IT", { postcode: "2765", state: "NSW" });
    expect(s).toMatchObject({
      status: "found",
      suggestion: {
        abn: "51824753605",
        entity: "QUOLLEN GROUP PTY LTD",
        businessName: "NumbaTek IT",
        postcode: "2765",
        state: "NSW",
        abnStatus: "Active",
      },
    });
    expect(calls[0]).toContain("MatchingNames.aspx?name=NumbaTek%20IT");
    expect(calls[1]).toContain("AbnDetails.aspx?abn=51824753605");
    expect(calls).toHaveLength(2);
  });

  it("no match in the brand's place, or two different ABNs for the name: no suggestion", async () => {
    vi.stubEnv("ABN_LOOKUP_GUID", "test-guid");
    abr({ matching: MATCHING([NUMBATEK_NAME]), details: DETAILS });
    expect(await searchAbnByName("NumbaTek IT", { postcode: "3000", state: "VIC" })).toEqual({
      status: "none",
    });
    abr({
      matching: MATCHING([
        NUMBATEK_NAME,
        { ...NUMBATEK_NAME, Abn: "53004085616", Postcode: "2766" },
      ]),
      details: DETAILS,
    });
    expect(await searchAbnByName("NumbaTek IT", { state: "NSW" })).toEqual({ status: "none" });
  });

  it("a candidate whose ABN isn't Active is no suggestion", async () => {
    vi.stubEnv("ABN_LOOKUP_GUID", "test-guid");
    abr({
      matching: MATCHING([NUMBATEK_NAME]),
      details: DETAILS.replace('"AbnStatus":"Active"', '"AbnStatus":"Cancelled"'),
    });
    expect(await searchAbnByName("NumbaTek IT", { postcode: "2765" })).toEqual({ status: "none" });
  });

  it("no GUID, or the bypass: no lookup", async () => {
    const calls = abr({ matching: MATCHING([NUMBATEK_NAME]) });
    vi.stubEnv("ABN_LOOKUP_GUID", "");
    expect(await searchAbnByName("NumbaTek IT", { postcode: "2765" })).toEqual({
      status: "skipped",
    });
    vi.stubEnv("ABN_LOOKUP_GUID", "test-guid");
    vi.stubEnv("ABN_LOOKUP_BYPASS", "true");
    expect(await searchAbnByName("NumbaTek IT", { postcode: "2765" })).toEqual({
      status: "skipped",
    });
    expect(calls).toEqual([]);
  });

  it("the ABR not answering is a failed check, never a guess", async () => {
    vi.stubEnv("ABN_LOOKUP_GUID", "test-guid");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("busy", { status: 503 })),
    );
    expect(await searchAbnByName("NumbaTek IT", { postcode: "2765" })).toEqual({
      status: "failed",
    });
  });
});
