import { domainLabel } from "./name-from-domain";
import { normalizeBrandName } from "./normalize";

/**
 * S00 part 4 (22 Nov; LLD 8.8.2, UI contract P01.aliases): a brand's other names ("Also known as"). Up to 10, each
 * 2-60 characters after trimming, unique as written, never the brand's own name. The API checks them on every
 * write (POST /api/brands, PATCH /api/brands/:id); brand settings checks the same rules as the owner types, with
 * the same words.
 */
export const MAX_ALIASES = 10;
export const ALIAS_MIN_LENGTH = 2;
export const ALIAS_MAX_LENGTH = 60;

export type AliasCheck = { ok: true; aliases: string[] } | { ok: false; error: string };

/** Why one more alias can't be added to `current` for a brand called `brandName`, or null if it can. */
export function aliasProblem(
  alias: string,
  current: readonly string[],
  brandName: string,
): string | null {
  const value = normalizeBrandName(alias);
  if (value.length < ALIAS_MIN_LENGTH || value.length > ALIAS_MAX_LENGTH)
    return `A name is ${ALIAS_MIN_LENGTH} to ${ALIAS_MAX_LENGTH} characters.`;
  if (value.toLowerCase() === normalizeBrandName(brandName).toLowerCase())
    return "That's the brand's name already.";
  // Unique as written (S00 part 4's own example keeps "techcoreit" and "TechCoreIT" both; the UI contract's
  // "unique ignoring case" is proposed for amendment in the S00 report). Detection ignores case either way.
  if (current.includes(value)) return "That name is already listed.";
  if (current.length >= MAX_ALIASES) return `Up to ${MAX_ALIASES} names.`;
  return null;
}

/** The list to store: each trimmed, every rule checked; the first problem when one fails. */
export function checkAliases(aliases: readonly string[], brandName: string): AliasCheck {
  const kept: string[] = [];
  for (const raw of aliases) {
    const problem = aliasProblem(raw, kept, brandName);
    if (problem) return { ok: false, error: `aliases: ${problem}` };
    kept.push(normalizeBrandName(raw));
  }
  return { ok: true, aliases: kept };
}

/**
 * The other forms suggested as aliases when a brand is added: the domain label ("techcoreit") and the name without
 * its spaces ("TechCoreIT"), each only when it differs from the name and from the other (ignoring case for the
 * first) and is a usable alias (lib/brands/aliases.ts).
 */
export function suggestAliases(name: string, domain: string): string[] {
  const own = normalizeBrandName(name);
  const out: string[] = [];
  const add = (candidate: string) => {
    if (candidate.length < ALIAS_MIN_LENGTH || candidate.length > ALIAS_MAX_LENGTH) return;
    if (candidate === own || out.includes(candidate)) return;
    if (candidate.toLowerCase() === own.toLowerCase() && candidate.toLowerCase() === candidate)
      return;
    out.push(candidate);
  };
  const label = domainLabel(domain);
  if (label && /^[\p{L}\p{N}]+$/u.test(label)) add(label);
  const noSpaces = own.replace(/\s+/g, "");
  if (noSpaces !== own) add(noSpaces);
  return out;
}
