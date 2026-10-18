import { eq } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { brands } from "@/db/schema";
import { resolveRegionLabel } from "@/lib/brands/region-label";
import { PROMPTS_PER_AUDIT } from "@/lib/llm/tier-engines";
import type { BrandClassification } from "@/lib/types/brand";
import { buildPromptPack } from "./build-prompt-pack";

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
 * classifyAndStoreBrand itself) calls this afterwards. It decides
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
export async function regeneratePromptPack(tx: DbClient, brandId: string): Promise<void> {
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
    })
    .from(brands)
    .where(eq(brands.id, brandId))
    .limit(1);

  if (!brand) return;
  if (brand.classificationStatus !== "complete") return;
  if (!brand.locationMode) return;
  if (!brand.classification) return;

  const classification = brand.classification as BrandClassification;
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

  if (packUnchanged) return;

  const newVersion = hadPackBefore ? (brand.promptPackVersion ?? 1) + 1 : brand.promptPackVersion ?? 1;

  await tx
    .update(brands)
    .set({ promptPack: pack, promptPackVersion: newVersion })
    .where(eq(brands.id, brandId));
}
