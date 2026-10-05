/**
 * ⚠️ NNN fixed three real bugs in the Answer Capsules detector (task MMM
 * found them live against bondiplumbing.com.au): first-sentence-only
 * measurement instead of the real answer, a sibling-walk that silently
 * returned "" on page-builder markup, and a dangling capsuleFinding.
 *
 * ⚠️ Task OOO corrects NNN's own measurement extent: NNN accumulated every
 * block from the heading to the next heading (the whole section), which
 * structurally can almost never land in 20-25 words and contradicts the
 * feature's own definition -- "a direct answer immediately following the
 * heading... AI engines prefer content that STARTS with the answer." A page
 * that opens with a tight 22-word capsule and then elaborates must read
 * "has capsule," not get penalized for the elaboration. So this measures
 * only the FIRST non-empty block after the heading (skipping blank spacer
 * blocks, a real pattern on Bondi's page-builder markup), not an
 * accumulation up to the next heading.
 */
import { describe, expect, it } from "vitest";
import { checkCapsuleQuality } from "@/lib/answer-capsules/check-capsule";
import type { CrawlPage } from "@/lib/crawler/types";
import { ANSWER_CAPSULE_WORDS, findQuestionHeadings } from "@/lib/answer-capsules/find-questions";

function words(n: number): string {
  return Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
}

function makePage(html: string): CrawlPage {
  return {
    url: "https://bondiplumbing.com.au/",
    statusCode: 200,
    title: "",
    textContent: "",
    wordCount: 0,
    excerpt: "",
    byline: null,
    html,
    headers: {},
  };
}

describe("⚠️ NNN — ANSWER_CAPSULE_WORDS: single source, 20-25 (Sri's decision, unchanged by OOO)", () => {
  it("is exactly {min: 20, max: 25}", () => {
    expect(ANSWER_CAPSULE_WORDS).toEqual({ min: 20, max: 25 });
  });
});

describe("⚠️ OOO — the positive path: an opening capsule followed by elaboration must read 'has capsule'", () => {
  it("heading + a 22-word opening paragraph + several more paragraphs -> has capsule (RED on NNN's whole-section accumulation, GREEN after)", () => {
    const html = `<html><body>
      <h2>How do tree roots damage drainage?</h2>
      <p>${words(22)}.</p>
      <p>${words(40)}.</p>
      <p>${words(30)}.</p>
      <h2>Next question?</h2>
    </body></html>`;
    const [q] = findQuestionHeadings(makePage(html));
    expect(q.wordCount).toBe(22);
    expect(q.hasCapsule).toBe(true);
  });

  it("the section total (22+40+30=92) is NOT what gets measured -- only the opening block", () => {
    const html = `<html><body>
      <h2>How do tree roots damage drainage?</h2>
      <p>${words(22)}.</p>
      <p>${words(40)}.</p>
      <p>${words(30)}.</p>
      <h2>Next question?</h2>
    </body></html>`;
    const [q] = findQuestionHeadings(makePage(html));
    expect(q.wordCount).not.toBe(92);
  });
});

describe("⚠️ OOO — first-block measurement: too short, too long, or no block at all", () => {
  it("a 102-word opening paragraph (no elaboration after) -> needs capsule (too long)", () => {
    const html = `<html><body><h2>Is this a question?</h2><p>${words(102)}.</p></body></html>`;
    const [q] = findQuestionHeadings(makePage(html));
    expect(q.wordCount).toBe(102);
    expect(q.hasCapsule).toBe(false);
  });

  it("a 15-word opening paragraph -> needs capsule (too short)", () => {
    const html = `<html><body><h2>Is this a question?</h2><p>${words(15)}.</p></body></html>`;
    const [q] = findQuestionHeadings(makePage(html));
    expect(q.wordCount).toBe(15);
    expect(q.hasCapsule).toBe(false);
  });

  it("no paragraph at all -> 0 words, needs capsule, no crash", () => {
    const html = `<html><body><h2>Is this a question?</h2></body></html>`;
    expect(() => findQuestionHeadings(makePage(html))).not.toThrow();
    const [q] = findQuestionHeadings(makePage(html));
    expect(q.wordCount).toBe(0);
    expect(q.hasCapsule).toBe(false);
  });

  it("skips blank spacer blocks (a real Bondi pattern: empty <p> tags between real paragraphs) to find the first REAL block", () => {
    const html = `<html><body>
      <h2>Is this a question?</h2>
      <p></p>
      <p>${words(22)}.</p>
      <p>${words(40)}.</p>
      <h2>Next?</h2>
    </body></html>`;
    const [q] = findQuestionHeadings(makePage(html));
    expect(q.wordCount).toBe(22);
    expect(q.hasCapsule).toBe(true);
  });
});

