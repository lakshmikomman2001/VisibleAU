import { and, asc, eq, isNull } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import type { Brand } from "@/db/schema";
import { brands, verticalPackPrompts, verticalPacks } from "@/db/schema";
import { brandReadyForAudit } from "@/lib/brands/needs-confirmation";
import { resolveRegionLabel } from "@/lib/brands/region-label";
import { buildPromptPack } from "@/lib/prompts/build-prompt-pack";
import { PROMPT_GENERATOR_VERSION } from "@/lib/prompts/generator-version";
import { regeneratePromptPack } from "@/lib/prompts/regenerate-prompt-pack";
import type { BrandClassification } from "@/lib/types/brand";
import { expandPrompt } from "@/lib/verticals/expand-prompt";
import { isBrandedPrompt } from "./flag-branded-prompts";

export interface AuditPrompt {
  text: string;
  isBranded: boolean;
}

/** Build 1 addendum, item 9: thrown instead of silently falling back to
 * a stale pre-confirmation pack (an old brand.promptPack written by the
 * pre-Part-E random-generation system, a live-built pack from an
 * unconfirmed classification, or the fully generic vertical pack).
 * Both callers (lib/audit/run-audit-inline.ts, inngest/functions/
 * run-audit.ts) already fail the audit honestly on any thrown error. */
export class BrandNeedsConfirmationError extends Error {
  constructor(brandId: string) {
    super(
      "Confirm your business type and location before running an audit -- see the brand's detail page.",
    );
    this.name = "BrandNeedsConfirmationError";
    this.brandId = brandId;
  }
  brandId: string;
}

/**
 * Vunnara Build 1, Part E.5: the ONE prompt-selection function shared
 * by both audit runners (lib/audit/run-audit-inline.ts and inngest/
 * functions/run-audit.ts) -- they used to each inline their own copy
 * of this exact logic, with run-audit.ts's copy hardcoding its own
 * promptCount=10 and re-slicing a frozen pack down to it (silently
 * dropping Part E.4's branded extras, which are appended after the
 * organic budget).
 *
 * isBranded is checked on each prompt's final TEXT via the one shared
 * isBrandedPrompt rule (Part B) -- never by provenance (pool
 * membership) or by checking an unexpanded template.
 *
 * Build 1 addendum (entry-point check): `allowUnconfirmed` exists for
 * exactly one caller -- the public pre-signup sample audit
 * (lib/sample-audit/run.ts). That brand is a synthetic, throwaway row
 * in the dedicated "sample" org, created with no classification and no
 * location by design (it's an instant demo, not an onboarding flow) --
 * the needs-confirmation gate below would otherwise throw for every
 * single prospect who tries it, breaking the marketing funnel. Passing
 * this flag skips ONLY the gate itself; the brand still falls through
 * to whichever of the three branches below actually matches its real
 * state (no classification at all -> the generic vertical+region pack,
 * same honest "general questions" fallback a real brand would get
 * before confirming anything).
 */
export async function getAuditPrompts(
  brand: Brand,
  promptCount: number,
  opts?: { allowUnconfirmed?: boolean },
): Promise<AuditPrompt[]> {
  const classification = brand.classification as BrandClassification | null;

  const ready = brandReadyForAudit({
    classificationStatus: brand.classificationStatus,
    classification,
    categoryConfirmedAt: brand.categoryConfirmedAt,
    categories: brand.categories,
    audience: brand.audience,
    locationMode: brand.locationMode,
  });

  // Build 1 addendum, item 9: checked FIRST, before even the frozen-
  // pack branch below -- an existing brand's brand.promptPack may
  // already hold a value written by the PRE-Part-E random-generation
  // system (the exact "old random questions" this must never silently
  // reuse), not a real Part-E-frozen pack. Required behaviour: block,
  // never fall back -- except for the one explicitly-opted-in caller.
  if (!opts?.allowUnconfirmed && !ready) {
    throw new BrandNeedsConfirmationError(brand.id);
  }

  // Vunnara hotfix 2 (19 Oct, post-609e323), item 4: a pack frozen by
  // an OLDER prompt generator (duplicate place names, the hipages
  // mention, 12 organic instead of 10 -- see lib/prompts/generator-
  // version.ts) has no natural trigger to ever regenerate again once a
  // brand is already confirmed. Regenerate FIRST, right here at
  // audit-creation time, whenever the brand is ready and its stamped
  // generator version is behind current -- regeneratePromptPack only
  // bumps promptPackVersion if the content actually changed (hotfix
  // 1, item 3), so this is always safe to call. Re-reads the row
  // afterwards; this branch only runs for the rare stale-pack case,
  // never on an audit against an already-current pack.
  let currentBrand = brand;
  if (ready && (brand.promptPackGeneratorVersion ?? 1) < PROMPT_GENERATOR_VERSION) {
    await regeneratePromptPack(serviceDb, brand.id);
    const [refreshed] = await serviceDb.select().from(brands).where(eq(brands.id, brand.id));
    if (refreshed) currentBrand = refreshed;
  }

  // Vunnara Build 1, Part E.1: a frozen pack (written by
  // regeneratePromptPack once classification+location are both ready)
  // is used in full, exactly as stored -- never re-sliced to
  // promptCount. Its real length is the organic budget PLUS branded
  // extras on top (Part E.3/E.4), not a fixed count; slicing would
  // silently drop the branded extras appended at the end.
  if (
    currentBrand.promptPack &&
    Array.isArray(currentBrand.promptPack) &&
    currentBrand.promptPack.length > 0
  ) {
    return currentBrand.promptPack.map((text) => ({
      text,
      isBranded: isBrandedPrompt(text, currentBrand),
    }));
  }

  if (classification) {
    // Not yet frozen (classification unconfirmed or location not set)
    // -- build a live, unfrozen pack for this one audit from whatever
    // confirmed facts already exist, rather than blocking the audit
    // entirely until both are settled.
    const regionLabel = resolveRegionLabel(currentBrand);
    return buildPromptPack(
      classification,
      currentBrand.name,
      currentBrand.domain,
      {
        competitors: currentBrand.competitors,
        categories: currentBrand.categories,
        audience: currentBrand.audience ?? undefined,
      },
      regionLabel,
      promptCount,
      currentBrand.id,
    ).map((text) => ({ text, isBranded: isBrandedPrompt(text, currentBrand) }));
  }

  const [p] = await serviceDb
    .select()
    .from(verticalPacks)
    .where(
      and(
        eq(verticalPacks.vertical, currentBrand.vertical),
        eq(verticalPacks.region, currentBrand.region),
        isNull(verticalPacks.retiredAt),
      ),
    );

  if (!p) return [];

  const promptRows = await serviceDb
    .select()
    .from(verticalPackPrompts)
    .where(eq(verticalPackPrompts.packId, p.id))
    .orderBy(asc(verticalPackPrompts.rank))
    .limit(promptCount);

  return promptRows
    .flatMap((pr) =>
      expandPrompt(pr.promptTemplate, {
        brand: currentBrand,
        competitors: currentBrand.competitors,
        locations: currentBrand.primaryRegions.slice(0, 3),
      }).map((text) => ({ text, isBranded: isBrandedPrompt(text, currentBrand) })),
    )
    .slice(0, promptCount);
}
