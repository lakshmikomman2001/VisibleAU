import { and, eq, isNull, sql } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import {
  type Brand,
  brandQuestions,
  brands,
  type QuestionReach,
  type ReachPlace,
} from "@/db/schema";
import { isBrandedPrompt } from "@/lib/audit/flag-branded-prompts";
import { resolveRegionLabel } from "@/lib/brands/region-label";
import { findState, type Market } from "@/lib/markets";
import { servicePhraseFor } from "@/lib/prompts/build-prompt-pack";
import { classificationFloor } from "@/lib/prompts/classification-floor";
import { validateGeneratedQuestion } from "@/lib/prompts/validate-question";
import type { Audience, BrandClassification } from "@/lib/types/brand";
import { COUNTRY_FAMILY, GLOBAL_FAMILY, type ReachFamily, STATE_FAMILY } from "./templates";

/**
 * S04 part 3 (LLD 8.4.3): questions for a reach beyond Local, from its family (lib/reach/templates.ts), with the
 * business's service phrase and the reach's place in the words. Each one passes the generator's own checks
 * (validateGeneratedQuestion: shape, the place present unless Worldwide, acronyms and articles). At most `count`; fewer
 * when the family has fewer (the writer replaces templates in S06).
 *
 * New questions never go straight into a set: addReachSuggestions puts them in the brand's library as suggestions in
 * their reach, and a person applies them through the S03 flow (P01's "Save and review questions" opens the draft; LLD
 * amendment 84 holds: generation never replaces a set a person applied).
 */

export type BeyondLocal = Exclude<QuestionReach, "local">;

const FAMILY: Record<BeyondLocal, ReachFamily> = {
  state: STATE_FAMILY,
  country: COUNTRY_FAMILY,
  global: GLOBAL_FAMILY,
};

export interface ReachQuestionInput {
  reach: BeyondLocal;
  market: Market;
  place: ReachPlace;
  /** "a plumber", "managed IT services" (servicePhraseFor). */
  servicePhrase: string;
  audience: Audience;
  count: number;
}

/** The family's templates in the order the audience reads them first. */
function ordered(family: ReachFamily, audience: Audience): string[] {
  if (audience === "households") return [...family.households, ...family.businesses];
  if (audience === "businesses") return [...family.businesses, ...family.households];
  const out: string[] = [];
  const longest = Math.max(family.households.length, family.businesses.length);
  for (let i = 0; i < longest; i++) {
    if (family.households[i]) out.push(family.households[i]);
    if (family.businesses[i]) out.push(family.businesses[i]);
  }
  return out;
}

const capitalise = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** The words a template's place placeholders take for this reach; null when the market can't place it. */
function placeholders(input: ReachQuestionInput): Record<string, string> | null {
  if (input.reach === "state") {
    const state = findState(input.market, input.place.state);
    return state ? { state: state.inQuestion } : null;
  }
  if (input.reach === "country") {
    const c = input.market.country;
    return c ? { country: c.name, adjective: c.adjective } : null;
  }
  return {};
}

export function reachQuestions(input: ReachQuestionInput): string[] {
  const words = placeholders(input);
  if (!words || input.count <= 0) return [];
  const out: string[] = [];
  for (const template of ordered(FAMILY[input.reach], input.audience)) {
    if (out.length >= input.count) break;
    const text = capitalise(
      template
        .replaceAll("{phrase}", input.servicePhrase)
        .replace(/\{(state|country|adjective)\}/g, (_, k: string) => words[k] ?? ""),
    );
    // The place as the check reads it: a state or the country named after "in" (it requires that); the adjective form
    // ("for {adjective} small businesses") is the check's own exception, a template that names the place another way
    // (validateGeneratedQuestion's requireLocation), so it's checked without the location rule. Worldwide names none.
    const named = words.state ?? words.country;
    const usesName = named !== undefined && text.split(/[^\p{L}\p{N}]+/u).includes(named);
    const checked = validateGeneratedQuestion(
      text,
      usesName ? named : "",
      usesName,
      Object.values(words),
    );
    if (!checked.valid || out.includes(text)) continue;
    out.push(text);
  }
  return out;
}

/** A brand's facts the reach questions are written from. */
export type ReachBrand = Pick<
  Brand,
  | "name"
  | "domain"
  | "aliases"
  | "classification"
  | "categories"
  | "audience"
  | "suburb"
  | "city"
  | "state"
  | "region"
  | "primaryRegions"
>;

/** The brand's service phrase, as its own questions name it. */
export function brandServicePhrase(brand: ReachBrand): string {
  const classification =
    (brand.classification as BrandClassification | null) ??
    classificationFloor({ categories: brand.categories, audience: brand.audience });
  return servicePhraseFor(classification, brand.categories, resolveRegionLabel(brand));
}

/** A brand's questions for a reach: reachQuestions with its service phrase and audience (both when not set). */
export function brandReachQuestions(
  brand: ReachBrand,
  input: { reach: BeyondLocal; market: Market; place: ReachPlace; count: number },
): string[] {
  const audience: Audience =
    brand.audience === "households" || brand.audience === "businesses" ? brand.audience : "both";
  return reachQuestions({ ...input, servicePhrase: brandServicePhrase(brand), audience }).filter(
    (q) => !isBrandedPrompt(q, { name: brand.name, domain: brand.domain, aliases: brand.aliases }),
  );
}

/**
 * Adds a reach's questions to the brand's library as suggestions in that reach (source 'template', everyday), each
 * compared text once (one already live is skipped, and its id returned with the new ones), and returns the library ids
 * in the order given. Run in the transaction that changed the reaches.
 */
export async function addReachSuggestions(
  tx: DbClient,
  input: { organizationId: string; brandId: string; reach: BeyondLocal; texts: readonly string[] },
): Promise<string[]> {
  if (input.texts.length === 0) return [];
  const [brand] = await tx
    .select({ id: brands.id })
    .from(brands)
    .where(and(eq(brands.id, input.brandId), eq(brands.organizationId, input.organizationId)));
  if (!brand) return [];
  const ids: string[] = [];
  for (const text of input.texts) {
    const [live] = await tx
      .select({ id: brandQuestions.id })
      .from(brandQuestions)
      .where(
        and(
          eq(brandQuestions.brandId, input.brandId),
          isNull(brandQuestions.archivedAt),
          sql`${brandQuestions.textKey} = question_text_key(${text})`,
        ),
      );
    if (live) {
      ids.push(live.id);
      continue;
    }
    const [row] = await tx
      .insert(brandQuestions)
      .values({
        organizationId: input.organizationId,
        brandId: input.brandId,
        text,
        textKey: sql`question_text_key(${text})`,
        kind: "everyday",
        source: "template",
        reach: input.reach,
        status: "suggested",
      })
      .returning({ id: brandQuestions.id });
    ids.push(row.id);
  }
  return ids;
}
