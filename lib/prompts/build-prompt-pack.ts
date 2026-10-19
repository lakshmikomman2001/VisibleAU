import { resolveAudience } from "@/lib/brands/audience";
import { PROMPTS_PER_AUDIT } from "@/lib/llm/tier-engines";
import type { Audience, BrandClassification } from "@/lib/types/brand";
import { seededShuffle } from "./seeded-random";
import {
  type BuyerType,
  categoryLabel,
  categoryServicePhrase,
  getTemplatesForCategory,
  matchCategoryInText,
} from "./templates";
import { stripPlaceToken, validateGeneratedQuestion } from "./validate-question";

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

export interface TaggedOrganicPrompt {
  text: string;
  category: string;
}

/**
 * Vunnara hotfix 3 (19 Oct, post-9c2c73a), item 1: `n` confirmed
 * categories split `total` slots as floor(total/n) each, remainder to
 * the EARLIEST categories -- 3 categories -> 4/3/3, 2 -> 5/5, 1 -> 10.
 * This is the "weighted to the first" rule Build 1's own spec named.
 * The round-robin interleave this replaces only ever LOOKED like it
 * did this: build-prompt-pack.ts's per-category interleave was
 * immediately undone by the single whole-pool seededShuffle that ran
 * right after it, so the actual category mix a brand got was whatever
 * that shuffle happened to land on -- Omega's real pack: 3 plumbing /
 * 1 electrical / 6 general, not the intended 4/3/3.
 */
function computeCategoryQuotas(categories: string[], total: number): number[] {
  const n = categories.length;
  if (n === 0) return [];
  const base = Math.floor(total / n);
  const remainder = total - base * n;
  return categories.map((_, i) => base + (i < remainder ? 1 : 0));
}

/**
 * One category's own validated organic candidates -- its fixed
 * template list, {region}/{category} expanded and render-validated.
 * Rejects (and logs) anything malformed instead of ever shipping it,
 * falling through to the category's own next template naturally
 * (this filters the whole list, never swaps one-for-one).
 */
function categoryTemplateCandidates(
  category: string,
  buyerType: BuyerType,
  audience: Audience,
  region: string,
): string[] {
  const label = categoryLabel(category);
  return getTemplatesForCategory(category, buyerType, audience)
    .map((template) => ({
      // Vunnara hotfix 3 (19 Oct, post-9c2c73a) bugfix (found while
      // testing item 1's shortfall path, not one of the 4 listed
      // items): a country-level template (saas_design_tools,
      // legal_tech, fintech_payments, etc.) never has a {region}
      // placeholder at all -- it says "Australian businesses", the
      // adjective, never the literal word "Australia" the location
      // check looks for. requireLocation defaulting true for EVERY
      // template rejected every one of these, unconditionally --
      // every brand confirmed under one of these ~10 categories got
      // zero organic questions, only the 3 generic branded ones.
      // Only a template that actually carries {region} requires one.
      usesRegionPlaceholder: template.includes("{region}"),
      text: template.replace(/\{region\}/g, region).replace(/\{category\}/g, label),
    }))
    .filter(({ text, usesRegionPlaceholder }) => {
      const result = validateGeneratedQuestion(text, region, usesRegionPlaceholder);
      if (!result.valid) {
        console.warn(`[build-prompt-pack] rejected organic question (${result.reason}): "${text}"`);
      }
      return result.valid;
    })
    .map(({ text }) => text);
}

/**
 * Every confirmed category's validated template candidates, PLUS each
 * intent-signal-derived candidate tagged to whichever confirmed
 * category its own text is actually about (matchCategoryInText, word-
 * matched against the category alias table -- "emergency plumber
 * Norwest" -> trades_plumbing), falling back to the FIRST confirmed
 * category when no word matches (same "weighted to the first" rule
 * the allocation below uses). classification.intentSignals comes from
 * an LLM crawl and never names the brand, so these are organic, not
 * branded (confirmed by isBrandedPrompt) -- they count INSIDE their
 * matched category's quota, never on top of it.
 */
export function buildCandidatePoolsByCategory(
  classification: BrandClassification,
  categories: string[],
  buyerType: BuyerType,
  audience: Audience,
  region: string,
): Map<string, string[]> {
  const pools = new Map<string, string[]>();
  for (const cat of categories) {
    pools.set(cat, categoryTemplateCandidates(cat, buyerType, audience, region));
  }

  const businessSuffix = audience === "businesses" ? "for Australian businesses" : `in ${region}`;
  for (const signal of classification.intentSignals) {
    // Vunnara hotfix 2 (19 Oct, post-609e323): the duplicate-place bug
    // -- an intentSignal may already carry a place name baked in --
    // stripped before appending the region, so "Best {signal} in
    // {region}?" names the place once, naturally.
    const cleanedSignal = stripPlaceToken(signal, region);
    const candidate = `Best ${cleanedSignal} ${businessSuffix}?`;
    const result = validateGeneratedQuestion(candidate, region, audience !== "businesses");
    if (!result.valid) {
      console.warn(
        `[build-prompt-pack] rejected intent-signal question (${result.reason}): "${candidate}"`,
      );
      continue;
    }
    const matchedCategory = matchCategoryInText(signal, categories) ?? categories[0];
    pools.get(matchedCategory)?.push(candidate);
  }

  return pools;
}

