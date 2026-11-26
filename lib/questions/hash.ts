import { createHash } from "node:crypto";

/**
 * S02 part 1 (LLD 7.1, N2): the question set hash in TypeScript, the same as SQL's -- audits.question_set_hash
 * (lib/audit/question-set-sql.ts questionSetHashSql) and brand_question_sets.comparison_hash (migration 0155):
 * the SHA-256 (hex) of the DISTINCT compared texts (questionTextKey) of the everyday questions, sorted bytewise
 * (COLLATE "C", so by their UTF-8 bytes) and joined with a newline. No everyday question: null, as SQL's string_agg
 * over no rows gives.
 *
 * tests/unit/questions/hash.test.ts checks it against the 0150/0152 fixtures and tests/integration/question-hash-
 * parity.integration.test.ts against Postgres's own hashes of real audits.
 */

/**
 * Migration 0152's question_text_key(), character for character: lower case; every ASCII punctuation mark, the en
 * and em dashes, curly quotes, ellipsis, minus, hyphen, non-breaking hyphen and no-break space turned into a space;
 * runs of white space made one space; trimmed.
 */
const PUNCTUATION = new Set([
  ..."!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~",
  "–",
  "—",
  "‘",
  "’",
  "“",
  "”",
  "…",
  "−",
  "‐",
  "‑",
  " ",
]);

export function questionTextKey(question: string): string {
  let out = "";
  for (const ch of question.toLowerCase()) out += PUNCTUATION.has(ch) ? " " : ch;
  return out.replace(/\s+/g, " ").replace(/^ +| +$/g, "");
}

/** Bytewise, as COLLATE "C" sorts UTF-8 text (UTF-16 code-unit order differs above U+FFFF). */
function compareBytes(a: string, b: string): number {
  return Buffer.compare(Buffer.from(a, "utf8"), Buffer.from(b, "utf8"));
}

/** The hash of a set's everyday questions (their texts; branded ones are never part of it). */
export function computeQuestionSetHash(everydayQuestions: readonly string[]): string | null {
  const keys = [...new Set(everydayQuestions.map(questionTextKey))].sort(compareBytes);
  if (keys.length === 0) return null;
  return createHash("sha256").update(keys.join("\n"), "utf8").digest("hex");
}
