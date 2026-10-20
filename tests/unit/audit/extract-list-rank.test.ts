/**
 * Vunnara (20 Oct, post-a093ceb), headline-fix follow-up, item 1 --
 * extractListRank (lib/audit/extract-list-rank.ts) replaced
 * detectBrandMention's old "count capitalised word groups before the
 * match" heuristic, which had nothing to do with real list structure
 * (production evidence, audit #30 Omega Services: ChatGPT ranked Omega
 * 4th, stored as 33; 8th, stored as 53; Perplexity's first bullet
 * stored as 4). This proves the extractor against synthetic text
 * shaped exactly like real ChatGPT/Perplexity list output, including
 * the audit #30 mock itself with CORRECTED numbers: ChatGPT 4th and
 * 8th, Perplexity 1st, 2nd, 3rd, and 8th (6 ranked mentions total) --
 * replacing the old, nonsensical 33/53/4. The app displays the MEDIAN
 * of these ranks (3.5, rounds to "Typically #4 when listed, 6 of 6
 * listed" -- lib/scoring/resolve-audit-dimensions.ts, matching
 * positionDimensionScore's own formula), not the arithmetic mean
 * computed below for reference only -- the two happen to both round to
 * "#4" for this exact fixture, which is a coincidence of this data, not
 * a guarantee.
 */
import { describe, expect, it } from "vitest";
import { extractListRank } from "@/lib/audit/extract-list-rank";

function indexOf(response: string, needle: string): number {
  const idx = response.indexOf(needle);
  if (idx === -1) throw new Error(`"${needle}" not found in fixture`);
  return idx;
}

