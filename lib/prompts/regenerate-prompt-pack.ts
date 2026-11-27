import { eq } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { brands } from "@/db/schema";
import { resolveRegionLabel } from "@/lib/brands/region-label";
import { PROMPTS_PER_AUDIT } from "@/lib/llm/tier-engines";
import {
  addPackAsSuggestions,
  currentSetAppliedByPerson,
  writeSetFromPack,
} from "@/lib/questions/question-set-store";
import type { BrandClassification } from "@/lib/types/brand";
import { buildPromptPack } from "./build-prompt-pack";
import { classificationFloor } from "./classification-floor";
import { PROMPT_GENERATOR_VERSION } from "./generator-version";

/**
 * S04 part 0a: what a regeneration did, for the brand PATCH's "Saved. Your questions didn't change ..." status. Nothing
 * (undefined) when the brand isn't confirmed and placed yet, so no pack was made.
 * - unchanged: the same pack; at most the generator version stamped;
 * - new_version: the new pack became the brand's next set version (amendment 74);
 * - set_kept: a person applied the current set, so it stayed; the pack's questions went into the library as
 *   suggestions, `suggestionsAdded` of them (LLD amendment 84).
 */
export type RegenerateResult =
  | { outcome: "unchanged" }
  | { outcome: "new_version" }
  | { outcome: "set_kept"; suggestionsAdded: number };

/**
 * Vunnara Build 1, Part E.1/E.2: the ONE place a brand's frozen prompt
 * pack is (re)computed. A pack is only generated/regenerated once the
 * brand is actually ready -- classification "complete" (not needs_
 * confirmation/pending/processing/failed) AND a location decision
 * made (locationMode set, fixed or online_only). Before that, the
 * audit runners' own getAuditPrompts fallback builds a live, unfrozen
 * pack per-audit instead (lib/audit/run-audit-inline.ts, inngest/
 * functions/run-audit.ts) -- intentionally not persisted, since the
 * facts it's built from aren't settled yet.
 *
 * Every caller that changes category/audience/location/competitors
 * (confirm-classification, the location-confirming brand PATCH,
 * classifyAndStoreBrand itself) calls this afterwards, and so does the
 * audit start in both runners for a pack from an older generator
 * (lib/audit/get-audit-prompts.ts): S04 part 0a found no other path that
 * rewrites a brand's pack. When a person applied the brand's current set,
 * this keeps it (LLD amendment 84; the branch below). It decides
 * fresh-generation (keeps the current version) vs regeneration (bumps
 * it) by checking whether a pack already existed, so no caller has to
 * track that distinction itself -- a brand's first-ever pack always
 * stays version 1, even though the call that produces it looks
 * identical to a later regeneration.
 *
 * Takes the caller's own DbClient (serviceDb for a background job
 * already in that fenced context, e.g. classifyAndStoreBrand; the RLS-
 * scoped tx for an API route already inside withRlsContext) rather
 * than importing serviceDb itself -- lib/prompts/** isn't in the
 * serviceDb-fence allowlist (biome.json's noRestrictedImports), and
 * this function has no business deciding its own DB scope anyway.
 */
