/**
 * 17 Nov, part 3 -- a head-to-head comparison's verdict (lib/conversational/comparison-verdict.ts).
 *
 * The old rule (comparison-runner.ts) found the brand by its NAME only. An answer that named it by its website
 * alone gave indexOf(name) = -1, which is always "before" the competitor: a win by default. And whoever was
 * named first won once any verdict word appeared anywhere, while the question itself names the brand's site
 * first, so an answer that just repeated the question's order "won" too. Stored rows carry that verdict; the
 * comparisons API judges each one again from its stored answer (rejudgeStoredComparison).
 */
import { describe, expect, it } from "vitest";
import {
  judgeComparison,
  LEGACY_VERDICT_SNIPPET_CHARS,
  rejudgeStoredComparison,
} from "@/lib/conversational/comparison-verdict";

const PARTIES = {
  brandName: "Bondi Plumbing",
  brandDomain: "bondiplumbing.com.au",
  competitorDomain: "sydneyplumbers.com.au",
};

describe("judgeComparison -- the brand is found by its name or its website, and a win needs a verdict", () => {
  it("THE BUG: named only by its website, with the competitor recommended, is a loss -- never a win by default", () => {
    const answer =
      "bondiplumbing.com.au and sydneyplumbers.com.au both offer emergency plumbing. " +
      "Overall, I would recommend sydneyplumbers.com.au for its longer warranty.";
    const verdict = judgeComparison(answer, PARTIES);
    expect(verdict.brandMentioned).toBe(true);
    expect(verdict.competitorMentioned).toBe(true);
    expect(verdict.brandWon).toBe(false);
  });

  it("an answer that repeats the question's order and gives no verdict is inconclusive, not a win", () => {
    const answer =
      "bondiplumbing.com.au is a local plumber in Bondi. sydneyplumbers.com.au covers greater Sydney. " +
      "Both have good reviews; which is better depends on where you live.";
    // "better" appears, but in a sentence naming neither business: no vote either way.
    expect(judgeComparison(answer, PARTIES).brandWon).toBeNull();
  });

  it("a verdict sentence naming only the brand (by website) is a win", () => {
    const answer =
      "Both are licensed. Verdict: bondiplumbing.com.au is the better choice for Eastern Suburbs customers.";
    expect(judgeComparison(answer, PARTIES).brandWon).toBe(true);
  });

  it('"A is better than B" and "recommend A over B" decide a sentence that names both', () => {
    expect(
      judgeComparison("Bondi Plumbing is better than sydneyplumbers.com.au on price.", PARTIES)
        .brandWon,
    ).toBe(true);
    expect(
      judgeComparison("I'd recommend sydneyplumbers.com.au over Bondi Plumbing.", PARTIES).brandWon,
    ).toBe(false);
  });

  it("a sentence naming both in any other order is no vote: we don't guess", () => {
    const answer =
      "Compared with sydneyplumbers.com.au, bondiplumbing.com.au is better for quick call-outs.";
    expect(judgeComparison(answer, PARTIES).brandWon).toBeNull();
  });

  it("verdicts both ways are inconclusive", () => {
    const answer =
      "For price, bondiplumbing.com.au is better. For coverage, sydneyplumbers.com.au is the better pick.";
    expect(judgeComparison(answer, PARTIES).brandWon).toBeNull();
  });

  it("naming only one business, with no verdict, is neither a win nor a loss", () => {
    expect(
      judgeComparison("bondiplumbing.com.au has been in business since 1998.", PARTIES).brandWon,
    ).toBeNull();
    expect(
      judgeComparison("sydneyplumbers.com.au has 40 vans across Sydney.", PARTIES).brandWon,
    ).toBeNull();
  });

  it("a different domain that contains the brand's domain doesn't name the brand", () => {
    const verdict = judgeComparison(
      "I recommend mybondiplumbing.com.au, not listed here, for blocked drains.",
      PARTIES,
    );
    expect(verdict.brandMentioned).toBe(false);
    expect(verdict.brandWon).toBeNull();
  });

  it("www. and the name in any case still name the brand", () => {
    expect(judgeComparison("See www.bondiplumbing.com.au.", PARTIES).brandMentioned).toBe(true);
    expect(judgeComparison("BONDI PLUMBING answered fast.", PARTIES).brandMentioned).toBe(true);
  });
});

describe("rejudgeStoredComparison -- old rows are judged again from what was stored", () => {
  const stored = {
    // What the old rule stored for THE BUG's answer: a win.
    brandWon: true,
    brandMentioned: true,
    competitorMentioned: true,
  };

  it("an answer kept whole is judged again: the old 'win' for a website-only match becomes the loss it was", () => {
    const answer =
      "bondiplumbing.com.au and sydneyplumbers.com.au both offer emergency plumbing. " +
      "I would recommend sydneyplumbers.com.au.";
    expect(answer.length).toBeLessThan(LEGACY_VERDICT_SNIPPET_CHARS);
    const judged = rejudgeStoredComparison({ ...stored, verdictSnippet: answer }, PARTIES);
    expect(judged.brandWon).toBe(false);
    expect(judged.answerCutOff).toBe(false);
  });

  it("an answer cut off at the old 300 characters can't be judged: inconclusive, saying why, stored flags kept", () => {
    const cut = `bondiplumbing.com.au vs sydneyplumbers.com.au. ${"x".repeat(400)}`.slice(
      0,
      LEGACY_VERDICT_SNIPPET_CHARS,
    );
    const judged = rejudgeStoredComparison(
      { brandWon: true, brandMentioned: true, competitorMentioned: false, verdictSnippet: cut },
      PARTIES,
    );
    expect(judged.brandWon).toBeNull();
    expect(judged.answerCutOff).toBe(true);
    expect(judged.brandMentioned).toBe(true);
    expect(judged.competitorMentioned).toBe(false);
  });

  it("a whole answer longer than 300 characters (any row since 17 Nov) is judged from its text", () => {
    const answer = `${"Both plumbers are licensed and insured in NSW. ".repeat(8)}Verdict: Bondi Plumbing is the better choice.`;
    expect(answer.length).toBeGreaterThan(LEGACY_VERDICT_SNIPPET_CHARS);
    const judged = rejudgeStoredComparison(
      { brandWon: null, brandMentioned: false, competitorMentioned: false, verdictSnippet: answer },
      PARTIES,
    );
    expect(judged.brandWon).toBe(true);
    expect(judged.brandMentioned).toBe(true);
  });

  it("a row with no stored text keeps what was stored (no runner writes one)", () => {
    const judged = rejudgeStoredComparison({ ...stored, verdictSnippet: null }, PARTIES);
    expect(judged).toEqual({ ...stored, answerCutOff: false });
  });
});
