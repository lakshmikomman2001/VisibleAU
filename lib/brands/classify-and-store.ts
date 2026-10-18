import { eq } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { brands } from "@/db/schema";
import { regeneratePromptPack } from "@/lib/prompts/regenerate-prompt-pack";
import { classifyBrand } from "./classify-brand";

export async function classifyAndStoreBrand(brandId: string): Promise<void> {
  const [brand] = await serviceDb
    .select({
      id: brands.id,
      name: brands.name,
      domain: brands.domain,
      vertical: brands.vertical,
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
      })
      .where(eq(brands.id, brandId));

    // Vunnara Build 1, Part E.1: only actually (re)generates the frozen
    // pack when this brand is ALSO location-ready -- a no-op otherwise,
    // re-checked from scratch against the row just written above.
    await regeneratePromptPack(serviceDb, brandId);
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
