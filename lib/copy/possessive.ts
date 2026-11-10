/**
 * Follow-ups from af8de42..d1eb5a1 (10 Nov), part 4 (Sri: the Trust page read "Omega Services's Trust Score") --
 * the one way a brand's, workspace's or competitor's name is made possessive. A name ending in "s" takes only
 * an apostrophe ("Omega Services' Trust Score"); any other takes "'s" ("Acme's Trust Score"). Every
 * `${name}'s` after an interpolated name goes through here (tests/unit/copy/possessive.test.ts scans for one).
 */
export function possessive(name: string): string {
  const trimmed = name.trimEnd();
  return /s$/i.test(trimmed) ? `${trimmed}'` : `${trimmed}'s`;
}
