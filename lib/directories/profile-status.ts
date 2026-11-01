/**
 * DEMO-BLOCKER (1 Nov), part 5 point 3 -- whether a directory's citations
 * included the owner's own profile can only be known when the owner has
 * confirmed a listing there WITH its profile URL (brand_directory_listings
 * status "listed" + profile_url). Without one, "none were your profile" /
 * "your profile: 0" read as checked when nothing was checked. The audit
 * page's directory card and the report PDF both word it from here.
 */

export const PROFILE_NOT_LINKED_LABEL = "Not linked yet";

/** Shown once under the directories when any cited one has no linked profile. */
export const LINK_PROFILES_HINT =
  "Add your directory listings in brand settings so we can match them.";

export type DirectoryProfileStatus =
  | { kind: "not_linked"; label: string }
  | { kind: "linked"; cited: number; label: string };

export function directoryProfileStatus(row: {
  ownerProfileLinked: boolean;
  ownerProfileCitedCount: number;
}): DirectoryProfileStatus {
  if (!row.ownerProfileLinked) return { kind: "not_linked", label: PROFILE_NOT_LINKED_LABEL };
  return {
    kind: "linked",
    cited: row.ownerProfileCitedCount,
    label: `${row.ownerProfileCitedCount} cited`,
  };
}
