/**
 * S01 part 3 (LLD 8.1.5 rule h, appendix C1): the "couldn't find the business" phrase list and the quoted sentence.
 */
import { describe, expect, it } from "vitest";
import { COULD_NOT_FIND_PHRASES, couldNotFindQuote, QUOTE_MAX } from "@/lib/reports/could-not-find";

/** Claude's answer to "Is NumbaTek IT a good choice for managed IT services in Riverstone, NSW?" (#52's shape). */
const CLAUDE_52 =
  "I need to be upfront with you. I was unable to find any verified information about a company specifically called NumbaTekIT in Riverstone. If you're considering them, ask for references.";

describe("couldNotFindQuote", () => {
  it("quotes the sentence that says it couldn't find the business", () => {
    expect(couldNotFindQuote(CLAUDE_52)).toBe(
      "I was unable to find any verified information about a company specifically called NumbaTekIT in Riverstone.",
    );
  });

  it.each([
    ["I could not find any information about Yabby Services.", "could not find any information"],
    ["Sadly I couldn't find any information on them.", "couldn't find any information"],
    ["There is no publicly available information about Wren Home Services.", "there is no"],
    ["I don't have specific information about NumbaTek IT.", "I don't have"],
    ["There's no information available online about this business.", "no information available"],
    ["I could not verify that this company exists.", "I could not verify"],
    [
      "The search returned no results for a business named NumbaTek IT.",
      "no results for a business",
    ],
    ["You may be referring to NumbaTek Solutions in Melbourne.", "may be referring to"],
    ["The directory did not return any listings for that name.", "did not return any listings"],
  ])("matches appendix C1: %s", (answer) => {
    expect(couldNotFindQuote(answer)).toBe(answer);
  });

  it("is case-insensitive and keeps the sentence only (no markdown)", () => {
    expect(
      couldNotFindQuote(
        "**NumbaTek IT** is a provider. UNABLE TO FIND ANY INFORMATION about its reviews. Try Google.",
      ),
    ).toBe("UNABLE TO FIND ANY INFORMATION about its reviews.");
  });

  it("never fires on an ordinary answer", () => {
    expect(
      couldNotFindQuote(
        "Here are some well-reviewed managed IT providers in Western Sydney: Lorikeet IT, Crystaltec and SureTech. Each offers Microsoft 365 support.",
      ),
    ).toBeNull();
    expect(couldNotFindQuote(null)).toBeNull();
    expect(couldNotFindQuote("")).toBeNull();
  });

  it(`quotes at most ${QUOTE_MAX} characters, cut at a word, keeping the phrase`, () => {
    const long = `${"This is a long introduction about local IT services in Western Sydney ".repeat(3)}and I was unable to find any information about NumbaTek IT in any of the sources I checked today ${"which went on and on ".repeat(5)}.`;
    const quote = couldNotFindQuote(long) ?? "";
    expect(quote.length).toBeLessThanOrEqual(QUOTE_MAX);
    expect(quote).toContain("unable to find any information");
    expect(quote.endsWith("…")).toBe(true);
  });

  it("the list is appendix C1's ten phrases", () => {
    expect(COULD_NOT_FIND_PHRASES).toHaveLength(10);
  });
});