export async function regeneratePromptPack(
  tx: DbClient,
  brandId: string,
): Promise<RegenerateResult | undefined> {
  const [brand] = await tx
    .select({
      id: brands.id,
      name: brands.name,
      domain: brands.domain,
      classification: brands.classification,
      classificationStatus: brands.classificationStatus,
      categories: brands.categories,
      audience: brands.audience,
      competitors: brands.competitors,
      primaryRegions: brands.primaryRegions,
      suburb: brands.suburb,
      city: brands.city,
      state: brands.state,
      region: brands.region,
      locationMode: brands.locationMode,
      promptPack: brands.promptPack,
      promptPackVersion: brands.promptPackVersion,
      promptPackGeneratorVersion: brands.promptPackGeneratorVersion,
    })
    .from(brands)
    .where(eq(brands.id, brandId))
    .limit(1);

  if (!brand) return;
  if (brand.classificationStatus !== "complete") return;
  if (!brand.locationMode) return;
  // 16 Nov, part 6: no stored classification (the classifier failed) is no reason to leave the brand without
  // questions once its owner confirmed what it is -- they're built from those confirmed facts (classificationFloor).
  // This returned here, so the brand kept its old generator version and every audit threw PromptPackGenerationError.
  const classification =
    (brand.classification as BrandClassification | null) ??
    classificationFloor({ categories: brand.categories, audience: brand.audience });
  const regionLabel = resolveRegionLabel(brand);

  const pack = buildPromptPack(
    classification,
    brand.name,
    brand.domain,
    {
      competitors: brand.competitors,
      categories: brand.categories,
      audience: brand.audience ?? undefined,
    },
    regionLabel,
    PROMPTS_PER_AUDIT,
    brand.id,
  );

  const hadPackBefore = Array.isArray(brand.promptPack) && brand.promptPack.length > 0;
  // Vunnara hotfix (18 Oct, post-df27ef8): the version churn bug --
  // every call used to bump the version unconditionally once a pack
  // existed, even when nothing that actually changes the questions
  // did (confirming categories, then separately confirming location,
  // then a typo fix to the suburb -- each its own PATCH/confirm call --
  // bumped it 3 separate times for one real confirmation flow; Omega
  // reached version 12 this way). Compare the freshly-built pack
  // against what's already stored: identical content means nothing
  // that matters changed, so this call is a true no-op -- no bump, no
  // write at all.
  const previousPack = hadPackBefore ? (brand.promptPack as string[]) : [];
  const packUnchanged =
    hadPackBefore &&
    previousPack.length === pack.length &&
    previousPack.every((text, i) => text === pack[i]);

  // Vunnara hotfix 2 (19 Oct, post-609e323), item 4: even when the
  // content is unchanged, stamp the CURRENT generator version if the
  // stored one is stale -- otherwise a brand whose old-generator
  // content happens to match the new generator's output stays stamped
  // at the old version forever, making get-audit-prompts.ts call this
  // function again on every single future audit for no reason. Never
  // bumps promptPackVersion here -- the actual questions didn't change.
  if (packUnchanged) {
    if (brand.promptPackGeneratorVersion !== PROMPT_GENERATOR_VERSION) {
      await tx
        .update(brands)
        .set({ promptPackGeneratorVersion: PROMPT_GENERATOR_VERSION })
        .where(eq(brands.id, brandId));
    }
    return { outcome: "unchanged" };
  }

  const newVersion = hadPackBefore
    ? (brand.promptPackVersion ?? 1) + 1
    : (brand.promptPackVersion ?? 1);

  return tx.transaction(async (t): Promise<RegenerateResult> => {
    // The brand row, locked, as an apply locks it (lib/questions/apply.ts): whether a person applied the current set is
    // decided and acted on in one turn.
    await t.select({ id: brands.id }).from(brands).where(eq(brands.id, brandId)).for("update");

    // S04 part 0a (LLD amendment 84): a set a person applied (P04's apply, the confirm screen's Questions step) is never
    // replaced by the generator. Its questions stay what audits ask; the regenerated ones become suggestions, and the
    // generator version is stamped so the next audit start doesn't regenerate again. The stored pack becomes the new
    // one, so saving the same details again is "unchanged" (no suggestions re-added); its version number stays, since
    // what audits ask didn't change.
    if (await currentSetAppliedByPerson(t, brandId)) {
      const suggestionsAdded = await addPackAsSuggestions(t, { brandId, pack });
      await t
        .update(brands)
        .set({ promptPack: pack, promptPackGeneratorVersion: PROMPT_GENERATOR_VERSION })
        .where(eq(brands.id, brandId));
      console.info(JSON.stringify({ event: "question_set_kept", brandId, suggestionsAdded }));
      return { outcome: "set_kept", suggestionsAdded };
    }

    // S02 part 3 (LLD 8.2.1; amendment 74): audits ask the brand's current question set, so a new pack becomes the next
    // set version in the same transaction (a savepoint when the caller's is already open): the set always equals the
    // stored pack, and an audit asks exactly what it asked before S02 (N1). Only a changed pack gets here, as before.
    await t
      .update(brands)
      .set({
        promptPack: pack,
        promptPackVersion: newVersion,
        promptPackGeneratorVersion: PROMPT_GENERATOR_VERSION,
      })
      .where(eq(brands.id, brandId));
    await writeSetFromPack(t, { brandId, pack, note: "The regenerated question pack" });
    return { outcome: "new_version" };
  });
}
