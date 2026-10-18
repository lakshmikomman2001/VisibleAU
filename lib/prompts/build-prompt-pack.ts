import { resolveAudience } from "@/lib/brands/audience";
import { PROMPTS_PER_AUDIT } from "@/lib/llm/tier-engines";
import type { Audience, BrandClassification } from "@/lib/types/brand";
import { seededShuffle } from "./seeded-random";
import { type BuyerType, categoryLabel, getTemplatesForCategory } from "./templates";
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
    return templates
      .map((p) => p.replace(/\{region\}/g, region).replace(/\{category\}/g, label))
      // Vunnara hotfix 2 (19 Oct, post-609e323): render-time validation
      // over every generated question -- rejects (and logs) anything
      // malformed instead of ever shipping it, falling through to the
      // category's NEXT template in the list naturally (this is a
      // filter over the whole list, not a one-for-one swap).
      .filter((text) => {
        const result = validateGeneratedQuestion(text, region);
        if (!result.valid) {
          console.warn(`[build-prompt-pack] rejected organic question (${result.reason}): "${text}"`);
        }
        return result.valid;
      });
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

/**
 * Vunnara hotfix 2 (19 Oct, post-609e323), item 3 -- intent-signal-
 * derived organic candidates. classification.intentSignals comes from
 * an LLM crawl ("emergency plumber Norwest") and never names the
 * brand, so these are organic, not branded (confirmed directly by
 * isBrandedPrompt in tests/unit/audit/flag-branded-prompts.test.ts).
 * They must count against the SAME 10-question organic budget as the
 * category round-robin above -- previously generated unconditionally
 * inside buildEnrichedPrompts, AFTER the organic slice, letting up to
 * 2 organic-by-text prompts bypass the budget entirely (Omega's pack:
 * 12 organic, not 10). buildPromptPack merges this INTO organicPool
 * before the shuffle+slice-to-promptCount step below, the same way it
 * already merges every confirmed category's templates.
 *
 * Also where the duplicate-place bug actually gets fixed: an
 * intentSignal may already carry a place name baked in -- stripped
 * before appending the region, so "Best {signal} in {region}?" names
 * the place once, naturally. validateGeneratedQuestion is the
 * backstop, not the primary fix.
 */
export function buildIntentSignalPrompts(
  classification: BrandClassification,
  region: string,
  audience: Audience,
): string[] {
  const businessSuffix = audience === "businesses" ? "for Australian businesses" : `in ${region}`;
  const prompts: string[] = [];
  for (const signal of classification.intentSignals) {
    if (prompts.length >= 2) break;
    const cleanedSignal = stripPlaceToken(signal, region);
    const candidate = `Best ${cleanedSignal} ${businessSuffix}?`;
    const result = validateGeneratedQuestion(candidate, region, audience !== "businesses");
    if (!result.valid) {
      console.warn(
        `[build-prompt-pack] rejected intent-signal question (${result.reason}): "${candidate}"`,
      );
      continue;
    }
    prompts.push(candidate);
  }
  return prompts;
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
  // Vunnara hotfix (18 Oct, post-df27ef8): the confirmed category,
  // never classification.category -- the live bug this fixes is Omega
  // Services, confirmed as Plumbing + Electrical + General, whose
  // stored classification.category ("trades_general_services") is the
  // OLD classifier's un-confirmable guess and resolves through
  // resolveCategory's fallback chain to the generic "general" label,
  // mentioning neither of the trades the owner actually confirmed.
  // Falls back to the classifier's own guess only when nothing's been
  // confirmed yet -- same "classifier applies only while unconfirmed"
  // rule as buildOrganicPrompts below.
  const categoryText = categoryLabel(confirmed.categories[0] ?? classification.category);

  // Vunnara hotfix 2 (19 Oct, post-609e323), item 3: the intent-
  // signal-derived candidates are organic too (see
  // buildIntentSignalPrompts' own doc comment) -- merged in HERE,
  // before the shuffle+slice, so they count against the same 10-
  // question budget as the category round-robin, never bypass it.
  const organicPool = [
    ...buildOrganicPrompts(classification, confirmed.categories, audience, region),
    ...buildIntentSignalPrompts(classification, region, audience),
  ];
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

  for (const competitor of confirmedCompetitors.slice(0, 2)) {
    prompts.push(
      audience === "businesses"
        ? `${brandName} vs ${competitor} — which is better for Australian businesses?`
        : `${brandName} vs ${competitor} — which is better?`,
    );
  }

  prompts.push(`What are the best alternatives to ${brandName} in ${region}?`);

  // Vunnara hotfix 2 (19 Oct, post-609e323), item 3: the intent-
  // signal-derived prompts moved to buildIntentSignalPrompts above --
  // they never name the brand (confirmed by isBrandedPrompt), so
  // they're organic, not an "enriched"/branded prompt, and now count
  // against the organic budget in buildPromptPack instead of bypassing
  // it from here.

  prompts.push(`Is ${brandName} popular in ${region}?`);

  if (classification.auRelevance === "au_founded") {
    prompts.push("What Australian tech companies are leading in their space in 2025?");
  }

  return prompts;
}
