import { eq } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { brands } from "@/db/schema";
import { buildPromptPack } from "@/lib/prompts/build-prompt-pack";
import { classifyBrand } from "./classify-brand";

const REGION_DISPLAY: Record<string, string> = {
  au: "Australia",
  nz: "New Zealand",
  uk: "United Kingdom",
  us: "United States",
  ca: "Canada",
  eu: "Europe",
};

export async function classifyAndStoreBrand(brandId: string): Promise<void> {
  const [brand] = await serviceDb
    .select({
      id: brands.id,
      name: brands.name,
      domain: brands.domain,
      vertical: brands.vertical,
      region: brands.region,
      primaryRegions: brands.primaryRegions,
      competitors: brands.competitors,
      classificationStatus: brands.classificationStatus,
    })
    .from(brands)
    .where(eq(brands.id, brandId))
    .limit(1);

  if (!brand) {
    console.error("[classifyAndStoreBrand] Brand not found", { brandId });
    return;
  }

  if (brand.classificationStatus === "complete") {
    return;
  }

  await serviceDb
    .update(brands)
    .set({ classificationStatus: "processing" })
    .where(eq(brands.id, brandId));

  try {
    const classification = await classifyBrand(
      brand.name,
      brand.domain,
      brand.vertical ?? undefined,
    );

    const regionLabel =
      brand.primaryRegions[0]?.replace(/^[A-Z]+:/, "") ??
      REGION_DISPLAY[brand.region] ??
      "Australia";

    const promptPack = buildPromptPack(
      classification,
      brand.name,
      brand.domain,
      brand.competitors,
      regionLabel,
    );

    // Vunnara Build 1, Part C.4: a low-confidence or fell-through-to-
    // "general" classification isn't trustworthy enough to run an
    // audit on unconfirmed -- needs_confirmation routes the brand
    // through the confirm-step UI instead of silently shipping a guess.
    const needsConfirmation = classification.confidence < 0.7 || classification.category === "general";

    await serviceDb
      .update(brands)
      .set({
        classification,
        classificationStatus: needsConfirmation ? "needs_confirmation" : "complete",
        classificationAt: new Date(),
        classificationError: null,
        promptPack,
        promptPackVersion: 1,
      })
      .where(eq(brands.id, brandId));
  } catch (err) {
    // Vunnara Build 1, Part C.5: persist the real error (previously
    // logged to console only and lost) and RE-THROW -- the old version
    // caught and swallowed here, so Inngest's retries: 3 never fired
    // for a classification failure; every failure "succeeded" from
    // Inngest's point of view.
    const message = err instanceof Error ? err.message : String(err);
    console.error("[classifyAndStoreBrand] Failed", { brandId, err });
    await serviceDb
      .update(brands)
      .set({ classificationStatus: "failed", classificationError: message })
      .where(eq(brands.id, brandId));
    throw err;
  }
}
