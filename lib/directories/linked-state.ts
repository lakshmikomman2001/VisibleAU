/**
 * 14 Nov, part 2 (Sri's review of audit #48): Hero Home Services had Localsearch linked (the PDF's card said "2
 * of 50 ... 8 of the directories aren't linked yet"), while the summary said "we can't yet see whether any of those
 * citations were Hero Home Services' own listings: the profile links haven't been added" and finding 1 said "your
 * profile links aren't added yet". Both judged from the directories with a gap only, which leave out a linked one
 * whose own profile was cited. Every such sentence now comes from here, from every cited directory's linked state.
 */
export interface LinkedStateRow {
  name: string;
  /** Answers citing the directory. */
  citedCount: number;
  ownerProfileLinked: boolean;
  /** Of those, the answers citing the owner's own profile page (0 when not linked). */
  ownerProfileCitedCount: number;
}

function plural(n: number, one: string, many = `${one}s`): string {
  return n === 1 ? one : many;
}

/** One linked directory: "Localsearch is linked: 2 of its 10 citations were your own profile." */
function linkedSentence(r: LinkedStateRow): string {
  const of = `${r.citedCount} ${plural(r.citedCount, "citation")}`;
  if (r.ownerProfileCitedCount === 0) {
    return `${r.name} is linked: none of its ${of} ${r.citedCount === 1 ? "was" : "were"} your own profile.`;
  }
  return `${r.name} is linked: ${r.ownerProfileCitedCount} of its ${of} ${r.ownerProfileCitedCount === 1 ? "was" : "were"} your own profile.`;
}

/**
 * What we can and can't see about the owner's own listings among the directories AI cited:
 * - none linked: "None of your directory profiles are linked yet, so we can't tell whether any of these citations
 *   were your own listings." (one directory: "Your Localsearch profile isn't linked yet, ...");
 * - some linked: each linked one's count, then "8 directories aren't linked yet, so we can't tell for those.";
 * - all linked: each linked one's count.
 * Null when no directory was cited.
 */
export function linkedStateSentence(cited: readonly LinkedStateRow[]): string | null {
  if (cited.length === 0) return null;
  const linked = cited.filter((r) => r.ownerProfileLinked);
  if (linked.length === 0) {
    return cited.length === 1
      ? `Your ${cited[0].name} profile isn't linked yet, so we can't tell whether its citations were your own listing.`
      : "None of your directory profiles are linked yet, so we can't tell whether any of these citations were your own listings.";
  }
  const unlinked = cited.length - linked.length;
  const rest =
    unlinked === 0
      ? ""
      : unlinked === 1
        ? " 1 directory isn't linked yet, so we can't tell for it."
        : ` ${unlinked} directories aren't linked yet, so we can't tell for those.`;
  return `${linked.map(linkedSentence).join(" ")}${rest}`;
}
