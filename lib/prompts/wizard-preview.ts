/**
 * 16 Nov, part 3 -- the wizard's sample questions: drawn from the same templates the audit's questions come from
 * (lib/prompts/templates.ts), for the vertical the owner picked, in their suburb. It used to show the shared pack's
 * top-ranked prompts -- plumber questions ("Who are the best plumbers in Sydney CBD?") -- which confirmed brands
 * never run, and the Sydney CBD before a suburb was entered.
 *
 * 16 Nov, part 4 -- "Other local business": one question from each common local type, as examples (the owner's own
 * type is confirmed after the wizard, and its questions are written then).
 */
import { type CategoryKey, getTemplatesForCategory, SERVICE_WORD_FALLBACK } from "./templates";

/** The types whose questions stand for a vertical in the preview, one sample question each where there are several. */
const PREVIEW_TYPES: Record<string, readonly CategoryKey[]> = {
  tradies: ["trades_general"],
  allied_health: ["allied_health_general"],
  saas: [
    "crm_software",
    "project_management",
    "accounting_software",
    "marketing_automation",
    "hr_software",
  ],
  professional_services: ["legal_services"],
  real_estate: ["real_estate_agency"],
  local_business: ["cafe", "fitness_gym", "beauty_salon", "retail_shop", "accounting_practice"],
};

/** The verticals whose preview is one question per type, as examples rather than the owner's own questions. */
export const PREVIEW_IS_EXAMPLES: readonly string[] = ["saas", "local_business"];

const PREVIEW_COUNT = 5;

/** "Parramatta" for "NSW:Parramatta"; "your suburb" before one's entered. */
export function previewRegion(primaryRegion: string): string {
  return primaryRegion.replace(/^[A-Z]+:/, "").trim() || "your suburb";
}

export function wizardPreviewQuestions(vertical: string, primaryRegion: string): string[] {
  const types = PREVIEW_TYPES[vertical] ?? [];
  const region = previewRegion(primaryRegion);
  const render = (type: CategoryKey) => (t: string) => {
    const text = t
      .replace(/\{region\}/g, region)
      .replace(/\{service\}/g, SERVICE_WORD_FALLBACK[type] ?? "");
    return text.charAt(0).toUpperCase() + text.slice(1);
  };
  if (types.length === 1) {
    return getTemplatesForCategory(types[0], "consumer", "both")
      .slice(0, PREVIEW_COUNT)
      .map(render(types[0]));
  }
  return types
    .map((type) => {
      const first = getTemplatesForCategory(type, "smb", "businesses")[0];
      return first ? render(type)(first) : null;
    })
    .filter((t): t is string => Boolean(t));
}
