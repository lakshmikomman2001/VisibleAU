import { and, eq, isNull } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { brandQuestions, brands } from "@/db/schema";
import { resolveRegionLabel } from "@/lib/brands/region-label";
import { loadCurrentQuestionSet } from "@/lib/questions/question-set-store";
import type { QuestionReach, QuestionValidationContext } from "@/lib/questions/validate";

/**
 * S03 part 2 (LLD 8.3.2): what lib/questions/validate.ts needs to know about a brand, read on the server -- for
 * POST /api/brands/:id/questions/validate (the add drawer's checks) and, place by place, for apply.
 */

type PlaceFields = Pick<
  typeof brands.$inferSelect,
  "suburb" | "city" | "state" | "primaryRegions" | "region"
>;

/**
 * The places a Local question may name -- the brand's suburb, city, state, primary regions and its region label (the
 * label templates use, lib/brands/region-label.ts) -- and the one the one-click fix adds: that label. Other reaches
 * have their places from S04; until then none.
 */
export function brandPlaces(
  brand: PlaceFields,
  reach: QuestionReach,
): { places: string[]; fixPlace: string | null } {
  if (reach !== "local") return { places: [], fixPlace: null };
  const label = resolveRegionLabel(brand);
  const places = [
    brand.suburb,
    brand.city,
    brand.state,
    label,
    ...brand.primaryRegions.map((r) => r.replace(/^[A-Z]+:/, "")),
  ].filter((p): p is string => typeof p === "string" && p.trim().length > 0);
  return { places, fixPlace: label };
}

/** The brand's validation context for one question, against its live library and current set. */
export async function loadValidationContext(
  tx: DbClient,
  input: { organizationId: string; brandId: string; reach: QuestionReach; maxBranded: number },
): Promise<QuestionValidationContext | null> {
  const [brand] = await tx
    .select({
      name: brands.name,
      domain: brands.domain,
      aliases: brands.aliases,
      competitors: brands.competitors,
      suburb: brands.suburb,
      city: brands.city,
      state: brands.state,
      primaryRegions: brands.primaryRegions,
      region: brands.region,
    })
    .from(brands)
    .where(and(eq(brands.id, input.brandId), eq(brands.organizationId, input.organizationId)));
  if (!brand) return null;
  const library = await tx
    .select({ textKey: brandQuestions.textKey })
    .from(brandQuestions)
    .where(and(eq(brandQuestions.brandId, input.brandId), isNull(brandQuestions.archivedAt)));
  const current = await loadCurrentQuestionSet(tx, input.brandId);
  return {
    brand: { name: brand.name, domain: brand.domain, aliases: brand.aliases },
    existingKeys: new Set(library.map((q) => q.textKey)),
    brandedInSet: current?.items.filter((i) => i.kind === "branded").length ?? 0,
    maxBranded: input.maxBranded,
    reach: input.reach,
    ...brandPlaces(brand, input.reach),
    competitors: brand.competitors,
  };
}
