/**
 * Sri's decision (7 Nov) -- the Reddit evidence action counts the everyday answers that cited a Reddit page
 * (lib/visibility/source-type-citations.ts): only sources the answer cited, a Gemini grounding link by the
 * site it names, and one answer once however many Reddit pages it cited.
 */
import { describe, expect, it } from "vitest";
import { countSourceTypeCitations } from "@/lib/visibility/source-type-citations";

const REDIRECT = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc";

describe("answers citing each source type", () => {
  it("counts each answer once per type, and every answer in the total", () => {
    const counts = countSourceTypeCitations([
      {
        citedSources: [
          { domain: "reddit.com", url: "https://www.reddit.com/r/sydney/comments/1/" },
          { domain: "reddit.com", url: "https://www.reddit.com/r/sydney/comments/2/" },
          { domain: "hipages.com.au", url: "https://hipages.com.au/connect/x" },
        ],
      },
      { citedSources: ["https://www.reddit.com/r/AusFinance/comments/3/"] },
      { citedSources: [] },
    ]);
    expect(counts).toEqual({
      totalAnswers: 3,
      answersCiting: { reddit_thread: 2, au_directory: 1 },
    });
  });

  it("a Gemini grounding link counts by the site it names", () => {
    const counts = countSourceTypeCitations([
      { citedSources: [{ url: REDIRECT, domain: "reddit.com" }] },
    ]);
    expect(counts.answersCiting.reddit_thread).toBe(1);
  });

  it("a search result the answer didn't cite never counts", () => {
    const counts = countSourceTypeCitations([
      {
        citedSources: [
          {
            domain: "reddit.com",
            url: "https://www.reddit.com/r/sydney/comments/1/",
            cited: false,
          },
        ],
      },
    ]);
    expect(counts).toEqual({ totalAnswers: 1, answersCiting: {} });
  });
});
