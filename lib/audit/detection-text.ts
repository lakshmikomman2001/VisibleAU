/**
 * "Mention detection" (6 Nov), part 4 -- the copy of an answer that brand-name detection reads. The answer is
 * stored exactly as the engine wrote it; only this copy is normalised, so a name written with formatting or
 * invisible characters inside or around it still matches lib/brands/normalize.ts's brandNamePattern:
 *   1. Unicode NFKC: full-width letters ("Ｏｍｅｇａ") fold to plain ones, as the brand's own stored name
 *      is folded (normalizeBrandName).
 *   2. Zero-width characters (U+200B-U+200D, U+2060, U+FEFF) and soft hyphens (U+00AD) are removed.
 *   3. Hyphen variants (U+2010-U+2012; NFKC already folds the non-breaking hyphen U+2011 to U+2010) become
 *      "-", which the name pattern already allows between words.
 *   4. "_" becomes a space: "Omega_Services", and _italic_ markers.
 *   5. Markdown emphasis, code and link markers (* ` [ ]) are removed where they sit between a letter or
 *      digit and a space or either end of the text: "**Omega** Services" becomes "Omega Services". A
 *      marker between two letters stays, and so does a list bullet (followed by a space, not a letter).
 * "Letter or digit" and "space" are ASCII here ([A-Za-z0-9] and space, tab, LF, VT, FF, CR): the same
 * letters the name pattern's own boundaries use, and classes PostgreSQL reads the same way in diag-0122's
 * copy of this (detectionTextSql; tests/unit/audit/detection-text.test.ts checks the file carries it).
 *
 * lib/audit/verify-mention.ts reads this same copy, so a match's position means the same thing to both.
 */
const REMOVED = ["​", "‌", "‍", "⁠", "﻿", "­"];
const HYPHENS = ["‐", "‑", "‒"];
const SPACE_CODES = [32, 9, 10, 11, 12, 13];
/** A regex class body: the markers, escaped the same way for JavaScript and PostgreSQL. */
const MARKERS = "*`\\[\\]";
const WORD = "A-Za-z0-9";

const SPACE = String.fromCharCode(...SPACE_CODES);
const REMOVED_RE = new RegExp(`[${REMOVED.join("")}]`, "g");
const HYPHENS_RE = new RegExp(`[${HYPHENS.join("")}]`, "g");
const OPENING_MARKERS = new RegExp(`(^|[${SPACE}])[${MARKERS}]+(?=[${WORD}])`, "g");
const CLOSING_MARKERS = new RegExp(`([${WORD}])[${MARKERS}]+(?=[${SPACE}]|$)`, "g");

export function detectionText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(REMOVED_RE, "")
    .replace(HYPHENS_RE, "-")
    .replace(/_/g, " ")
    .replace(OPENING_MARKERS, "$1")
    .replace(CLOSING_MARKERS, "$1");
}

const chrList = (chars: string[]) => chars.map((c) => `chr(${c.codePointAt(0)})`).join(" || ");

/**
 * The same steps as PostgreSQL, for diag-0122's copy of the detector. The SQL file can't import this (it's
 * pasted into the Neon editor): tests/unit/audit/detection-text.test.ts checks the file carries exactly this
 * text, and tests/integration/detection-text-sql.integration.test.ts that Postgres gives what
 * detectionText() gives.
 */
export function detectionTextSql(column: string): string {
  const space = `[' || ${SPACE_CODES.map((code) => `chr(${code})`).join(" || ")} || ']`;
  const removed = `translate(normalize(${column}, NFKC), ${chrList(REMOVED)}, '')`;
  const hyphens = `translate(${removed}, ${chrList(HYPHENS)}, '${"-".repeat(HYPHENS.length)}')`;
  const underscores = `translate(${hyphens}, '_', ' ')`;
  const opening = `regexp_replace(${underscores}, '(^|${space})[${MARKERS}]+(?=[${WORD}])', '\\1', 'g')`;
  return `regexp_replace(${opening}, '([${WORD}])[${MARKERS}]+(?=${space}|$)', '\\1', 'g')`;
}
