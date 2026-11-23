import { abnCheckDigitsValid } from "@/lib/product";

/**
 * S01 part 11 (LLD 8.8.6, amendment 25; contract P01.abnField): the brand's ABN as typed in brand settings. Spaces
 * as typed are fine and the digits are saved; empty means no ABN; anything else must be 11 digits that pass the
 * ATO's check (lib/product.ts abnCheckDigitsValid, the same check the business's own ABN uses). The same rule runs in
 * the browser (as the user types) and on the server (PATCH /api/brands/:id).
 */
export const ABN_NEEDS_DIGITS = "Enter the 11 digits of an ABN.";
export const ABN_INVALID = "This isn't a valid ABN. Check the digits.";

export function normaliseAbnInput(
  input: string,
): { ok: true; abn: string | null } | { ok: false; error: string } {
  const digits = input.replace(/\s/g, "");
  if (digits === "") return { ok: true, abn: null };
  if (!/^\d{11}$/.test(digits)) return { ok: false, error: ABN_NEEDS_DIGITS };
  if (!abnCheckDigitsValid(digits)) return { ok: false, error: ABN_INVALID };
  return { ok: true, abn: digits };
}

/** "17 701 710 947": how an ABN is written. */
export function formatAbn(abn: string): string {
  const d = abn.replace(/\s/g, "");
  return d.length === 11 ? `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}` : abn;
}