/**
 * Vunnara hotfix 3 (19 Oct, post-9c2c73a), item 1: the organic budget,
 * split across confirmed categories by computeCategoryQuotas and
 * tagged with which category each question was drawn for (checked
 * directly in tests, not inferred from text afterwards). Each
 * category's own selection is independently seeded -- deterministic,
 * but never identical to a sibling category's shuffle.
 *
 * A category short of its quota (after validation rejected some of
 * its own candidates) carries the deficit FORWARD to the next
 * category in line, logged -- never silently ships fewer questions
 * than the combined pool actually has available. If the deficit is
 * still unmet after the last category, the combined valid pool across
 * every confirmed category is genuinely under `total`; logged, and
 * the pack ships with fewer than `total` organic questions rather
 * than ever fabricating one to hit the count.
 */
export function buildTaggedOrganicPrompts(
  classification: BrandClassification,
  confirmedCategories: string[],
  audience: Audience,
  region: string,
  total: number,
  seed: string,
): TaggedOrganicPrompt[] {
  const categories = confirmedCategories.length > 0 ? confirmedCategories : [classification.category];
  const buyerType = classification.buyerType as BuyerType;
  const quotas = computeCategoryQuotas(categories, total);
  const pools = buildCandidatePoolsByCategory(classification, categories, buyerType, audience, region);

  const tagged: TaggedOrganicPrompt[] = [];
  let carryDeficit = 0;
  for (let i = 0; i < categories.length; i++) {
    const category = categories[i];
    const need = quotas[i] + carryDeficit;
    carryDeficit = 0;
    const pool = seededShuffle(pools.get(category) ?? [], `${seed}-${category}`);
    const taken = pool.slice(0, need);
    for (const text of taken) tagged.push({ text, category });
    if (taken.length < need) {
      carryDeficit = need - taken.length;
      console.warn(
        `[build-prompt-pack] category "${category}" has only ${taken.length} valid organic ` +
          `question(s), ${carryDeficit} short of its quota -- refilling from the next category`,
      );
    }
  }
  if (carryDeficit > 0) {
    console.warn(
      `[build-prompt-pack] combined valid organic pool across every confirmed category is ` +
        `${carryDeficit} short of ${total} -- this pack will ship with fewer than ${total} organic questions`,
    );
  }

  return tagged;
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
  // Vunnara hotfix 3 (19 Oct, post-9c2c73a), item 3: a natural service
  // phrase ("a plumber"), never the raw CATEGORY_LABELS value mid-
  // sentence ("...a good choice for Plumbing in..."). Read from the
  // SAME category metadata (lib/prompts/templates.ts) the organic
  // templates use -- never built ad hoc here. Same "confirmed category
  // wins, classifier's guess only while unconfirmed" rule as the
  // organic budget below.
  const servicePhrase = categoryServicePhrase(confirmed.categories[0] ?? classification.category);

  const taggedOrganic = buildTaggedOrganicPrompts(
    classification,
    confirmed.categories,
    audience,
    region,
    promptCount,
    seed,
  );
  const organic = taggedOrganic.map((t) => t.text);

  const enriched = buildEnrichedPrompts(classification, brandName, confirmed.competitors, region, audience);

  // Vunnara Build 1, Part E.4: the one new branded template this build
  // adds, always extra, on top of the organic budget.
  const goodChoice = `Is ${brandName} a good choice for ${servicePhrase} in ${region}?`;

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

  for (const competitor of confirmedCompetitors.slice(0, 2)) {
    prompts.push(
      audience === "businesses"
        ? `${brandName} vs ${competitor} — which is better for Australian businesses?`
        : `${brandName} vs ${competitor} — which is better?`,
    );
  }

  prompts.push(`What are the best alternatives to ${brandName} in ${region}?`);

  // Vunnara hotfix 2 (19 Oct, post-609e323), item 3: the intent-signal-
  // derived prompts moved to buildCandidatePoolsByCategory above --
  // they never name the brand (confirmed by isBrandedPrompt), so
  // they're organic, not an "enriched"/branded prompt, and now count
  // against the organic budget (tagged per category, hotfix 3) instead
  // of bypassing it from here.

  prompts.push(`Is ${brandName} popular in ${region}?`);

  if (classification.auRelevance === "au_founded") {
    prompts.push("What Australian tech companies are leading in their space in 2025?");
  }

  return prompts;
}
