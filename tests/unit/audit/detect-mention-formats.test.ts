/**
 * "Mention detection" (6 Nov), part 4 -- detection reads a normalised copy of the answer
 * (lib/audit/detection-text.ts); the stored answer is never changed. Every format diag-0122's investigation
 * found the detector missing is caught, nothing that shouldn't match does, and verification cuts its
 * location window from the same copy detection matched in.
 */
import { describe, expect, it } from "vitest";
import { detectBrandMention } from "@/lib/audit/detect-mention";
import { verifyMention } from "@/lib/audit/verify-mention";

const BRAND = { name: "Omega Services", domain: "omegaservices.com.au" };
const found = async (text: string) => (await detectBrandMention(text, BRAND)).found;

describe("every format the detector used to miss is found (diag-0122's table)", () => {
  it.each([
    ["bold first word only", "**Omega** Services"],
    ["italic first word only", "*Omega* Services"],
    ["underscore", "Omega_Services"],
    ["zero-width space", "Omega​Services"],
    ["soft hyphen", "Omega­Services"],
    ["non-breaking hyphen U+2011", "Omega‑Services"],
    ["full-width letters", "Ｏｍｅｇａ Services"],
  ])("%s", async (_name, text) => {
    expect(await found(text)).toBe(true);
  });

  it.each([
    ["bold", "Try **Omega Services** today."],
    ["markdown link", "[Omega Services](https://omegaservices.com.au) in Norwest"],
    ["table cell", "| Omega Services | 4.9 |"],
    ["curly possessive", "Omega Services’ team"],
    ["no-break space", "Omega Services"],
    ["domain only", "See omegaservices.com.au for prices."],
  ])("still found: %s", async (_name, text) => {
    expect(await found(text)).toBe(true);
  });
});

describe("no new matches", () => {
  it.each([
    ["the first word alone", "Omega is a good choice"],
    ["different words", "Omega Plumbing Services"],
    ["the name inside a longer word", "Omegaservicesxyz"],
    ["a longer word ending in the first word", "SuperOmega Services"],
    ["glued to the next word", "Omega Serviceswhich offers"],
    ["a marker between the letters", "Omega**Services"],
  ])("%s", async (_name, text) => {
    expect(await found(text)).toBe(false);
  });
});

describe("verification reads the same copy detection matched in", () => {
  const brand = {
    domain: "omegaservices.com.au",
    suburb: "Norwest",
    city: null,
    state: "NSW",
    locationConfirmedAt: new Date("2026-10-01T00:00:00Z"),
    locationMode: "fixed" as const,
  };

  async function verify(text: string) {
    const mention = await detectBrandMention(text, BRAND);
    return verifyMention({
      matchIndex: mention.matchIndex,
      responseText: text,
      citedSources: [],
      brand,
    });
  }

  it("a name found only in the copy verifies by the suburb next to it", async () => {
    expect(await verify("In Norwest, try **Omega** Services.")).toBe("verified_location");
  });

  it("the window is cut where the match is in the copy, not at that offset in the stored text", async () => {
    // 500 zero-width characters before the name: at the copy's offset 0 the stored text is all invisible,
    // and the suburb 200 characters after the name is only inside the window counted in the copy.
    const text = `${"​".repeat(500)}Omega Services${" ".repeat(200)}Norwest`;
    expect(await verify(text)).toBe("verified_location");
  });

  it("nearness is measured in the copy, where invisible characters take no room", async () => {
    const text = `Norwest${"​".repeat(400)} is home to Omega Services.`;
    expect(await verify(text)).toBe("verified_location");
  });
});
