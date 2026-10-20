/**
 * Vunnara (20 Oct, post-a093ceb) -- "Position is not a list rank" fix.
 * detectBrandMention's old position (lib/audit/detect-mention.ts) counted
 * capitalised word groups before the match -- a word-count heuristic that
 * has nothing to do with WHERE a brand sits in a numbered or bulleted
 * list. Production evidence (audit #30, Omega Services): ChatGPT listed
 * Omega 4th, stored as 33; 8th, stored as 53. Perplexity's first bullet
 * was stored as 4. This function replaces that heuristic with a real
 * read of the list structure around the match.
 *
 * Deliberately conservative: only a line that itself STARTS with a
 * recognised list marker (a number + "." / ")" / ":" , or a bullet
 * character) counts as "in a list" -- a wrapped continuation line with
 * no marker of its own, or a mention inside ordinary prose, returns
 * null ("mentioned but not ranked") rather than guessing. Under-ranking
 * a real list item is a far smaller error than fabricating a rank for
 * prose, which is the exact failure this replaces.
 *
 * Vunnara (21 Oct, addendum) -- "4 of 6 listed" on live audit #30:
 * ChatGPT numbers its lists in markdown bold ("**4. Omega Services**"),
 * which none of the patterns above matched at all (no bold marker in
 * the character class) -- both ChatGPT ranks silently came back null,
 * understating the real median. stripLeadingMarkdownDecoration peels
 * off a leading heading prefix ("### 4. Name" -> "4. Name") and/or a
 * leading double bold/italic marker ("**4. Name**" -> "4. Name**",
 * "**4.** Name" -> "4.** Name") before the line is tested -- trailing
 * decoration never matters, since every pattern only looks at the
 * START of the line. Deliberately only a DOUBLE marker (** or __),
 * never a single "*"/"_", which would otherwise eat a genuine
 * "*"-bulleted line's own marker (BULLET_LINE's char class includes
 * "*"). HASH_NUMBERED_LINE is a distinct pattern, not a fallback of
 * NUMBERED_LINE's punctuation: "#4 Name" has no "." / ")" / ":" at all
 * between the digit and the name, so it needs its own rule -- and it's
 * unambiguous against a markdown HEADING ("### 4 Name") because a
 * heading always has a space between the hashes and what follows,
 * while this rank marker never does ("#4", not "# 4").
 */

const NUMBERED_LINE = /^\s*(\d+)[.):][*_]{0,2}\s+\S/;
const HASH_NUMBERED_LINE = /^\s*#(\d+)[*_]{0,2}\s+\S/;
const BULLET_LINE = /^\s*[-*•]\s+\S/;

function stripLeadingMarkdownDecoration(line: string): string {
  const withoutHeading = line.replace(/^\s*#{1,6}\s+/, "");
  return withoutHeading.replace(/^\s*(\*\*|__)/, "");
}

/**
 * `matchIndex` is the character offset of the brand match within
 * `response` (from `RegExp.exec`/`matchAll`'s own `.index`). Returns the
 * 1-based rank of the list item containing that offset, or `null` when
 * the match isn't on a line that itself opens with a list marker.
 */
export function extractListRank(response: string, matchIndex: number): number | null {
  const lines = response.split(/\r?\n/);

  let offset = 0;
  let matchLineIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const lineStart = offset;
    const lineEnd = lineStart + lines[i].length;
    if (matchIndex >= lineStart && matchIndex <= lineEnd) {
      matchLineIdx = i;
      break;
    }
    offset = lineEnd + 1; // +1 for the stripped newline
  }
  if (matchLineIdx === -1) return null;

  const matchedLine = stripLeadingMarkdownDecoration(lines[matchLineIdx]);

  const numbered = matchedLine.match(NUMBERED_LINE) ?? matchedLine.match(HASH_NUMBERED_LINE);
  if (numbered) {
    // The list's own number is the rank, directly -- exact, not a count.
    // Never "reset" by anything above it (a "---" divider, a blank
    // line, an unrelated paragraph) -- there is nothing to reset: this
    // branch never looks at any other line.
    return Number(numbered[1]);
  }

  if (BULLET_LINE.test(matchedLine)) {
    // Walk backward through the contiguous run of bullet lines
    // immediately above the match to find this bullet's position
    // within its own list (1-based). A blank line inside the run is
    // tolerated (doesn't break it); a "---" divider is NOT -- treated
    // the same as any other real content line, ending the run. No
    // production example needs a bulleted list to survive a divider
    // (only ChatGPT's EXPLICITLY NUMBERED items do, which read their
    // own number directly above and never reach this branch at all),
    // so this stays the existing, narrower rule rather than guessing
    // at a case with no real evidence behind it.
    let rank = 1;
    for (let i = matchLineIdx - 1; i >= 0; i--) {
      const above = stripLeadingMarkdownDecoration(lines[i]);
      if (BULLET_LINE.test(above)) {
        rank++;
      } else if (lines[i].trim() === "") {
        continue; // a blank line inside a list doesn't break the run
      } else {
        break;
      }
    }
    return rank;
  }

  return null;
}
