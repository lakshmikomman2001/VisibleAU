import { normalizeBrandName } from "./normalize";

/**
 * S00 part 4 (22 Nov; LLD 8.8.2, UI contract P01.aliases): a brand's other names ("Also known as"). Up to 10, each
 * 2-60 characters after trimming, never the brand's own name. The API checks them on every write (POST /api/brands,
 * PATCH /api/brands/:id); brand settings checks the same rules as the owner types, with the same words.
 *
 * S01 part 0 (contract C-27, LLD section 0.2 #5): unique ignoring case -- "TECHCOREIT" next to "techcoreit" is the
 * same name to mention detection (lib/audit/detect-mention.ts ignores case and spacing). Aliases saved before S01
 * (S00 kept "techcoreit" and "TechCoreIT" both) are left as they are: a save that keeps them passes the stored list
 * as `saved`, and only a name being added is compared ignoring case.
 */
export const MAX_ALIASES = 10;
export const ALIAS_MIN_LENGTH = 2;
export const ALIAS_MAX_LENGTH = 60;
/** S01 part 0 (LLD section 0.2 #5): brands.name_suggestion is cut to this many characters when it's written. */
export const NAME_SUGGESTION_MAX_LENGTH = 120;

export type AliasCheck = { ok: true; aliases: string[] } | { ok: false; error: string };

/**
 * Why one more alias can't be added to `current` for a brand called `brandName`, or null if it can. `saved` is the
 * brand's stored list: a name already in it (as written) is kept even beside a case-only twin saved before S01.
 */
export function aliasProblem(
  alias: string,
  current: readonly string[],
  brandName: string,
  saved: readonly string[] = [],
): string | null {
  const value = normalizeBrandName(alias);
  if (value.length < ALIAS_MIN_LENGTH || value.length > ALIAS_MAX_LENGTH)
    return `A name is ${ALIAS_MIN_LENGTH} to ${ALIAS_MAX_LENGTH} characters.`;
  if (value.toLowerCase() === normalizeBrandName(brandName).toLowerCase())
    return "That's the brand's name already.";
  if (current.includes(value)) return "That name is already listed.";
  const lower = value.toLowerCase();
  if (!saved.includes(value) && current.some((c) => c.toLowerCase() === lower))
    return "That name is already listed.";
  if (current.length >= MAX_ALIASES) return `Up to ${MAX_ALIASES} names.`;
  return null;
}

/**
 * The list to store: each trimmed, every rule checked; the first problem when one fails. `saved` is the brand's
 * stored list (PATCH), empty for a new brand (POST).
 */
export function checkAliases(
  aliases: readonly string[],
  brandName: string,
  saved: readonly string[] = [],
): AliasCheck {
  const kept: string[] = [];
  for (const raw of aliases) {
    const problem = aliasProblem(raw, kept, brandName, saved);
    if (problem) return { ok: false, error: `aliases: ${problem}` };
    kept.push(normalizeBrandName(raw));
  }
  return { ok: true, aliases: kept };
}

// S01 part 0 (C-27): no aliases are suggested any more. The two S00 suggested -- the domain label ("techcoreit")
// and the name without its spaces ("TechCoreIT") -- are forms detection already matches (it checks the domain stem
// and ignores spacing), so suggesting them added nothing. Owners add genuinely different names in brand settings.
