/**
 * 16 Nov, part 3 -- the wizard's sample questions: drawn from the same templates the audit's questions come from
 * (lib/prompts/templates.ts), for the vertical the owner picked, in their suburb. It used to show the shared pack's
 * top-ranked prompts -- plumber questions ("Who are the best plumbers in Sydney CBD?") -- which confirmed brands
 * never run, and the Sydney CBD before a suburb was entered.
 */
import { type CategoryKey, getTemplatesForCategory } from "./templates";

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
};

const PREVIEW_COUNT = 5;

/** "Parramatta" for "NSW:Parramatta"; "your suburb" before one's entered. */
export function previewRegion(primaryRegion: string): string {
  return primaryRegion.replace(/^[A-Z]+:/, "").trim() || "your suburb";
}

export function wizardPreviewQuestions(vertical: string, primaryRegion: string): string[] {
  const types = PREVIEW_TYPES[vertical] ?? [];
  const region = previewRegion(primaryRegion);
  const render = (t: string) => t.replace(/\{region\}/g, region);
  if (types.length === 1) {
    return getTemplatesForCategory(types[0], "consumer", "both")
      .slice(0, PREVIEW_COUNT)
      .map(render);
  }
  return types
    .map((type) => getTemplatesForCategory(type, "smb", "businesses")[0])
    .filter((t): t is string => Boolean(t))
    .map(render);
}
