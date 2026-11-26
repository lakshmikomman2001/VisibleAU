/**
 * 13 Nov (audit #46): the brand stored as "wrenhomeservices" (the wizard took the domain label) scored 0 of
 * 41 on the four engines while ChatGPT listed "**Wren Home Services** (Yennora-based)" first; renamed to
 * "Wren Home Services", audit #47 scored 9 of 33. A name is the same name whatever its spacing, case,
 * hyphens or "&"/"and", whichever form is stored, and through markdown; a different business sharing a word
 * is still not this one, and a short or shared name still has to be verified.
 */
import { describe, expect, it } from "vitest";
import { answerMention, type MentionBrand } from "@/lib/audit/answer-mention";
import { detectBrandMention } from "@/lib/audit/detect-mention";

const WREN: MentionBrand = {
  name: "wrenhomeservices",
  domain: "wrenhomeservices.com.au",
  suburb: "Yennora",
  city: null,
  state: "NSW",
  locationConfirmedAt: new Date("2026-11-12T00:00:00Z"),
  locationMode: "fixed",
};

const found = async (text: string, brand: { name: string; domain: string } = WREN) =>
  (await detectBrandMention(text, brand)).found;

describe("the stored name's spacing doesn't matter", () => {
  it.each([
    ["spaced", "Wren Home Services is a local plumber."],
    ["bold first word only", "**Wren** Home Services"],
    ["bold", "Try **Wren Home Services** today."],
    [
      "markdown link text",
      "[Wren Home Services](https://www.localsearch.com.au/profile/wren-home-services/yennora-nsw)",
    ],
    ["table cell", "| Wren Home Services | Yennora | Hot water |"],
    ["hyphenated", "Wren-Home-Services"],
    ["upper case", "WREN HOME SERVICES"],
    ["camel case", "WrenHomeServices"],
    ["as stored", "wrenhomeservices"],
    ["possessive", "Wren Home Services’ team"],
    ["en dash", "Wren–Home Services"],
  ])("stored 'wrenhomeservices', answer writes it %s", async (_how, text) => {
    expect(await found(text)).toBe(true);
  });

  it.each([
    ["no spaces", "wrenhomeservices"],
    ["camel case", "WrenHomeServices"],
    ["hyphens", "wren-home-services"],
    ["full stops", "Wren.Home.Services"],
  ])("stored 'Wren Home Services', answer writes it with %s", async (_how, text) => {
    expect(
      await found(text, { name: "Wren Home Services", domain: "wrenhomeservices.com.au" }),
    ).toBe(true);
  });

  it.each([
    ["& for and", "Smith & Jones Plumbing"],
    ["and for &", "Smith and Jones Plumbing"],
    ["& with no spaces", "Smith&Jones Plumbing"],
    ["all run together", "smithandjonesplumbing"],
  ])("'&' and 'and' are the same: %s", async (_how, text) => {
    expect(await found(text, { name: "Smith & Jones Plumbing", domain: "sjp.com.au" })).toBe(true);
    expect(await found(text, { name: "smithandjonesplumbing", domain: "sjp.com.au" })).toBe(true);
  });

  it("the domain written out is found, and the match is where the name starts", async () => {
    const text = "Book at https://www.wrenhomeservices.com.au/hot-water today.";
    const r = await detectBrandMention(text, {
      name: "Wren Plumbing Group",
      domain: "wrenhomeservices.com.au",
    });
    expect(r.found).toBe(true);
    expect(r.detectionMethod).toBe("entity");
    expect(r.matchIndex).toBe(text.indexOf("wrenhomeservices"));
  });

  it("the earlier of the stored form and the spaced form is the match", async () => {
    const text = "1. Wren Home Services\n2. Other Co\n\nSee wrenhomeservices.com.au";
    const r = await detectBrandMention(text, WREN);
    expect(r.matchIndex).toBe(text.indexOf("Wren Home Services"));
    expect(r.position).toBe(1);
  });
});

describe("a different business is still not this one", () => {
  it.each([
    ["a shared first word", "Wren Plumbing is in Yennora."],
    ["a longer word before it", "Superwren Home Services"],
    ["a word glued after it", "Wren Home Serviceswhich"],
    ["a different middle word", "Wren Pest Home Services"],
    ["across a line break", "Local wren\nHome services are listed below."],
    ["a markdown marker between letters", "Wren**Home Services"],
  ])("%s", async (_how, text) => {
    expect(await found(text)).toBe(false);
  });

  it("Gosford's 'Yabby Plumbing' is not Yabby Services", async () => {
    const yabby = { name: "Yabby Services", domain: "yabbyservices.com.au" };
    expect(await found("Yabby Plumbing in Gosford has 4.8 stars.", yabby)).toBe(false);
    expect(await found("**Yabby Plumbing** (Gosford) | 4.8 |", yabby)).toBe(false);
    expect(await found("yabby-plumbing-gosford", yabby)).toBe(false);
  });

  it("a short or shared name is found as a name but still needs verifying (location or domain)", async () => {
    const yabby: MentionBrand = {
      name: "Yabby",
      domain: "yabby-norwest.com.au",
      suburb: "Norwest",
      city: null,
      state: "NSW",
      locationConfirmedAt: new Date("2026-10-01T00:00:00Z"),
      locationMode: "fixed",
    };
    const gosford = await answerMention({
      text: "Yabby Plumbing in Gosford has 4.8 stars.",
      sources: [{ domain: "localsearch.com.au", cited: true }],
      brand: yabby,
    });
    expect(gosford.mention.found).toBe(true);
    expect(gosford.verification).toBe("unverified");
    const norwest = await answerMention({
      text: "Yabby, based in Norwest, is quick.",
      sources: [],
      brand: yabby,
    });
    expect(norwest.verification).toBe("verified_location");
  });

  it("names under four letters aren't matched with the spacing ignored", async () => {
    expect(await found("A B Plumbing", { name: "AB", domain: "abp.com.au" })).toBe(false);
    expect(await found("AB Plumbing", { name: "AB", domain: "abp.com.au" })).toBe(true);
  });
});

describe("audit #46's ChatGPT answer (Sri, 12 Nov) counts for the brand stored as 'wrenhomeservices'", () => {
  // Built from the parts Sri quoted from Run 1 of "Best hot water system repair in Yennora, NSW?".
  const answer = [
    "Here are some well-reviewed options for hot water system repair in and around Yennora, NSW:",
    "",
    "1. **Wren Home Services** (Yennora-based)",
    "   - Address: 9/3 Dursley Rd, Yennora NSW 2161",
    "   - Profile: ([localsearch.com.au](https://www.localsearch.com.au/profile/wren-home-services/yennora-nsw/hot-water-systems?utm_source=openai))",
    "",
    "| Provider | Location/Service Area | Highlights |",
    "|------|------|------|",
    "| Wren Home Services | Yennora | Hot water repairs |",
    "",
    "**Wren Home Services** is an excellent choice.",
  ].join("\n");

  it("is mentioned, first in the list, and verified by the suburb next to it", async () => {
    const r = await answerMention({
      text: answer,
      sources: [{ domain: "localsearch.com.au", cited: true }],
      brand: WREN,
    });
    expect(r.mention.found).toBe(true);
    expect(r.mention.position).toBe(1);
    expect(r.verification).toBe("verified_location");
  });

  it("gives the same answer for the same text whichever surface it came from (one function)", async () => {
    const asEngine = await answerMention({ text: answer, sources: [], brand: WREN });
    const asGoogle = await answerMention({ text: answer, sources: [], brand: WREN });
    expect(asGoogle).toEqual(asEngine);
  });
});
