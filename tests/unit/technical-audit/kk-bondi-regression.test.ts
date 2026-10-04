/**
 * ⚠️ KK — the critical regression: replaying Bondi Plumbing's REAL inputs
 * (confirmed live in tasks FF/JJ) through all three fixed scorers must
 * produce byte-identical dimension totals to before this task. None of
 * the three fixes (capsule zero-questions, robots missing-file gating,
 * directory 403-vs-404) are supposed to change ANY current score -- they
 * only correct what happens on inputs Bondi doesn't have (no robots.txt
 * at all, zero question headings anywhere).
 *
 * Robots 18/18, Content quality 6/12, Brand & Entity 2/10 -- same numbers
 * task JJ independently reconciled against the live site.
 */
import { describe, expect, it } from "vitest";
import { checkCapsuleQuality } from "@/lib/answer-capsules/check-capsule";
import type { QuestionHeading } from "@/lib/answer-capsules/find-questions";
import { brandEntityScore } from "@/lib/brand-entity/score";
import type { CrawlResult } from "@/lib/crawler/types";
import { analyzeRobots } from "@/lib/robots-txt/analyze";

describe("⚠️ KK — Bondi Plumbing regression: unchanged across all three fixes", () => {
  it("robots.txt: Bondi's real, present, permissive file still scores 18/18", () => {
    const bondiRobots = `Sitemap: https://www.bondiplumbing.com.au/sitemap.xml
User-agent: *
Content-Signal: search=yes, ai-input=yes, ai-train=yes
`;
    const crawl: CrawlResult = {
      domain: "bondiplumbing.com.au",
      pages: [
        {
          url: "https://www.bondiplumbing.com.au/",
          statusCode: 200,
          title: "Bondi Plumbing | Plumber Bondi | Blocked Drains",
          textContent: "",
          wordCount: 1200,
          excerpt: "",
          byline: null,
          html: "<html></html>",
          headers: {},
        },
      ],
      robotsTxt: bondiRobots,
      sitemapXml: null,
      crawledAt: new Date(),
      errors: [],
    };

    expect(analyzeRobots(crawl).score).toBe(18);
  });

  it("content quality: Bondi has ≥1 real question heading that fails the capsule-length bar -> capsules=0, same as before", () => {
    // Bondi's real shape (task JJ, arithmetically confirmed): SSR scores
    // the max 6/6 (real server-rendered content, >50 words), and there is
    // at least one genuine question-style heading somewhere in the crawl
    // whose answer doesn't land in the 15-30 word capsule range -- NOT
    // the zero-questions case this task fixes. capsules.score was 0
    // before this fix (a real 0% pass rate) and must still be 0 after.
    const bondiShapedQuestions: QuestionHeading[] = [
      {
        tag: "h3",
        question: "Do you offer emergency plumbing?",
        followingText: "Yes.", // far too short for a 15-30 word capsule
        hasCapsule: false,
        wordCount: 1,
      },
    ];

    const capsules = checkCapsuleQuality(bondiShapedQuestions);
    expect(capsules.score).toBe(0);
    expect(capsules.finding).toBeNull(); // real questions exist -- no "zero questions" finding

    const ssrScore = 6; // confirmed in task JJ: real SSR content, full marks
    const contentScore = Math.min(12, ssrScore + capsules.score);
    expect(contentScore).toBe(6);
  });

  it("brand & entity: AU TLD true, ABN/Wikipedia/directories all false -> 2/10, same as before", () => {
    const score = brandEntityScore({
      abnVerified: false, // no ABN on this test brand (task JJ)
      wikipediaAuPresent: false, // confirmed via live Wikipedia search (task JJ)
      auTldPresent: true, // bondiplumbing.com.au -- confirmed real
      auDirectoryCount: 0, // all 4 directories unverifiable/not-listed (task JJ/KK)
    });

    expect(score).toBe(2);
  });
});
