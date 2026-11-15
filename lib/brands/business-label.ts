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
