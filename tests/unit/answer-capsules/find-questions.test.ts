/**
 * ⚠️ NNN — fixes three real bugs in the Answer Capsules detector (task MMM
 * found them live against bondiplumbing.com.au):
 *   1. The capsule check measured only the first SENTENCE of the following
 *      text (15-30 words), not the full answer -- while the UI always said
 *      20-25. A dead `words` variable already computed the full-paragraph
 *      count and was never used.
 *   2. The sibling-walk silently returned "" on page-builder markup
 *      (Duda/Wix/Squarespace -- the small-business target market), where
 *      every block is wrapped in its own container <div>, so the real
 *      answer is a sibling of the heading's PARENT, not of the heading.
 *   3. (covered in check-capsule.test.ts / answer-capsules-page.test.ts)
 *      capsuleFinding was computed and never surfaced.
 */
import { describe, expect, it } from "vitest";
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

describe("⚠️ NNN — ANSWER_CAPSULE_WORDS: single source, 20-25 (Sri's decision)", () => {
  it("is exactly {min: 20, max: 25}", () => {
    expect(ANSWER_CAPSULE_WORDS).toEqual({ min: 20, max: 25 });
  });
});

describe("⚠️ NNN — simple markup: unchanged sibling-walk, now measuring the full answer", () => {
  it("a 22-word answer across two <p> siblings -> has capsule (full-answer word count, not first-sentence)", () => {
    const html = `<html><body>
      <h2>How do tree roots damage drainage?</h2>
      <p>${words(10)}.</p>
      <p>${words(12)}.</p>
      <h2>Next question?</h2>
    </body></html>`;
    const [q] = findQuestionHeadings(makePage(html));
    expect(q.wordCount).toBe(22);
    expect(q.hasCapsule).toBe(true);
  });

  it("regression: Bondi's real shape (two paragraphs, 102 words total) still extracts via the plain sibling-walk, needs capsule", () => {
    const html = `<html><body>
      <h2>How do tree roots damage drainage?</h2>
      <p>${words(47)}.</p>
      <p>${words(55)}.</p>
      <h2>Next question?</h2>
    </body></html>`;
    const [q] = findQuestionHeadings(makePage(html));
    expect(q.wordCount).toBe(102);
    expect(q.hasCapsule).toBe(false);
  });
});

describe("⚠️ NNN — page-builder wrapped markup: the extraction fix", () => {
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

  it("falls back one level further (grandparent siblings) for more deeply nested wrappers", () => {
    const html = `<html><body>
      <div class="outer">
        <div class="dmRespCol">
          <div class="dmNewParagraph"><h3>Another question?</h3></div>
        </div>
        <div class="dmNewParagraph"><p>${words(30)}.</p></div>
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

describe("⚠️ NNN — measurement: a tight 20-25 word range, too-short OR too-long both need a capsule", () => {
  it.each([
    [19, false],
    [20, true],
    [22, true],
    [25, true],
    [26, false],
    [32, false],
  ])("a %i-word answer -> hasCapsule %s", (n, expected) => {
    const html = `<html><body><h2>Is this a question?</h2><p>${words(n)}.</p><h2>Next?</h2></body></html>`;
    const [q] = findQuestionHeadings(makePage(html));
    expect(q.wordCount).toBe(n);
    expect(q.hasCapsule).toBe(expected);
  });
});

describe("⚠️ NNN — live Bondi reconciliation (real markup shapes, verified live against bondiplumbing.com.au)", () => {
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
      // real word counts per paragraph, live-verified task NNN.
      makePage(`<html><body>
        <h2>How do tree roots damage drainage?</h2>
        <p>${words(47)}.</p>
        <p>${words(55)}.</p>
      </body></html>`),
      // "How do we fix a Plumbing Pipe Blockage?" (H2, same page).
      makePage(`<html><body>
        <h2>How do we fix a Plumbing Pipe Blockage?</h2>
        <p>${words(14)}.</p>
        <p>${words(41)}.</p>
        <p>${words(39)}.</p>
        <p>${words(62)}.</p>
      </body></html>`),
      // "Hot Water Systems – Which one is right for me?" (H2, /hot-water-bondi).
      makePage(`<html><body>
        <h2>Hot Water Systems – Which one is right for me?</h2>
        <p>${words(56)}.</p>
        <p>${words(32)}.</p>
        <p>${words(15)}.</p>
      </body></html>`),
    ];
  }

  it("4 questions found, real answer word counts, all 'needs capsule' -- now for the right reason", () => {
    const all = bondiShapedPages().flatMap((p) => findQuestionHeadings(p));
    expect(all).toHaveLength(4);
    expect(all.map((q) => q.wordCount)).toEqual([0, 102, 156, 103]);
    expect(all.every((q) => !q.hasCapsule)).toBe(true);
  });
});
