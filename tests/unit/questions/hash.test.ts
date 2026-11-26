/**
 * S02 part 1 (LLD 7.1, N2): computeQuestionSetHash() reproduces SQL's question set hash -- the SHA-256 (hex) of the
 * DISTINCT question_text_key() of the everyday questions, sorted COLLATE "C" and joined with a newline -- on migration
 * 0152's own cases (punctuation, dashes, case and spacing aren't a change of question; a changed word is) and the
 * 0150/0152 audit fixtures (tests/helpers/report-fixture.ts's questions, with and without the off-topic one).
 * tests/integration/question-hash-parity.integration.test.ts compares it with Postgres itself.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { computeQuestionSetHash, questionTextKey } from "@/lib/questions/hash";
import { EVERYDAY_QUESTIONS } from "@/tests/helpers/report-fixture";

const OFF_TOPIC = "What Australian tech companies are leading in their space in 2025?";

describe("questionTextKey (migration 0152's question_text_key)", () => {
  it("migration 0152's cases: dashes, quotes, case and spacing are the same question; a changed word isn't", () => {
    expect(questionTextKey("Who is a reliable plumber -- near Galah?")).toBe(
      questionTextKey("who is a reliable plumber — near Galah"),
    );
    expect(questionTextKey("I need someone to fix a leaking gutter, who should I call?")).toBe(
      questionTextKey("I need  someone to fix a leaking gutter — who should I call"),
    );
    expect(questionTextKey("Best handyman in Castle Hill")).not.toBe(
      questionTextKey("Best handymen in Castle Hill"),
    );
  });

  it("every character 0152 turns into a space, and nothing else", () => {
    const marks = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~–—‘’“”…−‐‑ ";
    expect(marks).toHaveLength(43);
    for (const mark of marks)
      expect(questionTextKey(`a${mark}b`), JSON.stringify(mark)).toBe("a b");
    expect(questionTextKey("Café near Wren's? Open 24/7")).toBe("café near wren s open 24 7");
  });

  it("white space of any kind collapses to one space and the ends are trimmed", () => {
    expect(questionTextKey("  Who\tfixes\n\nroofs  ")).toBe("who fixes roofs");
  });
});

describe("computeQuestionSetHash", () => {
  /** The 0150/0152 test's own formula, written out (tests/integration/question-set.integration.test.tsx). */
  const reference = (questions: readonly string[]) =>
    createHash("sha256")
      .update([...new Set(questions.map(questionTextKey))].sort().join("\n"), "utf8")
      .digest("hex");

  it("the 0150/0152 fixtures: the pack with the off-topic question, and without it", () => {
    const v3 = [...EVERYDAY_QUESTIONS, OFF_TOPIC];
    const v4 = [...EVERYDAY_QUESTIONS];
    expect(computeQuestionSetHash(v3)).toBe(reference(v3));
    expect(computeQuestionSetHash(v4)).toBe(reference(v4));
    expect(computeQuestionSetHash(v3)).not.toBe(computeQuestionSetHash(v4));
    expect(computeQuestionSetHash(v4)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("order, repeats and punctuation-only changes don't change it", () => {
    const qs = [...EVERYDAY_QUESTIONS];
    const restyled = [...qs].reverse().map((q) => q.toUpperCase().replace(/\?/g, " —!"));
    expect(computeQuestionSetHash([...restyled, restyled[0]])).toBe(computeQuestionSetHash(qs));
  });

  it('sorts by UTF-8 bytes, as COLLATE "C" does, not by UTF-16 code units', () => {
    const fullwidth = "～ wave";
    const emoji = "\u{1f600} smile";
    // UTF-16 puts the emoji (a surrogate pair, 0xD83D...) first; UTF-8 bytes put it last (0xF0 > 0xEF).
    expect([fullwidth, emoji].sort()).toEqual([emoji, fullwidth]);
    const expected = createHash("sha256").update(`${fullwidth}\n${emoji}`, "utf8").digest("hex");
    expect(computeQuestionSetHash([emoji, fullwidth])).toBe(expected);
  });

  it("no everyday question: null, as SQL's string_agg over no rows", () => {
    expect(computeQuestionSetHash([])).toBeNull();
  });
});
