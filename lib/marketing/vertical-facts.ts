/**
 * 16 Nov, part 7 -- what the marketing and pack pages say about each kind of business, computed from what the product
 * really does: its business types (lib/brands/category-choices.ts), their question templates
 * (lib/prompts/templates.ts), their directories (lib/directories/registry.ts) and each plan's engines
 * (lib/llm/tier-engines.ts). The pages said "60 / 55 / 50 prompt templates" (matching nothing), "8 sub-verticals" on
 * every pack, and checks that don't exist -- licence and AHPRA verification, an ASIC NAP check, HealthEngine and
 * HotDoc presence, Xero/MYOB and STP checks, G2 and Capterra. tests/unit/marketing/no-hard-coded-counts.test.ts keeps
 * counts out of the copy.
 */
import { CATEGORIES_FOR_VERTICAL } from "@/lib/brands/category-choices";
import { getDirectoriesForBrand } from "@/lib/directories/registry";
import { PROMPTS_PER_AUDIT, TIER_ENGINES } from "@/lib/llm/tier-engines";
import {
  CATEGORY_LABELS,
  CATEGORY_TEMPLATES,
  type CategoryKey,
  LOCAL_CATEGORY_KEYS,
  SERVICE_WORD_FALLBACK,
} from "@/lib/prompts/templates";

/** The business types a vertical's brands confirm from (the confirmation card's first list). */
export function verticalTypes(vertical: string): readonly CategoryKey[] {
  return CATEGORIES_FOR_VERTICAL[vertical] ?? [];
}

/** Every distinct everyday question template across these types (each audience's included). */
export function templateCount(types: readonly CategoryKey[]): number {
  const all = new Set<string>();
  for (const type of types) {
    for (const list of Object.values(CATEGORY_TEMPLATES[type] ?? {}))
      for (const t of list ?? []) all.add(t);
  }
  return all.size;
}

/** A real template of the type, in a real place: "Best cafés in Parramatta?". */
export function exampleQuestion(type: CategoryKey, place: string): string {
  const first = Object.values(CATEGORY_TEMPLATES[type] ?? {}).flat()[0] ?? "";
  const text = first
    .replace(/\{region\}/g, place)
    .replace(/\{service\}/g, SERVICE_WORD_FALLBACK[type] ?? "");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** True when the types are local (their questions name the brand's suburb), false when they're national (software). */
function isLocal(types: readonly CategoryKey[]): boolean {
  return types.some((type) => LOCAL_CATEGORY_KEYS.includes(type));
}

/** The pack page's "what this vertical gets", every line true of the product. */
export function verticalFacts(vertical: string): string[] {
  const types = verticalTypes(vertical);
  if (types.length === 0) return [];
  const directories = getDirectoriesForBrand("au", types).map((d) => d.name);
  const local = isLocal(types);
  return [
    `Questions are written for the business type each brand confirms: ${types.map((t) => CATEGORY_LABELS[t]).join(", ")}.`,
    `${templateCount(types)} everyday question templates across those types, ${PROMPTS_PER_AUDIT} asked per audit, plus questions that name the brand.`,
    local
      ? "Everyday questions name the brand's own suburb."
      : "Everyday questions are national: software isn't found by suburb.",
    directories.length > 0
      ? `AI answers are checked for links to: ${directories.join(", ")}.`
      : "No directory list: software isn't listed in local directories.",
  ];
}

/** "Paid: 40 answers across 4 engines. Free: 20 answers across 2 engines." -- from each plan's engines. */
export function answersPerAudit(): {
  paidEngines: number;
  paidAnswers: number;
  freeEngines: number;
  freeAnswers: number;
} {
  const paidEngines = TIER_ENGINES.starter.length;
  const freeEngines = TIER_ENGINES.free.length;
  return {
    paidEngines,
    paidAnswers: paidEngines * PROMPTS_PER_AUDIT,
    freeEngines,
    freeAnswers: freeEngines * PROMPTS_PER_AUDIT,
  };
}

/** The FAQ's "What industries do you support?". */
export const INDUSTRIES_ANSWER =
  "Australian local businesses — trades, allied health clinics, cafés and restaurants, gyms, hair and beauty salons, local shops, accountants, lawyers and real estate agents — and software companies. A local business that's none of these gets questions about its own service in its own suburb.";
