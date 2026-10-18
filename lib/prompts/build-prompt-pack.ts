import { resolveAudience } from "@/lib/brands/audience";
import { PROMPTS_PER_AUDIT } from "@/lib/llm/tier-engines";
import type { Audience, BrandClassification } from "@/lib/types/brand";
import { seededShuffle } from "./seeded-random";
import { type BuyerType, categoryLabel, getTemplatesForCategory } from "./templates";

/**
 * Vunnara Build 1, Part E: the facts the USER has actually confirmed,
 * never the classifier's raw guess -- same philosophy as Part C.6's
 * confirmedCompetitors, extended to categories and audience. Each
 * defaults to the classifier's own value only inside buildPromptPack
 * itself (categories: falls back to [classification.category];
 * audience: falls back to resolveAudience(classification)), so a
 * brand-new, not-yet-confirmed brand still gets a sensible pack.
 */
export interface ConfirmedPromptPackFacts {
  competitors: string[];
  categories: string[];
  audience?: Audience;
}

/**
 * The ten organic, customer-intent questions a brand's pack is built
 * from (Vunnara Build 1, Part E.3). Multi-category brands (confirmed.
 * categories.length > 1) draw evenly across every confirmed category
 * via round-robin, rather than favouring whichever one happens to be
 * classification.category.
 */
function buildOrganicPrompts(
  classification: BrandClassification,
  confirmedCategories: string[],
  audience: Audience,
  region: string,
): string[] {
  const categories = confirmedCategories.length > 0 ? confirmedCategories : [classification.category];
  const buyerType = classification.buyerType as BuyerType;

  const perCategoryTemplates = categories.map((cat) => {
    const templates = getTemplatesForCategory(cat, buyerType, audience);
    const label = categoryLabel(cat);
    return templates.map((p) => p.replace(/\{region\}/g, region).replace(/\{category\}/g, label));
  });

  const roundRobin: string[] = [];
  const maxLen = Math.max(0, ...perCategoryTemplates.map((t) => t.length));
  for (let i = 0; i < maxLen; i++) {
    for (const list of perCategoryTemplates) {
      if (list[i] !== undefined) roundRobin.push(list[i]);
    }
  }
  return [...new Set(roundRobin)];
}

export function buildPromptPack(
  classification: BrandClassification,
  brandName: string,
  _domain: string,
  // Vunnara Build 1, Part C.6/E: the USER-CONFIRMED facts (competitors,
  // categories, audience), never the classifier's raw, unconfirmed
  // guess -- a required param, not an optional one with a silent
  // default, so no call site can forget to pass it.
  confirmed: ConfirmedPromptPackFacts,
  region = "Australia",
  promptCount: number = PROMPTS_PER_AUDIT,
  // Vunnara Build 1, Part E.1: the pack is frozen and reused, so its
  // internal ordering must be deterministic, not Math.random() --
  // defaults to brandName only for callers/tests that don't have a
  // brand id handy; every real call site passes brand.id instead.
  seed: string = brandName,
): string[] {
  const audience = confirmed.audience ?? resolveAudience(classification);
  const categoryText = categoryLabel(classification.category);

  const organicPool = buildOrganicPrompts(classification, confirmed.categories, audience, region);
  // Vunnara Build 1, Part E.3/E.4: exactly the organic budget (10),
  // drawn deterministically -- branded prompts below are added AFTER
  // this slice, so they can never displace an organic slot.
  const organic = seededShuffle(organicPool, seed).slice(0, promptCount);

  const enriched = buildEnrichedPrompts(classification, brandName, confirmed.competitors, region, audience);

  // Vunnara Build 1, Part E.4: the one new branded template this build
  // adds, always extra, on top of the organic budget.
  const goodChoice = `Is ${brandName} a good choice for ${categoryText} in ${region}?`;

  return [...organic, goodChoice, ...enriched];
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
  region = "Australia",
  // Vunnara Build 1, Part E.6: when the caller doesn't supply an
  // audience explicitly (every existing test/call site predating this
  // change), it's derived from the classification exactly as before --
  // no behaviour change for an already-business-audience brand, but a
  // households brand (e.g. a local plumber) stops getting "...for
  // Australian businesses" phrasing it never asked for.
  audience: Audience = resolveAudience(classification),
): string[] {
  const prompts: string[] = [];
  const businessSuffix = audience === "businesses" ? "for Australian businesses" : `in ${region}`;

  for (const competitor of confirmedCompetitors.slice(0, 2)) {
    prompts.push(
      audience === "businesses"
        ? `${brandName} vs ${competitor} — which is better for Australian businesses?`
        : `${brandName} vs ${competitor} — which is better?`,
    );
  }

  prompts.push(`What are the best alternatives to ${brandName} in ${region}?`);

  for (const signal of classification.intentSignals.slice(0, 2)) {
    prompts.push(`Best ${signal} ${businessSuffix}?`);
  }

  prompts.push(`Is ${brandName} popular in ${region}?`);

  if (classification.auRelevance === "au_founded") {
    prompts.push("What Australian tech companies are leading in their space in 2025?");
  }

  return prompts;
}
