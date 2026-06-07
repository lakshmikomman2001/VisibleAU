import * as cheerio from "cheerio";
import type { CrawlPage } from "@/lib/crawler/types";

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
    const text = $(el).text().trim();
    if (!text.endsWith("?")) return;

    let followingText = "";
    let next = $(el).next();
    while (next.length && !next.is("h1, h2, h3, h4, h5, h6")) {
      followingText += ` ${next.text().trim()}`;
      next = next.next();
    }
    followingText = followingText.trim();
    const words = followingText.split(/\s+/).filter(Boolean);
    const firstSentence = followingText.split(/[.!?]/)[0]?.trim() ?? "";
    const firstSentenceWords = firstSentence.split(/\s+/).filter(Boolean).length;
    const hasCapsule = firstSentenceWords >= 15 && firstSentenceWords <= 30;

    questions.push({
      tag: el.tagName,
      question: text,
      followingText: followingText.slice(0, 300),
      hasCapsule,
      wordCount: firstSentenceWords,
    });
  });

  return questions;
}
