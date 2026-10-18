import type { BrandClassification } from "@/lib/types/brand";
import { type BuyerType, categoryLabel, getTemplatesForCategory } from "./templates";

const DEFAULT_PROMPT_COUNT = 10;

export function buildPromptPack(
  classification: BrandClassification,
  brandName: string,
  _domain: string,
  // Vunnara Build 1, Part C.6: brands.competitors (the USER-CONFIRMED
  // list), never classification.competitors (the classifier's raw,
  // unconfirmed guess) -- a required param, not an optional one with a
  // silent [] default, so no call site can forget to pass it.
  confirmedCompetitors: string[],
  region = "Australia",
  promptCount: number = DEFAULT_PROMPT_COUNT,
): string[] {
  const categoryTemplates = getTemplatesForCategory(
    classification.category,
    classification.buyerType as BuyerType,
  );

  // Vunnara Build 1, Part C: a human label ("Plumbing"), never the raw
  // underscore_case slug -- Omega's {category} used to substitute as
  // "trades general services services" (the invalid "trades_general_
  // services" slug with underscores turned to spaces, doubling "services").
  const categoryText = categoryLabel(classification.category);
  const resolved = categoryTemplates.map((p) =>
    p
      .replace(/\{region\}/g, region)
      .replace(/\{category\}/g, categoryText)
      .replace(/\{brandName\}/g, brandName),
  );

  const enriched = buildEnrichedPrompts(classification, brandName, confirmedCompetitors);

  const categoryCount = Math.ceil(promptCount * 0.6);
  const enrichedCount = Math.floor(promptCount * 0.4);

  const mixed = [
    ...shuffle(resolved).slice(0, categoryCount),
    ...shuffle(enriched).slice(0, enrichedCount),
  ];

  const unique = [...new Set(mixed)];

  if (unique.length < promptCount) {
    const extras = resolved.filter((p) => !unique.includes(p));
    unique.push(...extras.slice(0, promptCount - unique.length));
  }

  return unique.slice(0, promptCount);
}

export function buildEnrichedPrompts(
  classification: BrandClassification,
  brandName: string,
  // Vunnara Build 1, Part C.6: defaults to [] only for callers that
  // generate prompts without any brand-level competitor data at all
  // (e.g. a brand-new brand pre-confirmation) -- buildPromptPack's own
  // call site above never relies on the default, it always passes the
  // real list explicitly.
  confirmedCompetitors: string[] = [],
): string[] {
  const prompts: string[] = [];

  for (const competitor of confirmedCompetitors.slice(0, 2)) {
    prompts.push(`${brandName} vs ${competitor} — which is better for Australian businesses?`);
  }

  prompts.push(`What are the best alternatives to ${brandName} in Australia?`);

  for (const signal of classification.intentSignals.slice(0, 2)) {
    prompts.push(`Best ${signal} for Australian businesses?`);
  }

  prompts.push(`Is ${brandName} popular in Australia?`);

  if (classification.auRelevance === "au_founded") {
    prompts.push("What Australian tech companies are leading in their space in 2025?");
  }

  return prompts;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
