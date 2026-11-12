import { CATEGORY_KEYS, type CategoryKey } from "@/lib/prompts/templates";

/**
 * 13 Nov (Sri's walk-through, part 1): a Tradies brand was offered Design software, HR software, CRM
 * software... first. The confirmation panel shows the brand's own vertical's business types first and the
 * rest behind "Other types".
 */
export const CATEGORIES_FOR_VERTICAL: Record<string, readonly CategoryKey[]> = {
  tradies: ["trades_plumbing", "trades_electrical", "trades_building", "trades_general"],
  allied_health: [
    "allied_health_dental",
    "allied_health_physio",
    "allied_health_mental",
    "allied_health_general",
  ],
  saas: [
    "saas_design_tools",
    "accounting_software",
    "crm_software",
    "project_management",
    "hr_software",
    "helpdesk_software",
    "marketing_automation",
    "ecommerce_platform",
    "legal_tech",
    "fintech_payments",
    "education_online",
  ],
  professional_services: ["legal_services", "fintech_payments", "education_online"],
  real_estate: ["real_estate_agency"],
};

/**
 * The panel's two lists: `first` is the vertical's types, with any already-selected type that isn't one of
 * them added in front (a suggestion or a confirmed choice is never hidden behind "Other types"); `others`
 * is every other type, in the catalogue's order. A vertical with no list shows them all first.
 */
export function categoryChoices(
  vertical: string | null | undefined,
  selected: readonly string[],
): { first: CategoryKey[]; others: CategoryKey[] } {
  const own = vertical ? CATEGORIES_FOR_VERTICAL[vertical] : undefined;
  if (!own) return { first: [...CATEGORY_KEYS], others: [] };
  const picked = CATEGORY_KEYS.filter((k) => selected.includes(k) && !own.includes(k));
  const first = [...picked, ...own];
  return { first, others: CATEGORY_KEYS.filter((k) => !first.includes(k)) };
}
