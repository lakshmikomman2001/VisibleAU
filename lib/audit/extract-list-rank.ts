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
 */

const NUMBERED_LINE = /^\s*(\d+)[.):]\s+\S/;
const BULLET_LINE = /^\s*[-*•]\s+\S/;

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

  const matchedLine = lines[matchLineIdx];

  const numbered = matchedLine.match(NUMBERED_LINE);
  if (numbered) {
    // The list's own number is the rank, directly -- exact, not a count.
    return Number(numbered[1]);
  }

  if (BULLET_LINE.test(matchedLine)) {
    // Walk backward through the contiguous run of bullet lines
    // immediately above the match to find this bullet's position
    // within its own list (1-based).
    let rank = 1;
    for (let i = matchLineIdx - 1; i >= 0; i--) {
      if (BULLET_LINE.test(lines[i])) {
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
