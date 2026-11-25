// Written by triggers.ts for new items and shown by confidence-labels.ts for stored ones.

// No Wikipedia or Wikidata in the title: Wikidata has its own notability bar a local trade may not meet.
// 16 Nov, part 3: the title reaches every business type (stored items are shown with it too, confidence-labels.ts).
// S01C part 2c (LLD amendment 61): the item says only the Wikipedia check's result and the next step. It was
// "Strengthen your business profiles on Google, directories and local press" with a seven-line paragraph whose
// Google Business Profile and directory steps repeated the findings and rule j.
export const ENTITY_PROFILES_TITLE = "Get covered in local press or on community sites";

// Nothing measures that a missing Google, directory or press profile costs AI visibility.
export const ENTITY_PROFILES_IMPACT = "low";

/** Why not Wikipedia, in plain words (no dashes as punctuation). */
const NOTABILITY = "Wikipedia needs significant coverage in independent sources";

const NEXT_STEP = "Coverage in local press or on community sites is the step that helps.";

/**
 * Opens with what the Wikipedia check found: "verified" checked, "inferred" didn't complete, else unknown. The
 * directories parameter is no longer read (the steps that named them are gone); callers still pass them.
 */
export function entityProfilesAction(
  confidenceBasis: string | null | undefined,
  _citedDirectories?: readonly string[],
): string {
  if (confidenceBasis === "verified") {
    return `We checked: there's no Wikipedia article for your business. That's normal for a local business: ${NOTABILITY}, so we don't recommend writing one yet. ${NEXT_STEP}`;
  }
  if (confidenceBasis === "inferred") {
    return `We couldn't check Wikipedia this audit. For most local businesses Wikipedia isn't the realistic route: ${NOTABILITY}. ${NEXT_STEP}`;
  }
  return `For most local businesses Wikipedia isn't the realistic route: ${NOTABILITY}. ${NEXT_STEP}`;
}
