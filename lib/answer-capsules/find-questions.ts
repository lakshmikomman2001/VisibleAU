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

    const collectFromSiblingsOf = (start: typeof $el): string => {
      let collected = "";
      let next = start.next();
      while (next.length > 0) {
        if (next.is(HEADING_SELECTOR) || next.find(HEADING_SELECTOR).length > 0) break;
        const chunk = next.text().trim();
        if (chunk) collected += ` ${chunk}`;
        next = next.next();
      }
      return collected.trim();
    };

    let followingText = collectFromSiblingsOf($el);

    // Page-builder sites (Duda/Wix/Squarespace -- the small-business target
    // market) wrap every block, heading and paragraph alike, in its own
    // container <div>. A heading with no useful sibling of its OWN still
    // has a real answer one level up: a sibling of the heading's PARENT.
    // Bondi's "What's your plumbing emergency?" is exactly this shape --
    // the plain sibling-walk above always returned "" for it.
    let ancestor = $el.parent();
    let depth = 0;
    while (!followingText && ancestor.length > 0 && depth < 2) {
      followingText = collectFromSiblingsOf(ancestor);
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
