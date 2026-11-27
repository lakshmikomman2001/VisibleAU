/**
 * S04 part 0f (LLD amendment 89, 8.3.2; contract v1.9 P03.checks): HTML in a typed question has its own blocking line,
 * "Plain text only: remove the HTML.", shown only when there is a tag or comment; "One question" says only what it
 * says (one question of 10-200 characters). The same checks run in the drawer and on the server (validate, apply).
 */
import { describe, expect, it } from "vitest";
import { type QuestionValidationContext, validateQuestion } from "@/lib/questions/validate";

const ctx: QuestionValidationContext = {
  brand: { name: "Wattlebird Plumbing", domain: "wattlebird.example.com.au" },
  existingKeys: new Set(),
  brandedInSet: 3,
  maxBranded: 5,
  reach: "local",
  places: ["Chatswood"],
  fixPlace: "Chatswood",
  competitors: [],
};
const HTML_LINE = "Plain text only: remove the HTML.";

describe("the HTML line", () => {
  it.each([
    "Who is the <b>best</b> plumber in Chatswood?",
    "<script>alert(1)</script> who fixes taps in Chatswood?",
    "Who fixes taps in Chatswood <!-- note?",
    "Who fixes taps in Chatswood <img src=x onerror=alert(1)?",
  ])("fails on its own and blocks: %s", (text) => {
    const v = validateQuestion(text, ctx);
    const html = v.checks.filter((c) => c.id === "html");
    expect(html).toEqual([{ id: "html", status: "fail", message: HTML_LINE }]);
    expect(v.ok).toBe(false);
  });

  it("isn't the one-question line: a well-formed question with a tag passes that line", () => {
    const v = validateQuestion("Who is the <b>best</b> plumber in Chatswood?", ctx);
    expect(v.checks.find((c) => c.id === "shape")).toMatchObject({ status: "pass" });
  });

  it("isn't shown for plain text, nor for a lone < or > in words", () => {
    for (const text of [
      "Who is the best plumber in Chatswood?",
      "Which Chatswood plumber charges < $200 for a tap?",
      "Is a plumber in Chatswood worth > $150 an hour?",
    ]) {
      const v = validateQuestion(text, ctx);
      expect(
        v.checks.some((c) => c.id === "html"),
        text,
      ).toBe(false);
      expect(v.ok, text).toBe(true);
    }
  });

  it("follows the always-shown lines, before the place line", () => {
    const v = validateQuestion("Who is the <b>best</b> plumber around here?", ctx);
    expect(v.checks.map((c) => c.id)).toEqual([
      "shape",
      "duplicate",
      "names_business",
      "contact",
      "html",
      "place",
    ]);
  });
});
