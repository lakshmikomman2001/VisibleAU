/**
 * 17 Nov, part 1 (Sri's decision) -- whether a brand is a local business, for the Autopilot overview's "Local Business
 * Insights" view: its confirmed business type is local (lib/prompts/templates.ts LOCAL_CATEGORY_KEYS), or, before it's
 * confirmed, its vertical's own first type is. The overview kept its own list of words ("plumber", "dental", "cafe"
 * ...) that the vertical keys never matched -- "tradies" wasn't on it, so every tradie got the small-business view.
 */
import { CATEGORIES_FOR_VERTICAL } from "@/lib/brands/category-choices";
import { LOCAL_CATEGORY_KEYS, resolveCategory } from "@/lib/prompts/templates";

export function isLocalCategory(category: string): boolean {
  return LOCAL_CATEGORY_KEYS.includes(resolveCategory(category));
}

/** The verticals whose first business type is local: tradies, allied health, professional services, real estate, other local business. */
export function isLocalVertical(vertical: string): boolean {
  const first = CATEGORIES_FOR_VERTICAL[vertical]?.[0];
  return first !== undefined && LOCAL_CATEGORY_KEYS.includes(first);
}

export function isLocalBusiness(brand: {
  vertical: string;
  categories?: readonly string[] | null;
}): boolean {
  const categories = brand.categories ?? [];
  if (categories.length > 0) return isLocalCategory(categories[0]);
  return isLocalVertical(brand.vertical);
}
