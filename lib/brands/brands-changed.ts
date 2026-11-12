/**
 * 13 Nov (part 2): the top bar's brand switcher loads the workspace's brand list itself (/api/brands) and
 * reloads it when the shell's brand count changes; a rename doesn't change the count, so after Sri renamed
 * "herohomeservices" the switcher kept the old name until a full reload. A page that renames or otherwise
 * edits a brand dispatches this window event after the save, and the switcher reloads its list.
 */
export const BRANDS_CHANGED_EVENT = "visibleau:brands-changed";