describe("extractListRank", () => {
  it("a numbered line's own number IS the rank, exactly -- not a count of anything", () => {
    const response = [
      "Here are the top local plumbers:",
      "1. Acme Plumbing",
      "2. Best Pipes Co",
      "3. City Plumbing Services",
      "4. Omega Services",
      "5. Reliable Plumbers",
    ].join("\n");
    const idx = indexOf(response, "4. Omega Services");
    expect(extractListRank(response, idx + 3)).toBe(4);
  });

  it("a numbered line far down a list (two-digit rank) still reads its own number directly", () => {
    const lines = ["Top 10 electricians:"];
    for (let i = 1; i <= 7; i++) lines.push(`${i}. Competitor ${i}`);
    lines.push("8. Omega Services");
    lines.push("9. Competitor 9");
    const response = lines.join("\n");
    const idx = indexOf(response, "8. Omega Services");
    expect(extractListRank(response, idx + 3)).toBe(8);
  });

  it("a bullet line's rank is its 1-based position in the contiguous run of bullets above it", () => {
    const response = [
      "Local options worth checking out:",
      "- Acme Plumbing",
      "- Omega Services",
      "- Best Pipes Co",
    ].join("\n");
    const idx = indexOf(response, "- Omega Services");
    expect(extractListRank(response, idx + 2)).toBe(2);
  });

  it("a blank line inside a bulleted list does not break the contiguous run", () => {
    const response = ["- Acme Plumbing", "", "- Omega Services", "- Best Pipes Co"].join("\n");
    const idx = indexOf(response, "- Omega Services");
    expect(extractListRank(response, idx + 2)).toBe(2);
  });

  it("a mention in plain prose (no list marker on its own line) returns null -- 'mentioned, not ranked', never a guessed rank", () => {
    const response =
      "For plumbing in Sydney, many homeowners turn to Omega Services, among several other reputable local providers.";
    const idx = indexOf(response, "Omega Services");
    expect(extractListRank(response, idx)).toBeNull();
  });

  it("a wrapped continuation line with no marker of its own returns null rather than inheriting the item above's rank", () => {
    const response = [
      "1. Acme Plumbing",
      "2. Omega Services, a long-running local",
      "   business serving the greater metro area",
      "3. Best Pipes Co",
    ].join("\n");
    // The continuation line itself has no marker -- a match landing on
    // IT (not the "2." line) must return null, not fabricate 2.
    const idx = indexOf(response, "business serving");
    expect(extractListRank(response, idx)).toBeNull();
  });

  it("a bullet character appearing mid-sentence, not at the start of its line, is prose -- not a list item", () => {
    const response = "Our top pick - Omega Services - stood out for its fast turnaround.";
    const idx = indexOf(response, "Omega Services");
    expect(extractListRank(response, idx)).toBeNull();
  });

  // The hotfix spec's own corrected mock: production audit #30 (Omega
  // Services) -- 6 of 37 organic answers mentioned the brand, every one
  // of them inside a list. Old (word-count) heuristic stored 33, 53, 4,
  // ... -- meaningless. extractListRank gives the real ranks:
  // ChatGPT 4th and 8th, Perplexity 1st, 2nd, 3rd, and 8th.
  it("audit #30 corrected mock: ChatGPT ranks 4 and 8, Perplexity ranks 1, 2, 3, and 8 -- 6 of 6 listed, median rank 3.5 ('typically #4 when listed')", () => {
    const chatgptAnswerA = [
      "Here are well-regarded options in the area:",
      "1. Acme Trade Services",
      "2. City Wide Repairs",
      "3. Local Fix Co",
      "4. Omega Services",
      "5. Metro Maintenance",
    ].join("\n");
    const chatgptAnswerB = (() => {
      const lines = ["Based on availability and reviews, consider:"];
      for (let i = 1; i <= 7; i++) lines.push(`${i}. Provider ${i}`);
      lines.push("8. Omega Services");
      return lines.join("\n");
    })();
    const perplexityAnswerA = [
      "- Omega Services",
      "- Reliable Local Co",
      "- Budget Trade Services",
    ].join("\n");
    const perplexityAnswerB = [
      "- Reliable Local Co",
      "- Omega Services",
      "- Budget Trade Services",
    ].join("\n");
    const perplexityAnswerC = [
      "- Reliable Local Co",
      "- Budget Trade Services",
      "- Omega Services",
    ].join("\n");
    const perplexityAnswerD = (() => {
      const lines: string[] = [];
      for (let i = 1; i <= 7; i++) lines.push(`- Provider ${i}`);
      lines.push("- Omega Services");
      return lines.join("\n");
    })();

    const ranks = [
      extractListRank(chatgptAnswerA, indexOf(chatgptAnswerA, "4. Omega Services") + 3),
      extractListRank(chatgptAnswerB, indexOf(chatgptAnswerB, "8. Omega Services") + 3),
      extractListRank(perplexityAnswerA, indexOf(perplexityAnswerA, "- Omega Services") + 2),
      extractListRank(perplexityAnswerB, indexOf(perplexityAnswerB, "- Omega Services") + 2),
      extractListRank(perplexityAnswerC, indexOf(perplexityAnswerC, "- Omega Services") + 2),
      extractListRank(perplexityAnswerD, indexOf(perplexityAnswerD, "- Omega Services") + 2),
    ];

    expect(ranks).toEqual([4, 8, 1, 2, 3, 8]);
    expect(ranks.every((r): r is number => r !== null)).toBe(true);
    const realRanks = ranks as number[];
    // The app displays the MEDIAN, not this mean -- computed here only
    // to show the two statistics coincidentally round to the same "#4"
    // for this fixture (see this file's own top comment).
    const sorted = [...realRanks].sort((a, b) => a - b);
    const median = (sorted[2] + sorted[3]) / 2;
    expect(median).toBe(3.5); // "typically #4 when listed (6 of 6 listed)"
    const mean = realRanks.reduce((a, b) => a + b, 0) / realRanks.length;
    expect(mean).toBeCloseTo(4.33, 1); // also rounds to "#4", by coincidence

    // What production actually stored under the OLD heuristic, for
    // contrast -- a word-count artifact, not a rank (diag-0082): 33 and
    // 53 for the two ChatGPT mentions, 4 for Perplexity's first.
    expect(realRanks).not.toContain(33);
    expect(realRanks).not.toContain(53);
  });
});

/**
 * Vunnara (21 Oct), addendum -- "4 of 6 listed" on live audit #30: both
 * ChatGPT answers number their list in markdown bold ("**4. Omega
 * Services**"), which the plain NUMBERED_LINE regex above never
 * matched (no bold marker in its character class) -- so both ChatGPT
 * ranks silently came back null ("not ranked"), and the median was
 * computed from Perplexity's 4 alone (1, 2, 3, 8 -> median 2.5,
 * "Typically #3"), overstating the brand's real position. These
 * fixtures are the real diag-0082 response_text excerpts, verbatim --
 * including the trailing double-space hard line breaks and the "---"
 * section divider -- not a simplified restatement.
 */