describe("⚠️ NNN — page-builder wrapped markup: the extraction fix (still finds the answer; OOO now measures only its first block)", () => {
  it("extracts the answer from the heading's PARENT's sibling when the heading itself has none (RED on the pre-fix sibling-walk, GREEN after)", () => {
    const html = `<html><body>
      <div class="dmRespCol">
        <div class="dmNewParagraph"><h3>What’s your plumbing emergency?</h3></div>
        <div class="dmNewParagraph"><p>${words(22)}.</p></div>
        <div class="dmNewParagraph"><h3>Next question?</h3></div>
      </div>
    </body></html>`;
    const [q] = findQuestionHeadings(makePage(html));
    expect(q.wordCount).toBe(22);
    expect(q.hasCapsule).toBe(true);
  });

  it("falls back one level further (grandparent siblings) for more deeply nested wrappers, measuring only the first block found there", () => {
    const html = `<html><body>
      <div class="outer">
        <div class="dmRespCol">
          <div class="dmNewParagraph"><h3>Another question?</h3></div>
        </div>
        <div class="dmNewParagraph"><p>${words(30)}.</p></div>
        <div class="dmNewParagraph"><p>${words(40)}.</p></div>
      </div>
    </body></html>`;
    const [q] = findQuestionHeadings(makePage(html));
    expect(q.wordCount).toBe(30);
    expect(q.hasCapsule).toBe(false);
  });

  it("a heading genuinely followed by no server-rendered text (e.g. a JS-rendered widget) -> 0 words, needs capsule, no crash", () => {
    // Real shape: /emergency-plumber-bondi's "What's your plumbing
    // emergency?" is followed by a custom tabs widget whose real content
    // lives inside a base64-encoded data-widget-config attribute -- never
    // rendered as text a no-JS crawler (or this check) can see. This is a
    // genuine "no answer paragraph" case, not an extraction bug.
    const html = `<html><body>
      <div class="dmRespCol">
        <div class="dmNewParagraph"><h3>What’s your plumbing emergency?</h3></div>
        <div class="dmCustomWidget" data-widget-config="eyJmb28iOiJiYXIifQ=="></div>
        <div class="dmNewParagraph"><h3>Next question?</h3></div>
      </div>
    </body></html>`;
    expect(() => findQuestionHeadings(makePage(html))).not.toThrow();
    const [q] = findQuestionHeadings(makePage(html));
    expect(q.wordCount).toBe(0);
    expect(q.hasCapsule).toBe(false);
  });

  it("a heading followed immediately by another heading -> 0 words, no crash", () => {
    const html = `<html><body><h2>First question?</h2><h2>Second question?</h2></body></html>`;
    expect(() => findQuestionHeadings(makePage(html))).not.toThrow();
    const [q] = findQuestionHeadings(makePage(html));
    expect(q.wordCount).toBe(0);
    expect(q.hasCapsule).toBe(false);
  });
});

describe("⚠️ NNN/OOO — measurement: a tight 20-25 word range, too-short OR too-long both need a capsule", () => {
  it.each([
    [19, false],
    [20, true],
    [22, true],
    [25, true],
    [26, false],
    [32, false],
  ])("a %i-word opening paragraph -> hasCapsule %s", (n, expected) => {
    const html = `<html><body><h2>Is this a question?</h2><p>${words(n)}.</p><h2>Next?</h2></body></html>`;
    const [q] = findQuestionHeadings(makePage(html));
    expect(q.wordCount).toBe(n);
    expect(q.hasCapsule).toBe(expected);
  });
});

describe("⚠️ OOO — live Bondi reconciliation (real markup shapes, first-block counts verified live against bondiplumbing.com.au)", () => {
  function bondiShapedPages(): CrawlPage[] {
    return [
      // "What's your plumbing emergency?" (H3, /emergency-plumber-bondi) --
      // real shape, see the widget test above.
      makePage(`<html><body>
        <div class="dmRespCol">
          <div class="dmNewParagraph"><h3>What’s your plumbing emergency?</h3></div>
          <div class="dmCustomWidget" data-widget-config="eyJ0YWJzIjpbXX0="></div>
        </div>
      </body></html>`),
      // "How do tree roots damage drainage?" (H2, /blocked-drains-bondi) --
      // real opening paragraph is 47 words (task NNN's 102 was the whole
      // section, two paragraphs of 47 + 55).
      makePage(`<html><body>
        <h2>How do tree roots damage drainage?</h2>
        <p>${words(47)}.</p>
        <p>${words(55)}.</p>
      </body></html>`),
      // "How do we fix a Plumbing Pipe Blockage?" (H2, same page) -- real
      // opening paragraph is 14 words (NNN's 156 summed all 4 paragraphs).
      makePage(`<html><body>
        <h2>How do we fix a Plumbing Pipe Blockage?</h2>
        <p>${words(14)}.</p>
        <p>${words(41)}.</p>
        <p>${words(39)}.</p>
        <p>${words(62)}.</p>
      </body></html>`),
      // "Hot Water Systems – Which one is right for me?" (H2, /hot-water-bondi)
      // -- real opening paragraph is 56 words (NNN's 103 summed all 3).
      makePage(`<html><body>
        <h2>Hot Water Systems – Which one is right for me?</h2>
        <p>${words(56)}.</p>
        <p>${words(32)}.</p>
        <p>${words(15)}.</p>
      </body></html>`),
    ];
  }

  it("4 questions found, real OPENING-paragraph word counts, all still 'needs capsule' -- Bondi's outcome is unchanged by OOO", () => {
    const all = bondiShapedPages().flatMap((p) => findQuestionHeadings(p));
    expect(all).toHaveLength(4);
    expect(all.map((q) => q.wordCount)).toEqual([0, 47, 14, 56]);
    expect(all.every((q) => !q.hasCapsule)).toBe(true);
  });

  it("Content Quality: checkCapsuleQuality's score for Bondi is unchanged (0/4 passed under NNN, 0/4 still pass under OOO)", () => {
    const all = bondiShapedPages().flatMap((p) => findQuestionHeadings(p));
    const capsules = checkCapsuleQuality(all);
    expect(capsules.totalQuestions).toBe(4);
    expect(capsules.questionsWithCapsule).toBe(0);
    expect(capsules.score).toBe(0);
    expect(capsules.finding).toBeNull(); // real questions exist
  });
});
