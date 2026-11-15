/**
 * 16 Nov, part 3 -- what the brand page's header says the business is: its confirmed business type(s) ("Café",
 * "Café · Local shop"), and only until it's confirmed, its vertical in words ("Tradies") -- never the raw vertical
 * key ("tradies", "allied_health"), which every non-tradie business used to see as "tradies".
 */
import { categoryLabel } from "@/lib/prompts/templates";

export const VERTICAL_LABELS: Record<string, string> = {
  tradies: "Tradies",
  allied_health: "Allied health",
  saas: "SaaS / software",
  professional_services: "Professional services",
  real_estate: "Real estate",
  local_business: "Other local business",
};

/**
 * Leftovers task, part 4 (17 Nov): the brands list's "Business" pill -- at most two business types and "+N" for the
 * rest, so it stays on one line beside the Region column ("Plumbing · Electrical · General trades" wrapped onto two);
 * `full` is every type, for the tooltip (null when nothing is left out).
 */
export function brandBusinessPill(brand: {
  vertical: string;
  categories?: readonly string[] | null;
  categoryConfirmedAt?: string | Date | null;
}): { label: string; full: string | null } {
  const categories = brand.categories ?? [];
  if (!brand.categoryConfirmedAt || categories.length === 0) {
    return { label: brandBusinessLabel(brand), full: null };
  }
  const types = [...new Set(categories.map(categoryLabel))];
  if (types.length <= 2) return { label: types.join(" · "), full: null };
  return {
    label: `${types.slice(0, 2).join(" · ")} +${types.length - 2}`,
    full: types.join(" · "),
  };
}

export function brandBusinessLabel(brand: {
  vertical: string;
  categories?: readonly string[] | null;
  categoryConfirmedAt?: string | Date | null;
}): string {
  const categories = brand.categories ?? [];
  if (brand.categoryConfirmedAt && categories.length > 0) {
    return [...new Set(categories.map(categoryLabel))].join(" · ");
  }
  return VERTICAL_LABELS[brand.vertical] ?? brand.vertical;
}
