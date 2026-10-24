// Written by triggers.ts for new items and shown by confidence-labels.ts for stored ones.

// No Wikipedia or Wikidata in the title: Wikidata has its own notability bar a local trade may not meet.
export const ENTITY_PROFILES_TITLE =
  "Strengthen your business profiles on Google, trade directories and local press";

// Nothing measures that a missing Google, directory or press profile costs AI visibility.
export const ENTITY_PROFILES_IMPACT = "low";

const NCORP_SUMMARY =
  "Wikipedia only accepts company articles backed by significant coverage in multiple independent, reliable sources, including at least one regional or national outlet — local coverage on its own usually isn't enough";

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Names only directories AI cited in this audit, most-cited first, and none when it cited none. */
export function entityProfilesSteps(citedDirectories: readonly string[]): string {
  const directories =
    citedDirectories.length > 0
      ? `claim or complete your profiles on the directories AI cited in this audit — ${joinNames(citedDirectories)} — with the same business name, address and phone number as your website`
      : "claim or complete your profiles on the directories your customers use, with the same business name, address and phone number as your website";
  return `(1) complete your Google Business Profile — categories, service areas, hours and photos — and keep it current; (2) ${directories}; (3) get your business covered in local press or on community sites.`;
}

/** Opens with what the Wikipedia check found: "verified" checked, "inferred" didn't complete, else unknown. */
export function entityProfilesAction(
  confidenceBasis: string | null | undefined,
  citedDirectories: readonly string[],
): string {
  const why =
    confidenceBasis === "verified"
      ? `We checked: there's no Wikipedia article for your business. That's normal for a local business — ${NCORP_SUMMARY}, so we don't recommend writing one yet.`
      : confidenceBasis === "inferred"
        ? `We couldn't check Wikipedia this audit. For most local businesses Wikipedia isn't the realistic route — ${NCORP_SUMMARY}.`
        : `For most local businesses Wikipedia isn't the realistic route — ${NCORP_SUMMARY}.`;
  return `${why} Instead: ${entityProfilesSteps(citedDirectories)}`;
}
