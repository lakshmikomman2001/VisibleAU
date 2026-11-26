/**
 * S03 part 4: questionTextKey on its own, so the browser can load it (the add drawer checks a typed question against
 * the draft); lib/questions/hash.ts, which needs node:crypto for the set hash, re-exports it.
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
