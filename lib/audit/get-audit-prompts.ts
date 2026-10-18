import { and, asc, eq, isNull } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import type { Brand } from "@/db/schema";
import { verticalPackPrompts, verticalPacks } from "@/db/schema";
import { resolveRegionLabel } from "@/lib/brands/region-label";
import { buildPromptPack } from "@/lib/prompts/build-prompt-pack";
import type { BrandClassification } from "@/lib/types/brand";
import { expandPrompt } from "@/lib/verticals/expand-prompt";
import { isBrandedPrompt } from "./flag-branded-prompts";

export interface AuditPrompt {
  text: string;
  isBranded: boolean;
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
 */
export async function getAuditPrompts(brand: Brand, promptCount: number): Promise<AuditPrompt[]> {
  const classification = brand.classification as BrandClassification | null;

  // Vunnara Build 1, Part E.1: a frozen pack (written by
  // regeneratePromptPack once classification+location are both ready)
  // is used in full, exactly as stored -- never re-sliced to
  // promptCount. Its real length is the organic budget PLUS branded
  // extras on top (Part E.3/E.4), not a fixed count; slicing would
  // silently drop the branded extras appended at the end.
  if (brand.promptPack && Array.isArray(brand.promptPack) && brand.promptPack.length > 0) {
    return brand.promptPack.map((text) => ({ text, isBranded: isBrandedPrompt(text, brand) }));
  }

  if (classification) {
    // Not yet frozen (classification unconfirmed or location not set)
    // -- build a live, unfrozen pack for this one audit from whatever
    // confirmed facts already exist, rather than blocking the audit
    // entirely until both are settled.
    const regionLabel = resolveRegionLabel(brand);
    return buildPromptPack(
      classification,
      brand.name,
      brand.domain,
      { competitors: brand.competitors, categories: brand.categories, audience: brand.audience ?? undefined },
      regionLabel,
      promptCount,
      brand.id,
    ).map((text) => ({ text, isBranded: isBrandedPrompt(text, brand) }));
  }

  const [p] = await serviceDb
    .select()
    .from(verticalPacks)
    .where(
      and(
        eq(verticalPacks.vertical, brand.vertical),
        eq(verticalPacks.region, brand.region),
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
        brand,
        competitors: brand.competitors,
        locations: brand.primaryRegions.slice(0, 3),
      }).map((text) => ({ text, isBranded: isBrandedPrompt(text, brand) })),
    )
    .slice(0, promptCount);
}