describe("extractListRank -- markdown-wrapped numbered lines (production audit #30)", () => {
  it("production excerpt 1: ChatGPT's '**4. Omega Services**' (bold-wrapping the whole item) ranks 4", () => {
    const response =
      "**4. Omega Services**  \n" +
      "- Based in Norwest (Suite 6964, 26 Brookhollow Avenue), licensed (Licence No. 361573C), ...";
    const idx = indexOf(response, "Omega Services");
    expect(extractListRank(response, idx)).toBe(4);
  });

  it("production excerpt 2: ChatGPT's second answer -- a '---' section divider then a blank line before '**8. Omega Services**' -- ranks 8, explicit number, never reset by the divider", () => {
    const response =
      "---\n" +
      "\n" +
      "**8. Omega Services**  \n" +
      "- Located in Norwest, this provider offers plumbing, electrical, hot water, and drain services. ...";
    const idx = indexOf(response, "Omega Services");
    expect(extractListRank(response, idx)).toBe(8);
  });

  it("production excerpt 3: Perplexity's '- **Omega Services** — ...' (bold NAME on an ordinary bullet) still ranks via the existing bullet rule, unaffected by the markdown fix", () => {
    const response = [
      "- **Acme Trade Co** — Licensed and insured.",
      "- **Omega Services** — Licensed and insured, NSW licence **361573C**; ...",
    ].join("\n");
    const idx = indexOf(response, "Omega Services");
    expect(extractListRank(response, idx)).toBe(2);
  });

  it("'**4.** Name' -- bold wraps only the number+punctuation, not the name", () => {
    const response = "**4.** Omega Services";
    const idx = indexOf(response, "Omega Services");
    expect(extractListRank(response, idx)).toBe(4);
  });

  it("'4) Name' -- a closing-paren numbered item, no bold", () => {
    const response = "4) Omega Services";
    const idx = indexOf(response, "Omega Services");
    expect(extractListRank(response, idx)).toBe(4);
  });

  it("'### 4. Name' -- a markdown heading prefix before the number", () => {
    const response = "### 4. Omega Services";
    const idx = indexOf(response, "Omega Services");
    expect(extractListRank(response, idx)).toBe(4);
  });

  it("'#### 4) Name' -- a deeper heading level, closing-paren separator", () => {
    const response = "#### 4) Omega Services";
    const idx = indexOf(response, "Omega Services");
    expect(extractListRank(response, idx)).toBe(4);
  });

  it("'**#4 Name**' -- a bold '#N' rank marker, no period/paren separator at all", () => {
    const response = "**#4 Omega Services**";
    const idx = indexOf(response, "Omega Services");
    expect(extractListRank(response, idx)).toBe(4);
  });

  it("a numbered item whose name is a markdown link -- already worked pre-fix, pinned down here", () => {
    const response = "4. [Omega Services](https://omegaservices.example.com.au)";
    const idx = indexOf(response, "Omega Services");
    expect(extractListRank(response, idx)).toBe(4);
  });

  it("a bare '**Omega Services**' bold phrase with no number/bullet at all is still prose -- never fabricates a rank", () => {
    const response = "**Omega Services** is a well-regarded local plumber.";
    const idx = indexOf(response, "Omega Services");
    expect(extractListRank(response, idx)).toBeNull();
  });

  it("a full synthetic ChatGPT-style answer: intro paragraph, 8 bold-numbered items separated by '---', Omega last -- ranks 8", () => {
    const lines = ["Here are well-regarded local providers to consider:", ""];
    const names = ["A", "B", "C", "D", "E", "F", "G", "Omega Services"];
    names.forEach((name, i) => {
      if (i > 0) {
        lines.push("---");
        lines.push("");
      }
      lines.push(`**${i + 1}. ${name}**  `);
      lines.push(`- A reputable local option serving the area. ...`);
    });
    const response = lines.join("\n");
    const idx = indexOf(response, "Omega Services");
    expect(extractListRank(response, idx)).toBe(8);
  });
});
