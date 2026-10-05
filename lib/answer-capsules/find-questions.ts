import * as cheerio from "cheerio";
import type { CrawlPage } from "@/lib/crawler/types";

// Task NNN: a capsule is a 20-25 word DIRECT ANSWER, matching the UI's own
// explainer copy. Single-sourced here so the UI can import it instead of
// hardcoding the range a second time (the same drift this constant fixes
// already happened once: the check used to measure a 15-30 word range
// while the UI said 20-25).
export const ANSWER_CAPSULE_WORDS = { min: 20, max: 25 } as const;

const HEADING_SELECTOR = "h1, h2, h3, h4, h5, h6";

export interface QuestionHeading {
  tag: string;
  question: string;
  followingText: string;
  hasCapsule: boolean;
  wordCount: number;
}

export function findQuestionHeadings(page: CrawlPage): QuestionHeading[] {
  const $ = cheerio.load(page.html);
  const questions: QuestionHeading[] = [];

  $("h2, h3").each((_, el) => {
    const questionText = $(el).text().trim();
    if (!questionText.endsWith("?")) return;

    const $el = $(el);

    // Task OOO: "a 20-25 word direct answer immediately following the
    // heading" means the OPENING block, not everything up to the next
    // heading -- a page that correctly starts with a tight capsule and then
    // elaborates must read "has capsule," not get penalized for the
    // elaboration that follows. So this returns only the FIRST non-empty
    // sibling's text (skipping blank spacer blocks, a real pattern on
    // Bondi's page-builder markup), not an accumulation across siblings.
    const firstBlockTextFromSiblingsOf = (start: typeof $el): string => {
      let next = start.next();
      while (next.length > 0) {
        if (next.is(HEADING_SELECTOR) || next.find(HEADING_SELECTOR).length > 0) break;
        const chunk = next.text().trim();
        if (chunk) return chunk;
        next = next.next();
      }
      return "";
    };

    let followingText = firstBlockTextFromSiblingsOf($el);

    // Page-builder sites (Duda/Wix/Squarespace -- the small-business target
    // market) wrap every block, heading and paragraph alike, in its own
    // container <div>. A heading with no useful sibling of its OWN still
    // has a real answer one level up: a sibling of the heading's PARENT.
    // Bondi's "What's your plumbing emergency?" is exactly this shape --
    // the plain sibling-walk above always returned "" for it.
    let ancestor = $el.parent();
    let depth = 0;
    while (!followingText && ancestor.length > 0 && depth < 2) {
      followingText = firstBlockTextFromSiblingsOf(ancestor);
      ancestor = ancestor.parent();
      depth++;
    }

    const wordCount = followingText.split(/\s+/).filter(Boolean).length;
    const hasCapsule =
      wordCount >= ANSWER_CAPSULE_WORDS.min && wordCount <= ANSWER_CAPSULE_WORDS.max;

    questions.push({
      tag: el.tagName,
      question: questionText,
      followingText: followingText.slice(0, 300),
      hasCapsule,
      wordCount,
    });
  });

  return questions;
}
