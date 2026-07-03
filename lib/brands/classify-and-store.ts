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

  await serviceDb.update(brands).set({ classificationStatus: "processing" }).where(eq(brands.id, brandId));

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

    const promptPack = buildPromptPack(classification, brand.name, brand.domain, regionLabel);

    await serviceDb
      .update(brands)
      .set({
        classification,
        classificationStatus: "complete",
        classificationAt: new Date(),
        promptPack,
        promptPackVersion: 1,
      })
      .where(eq(brands.id, brandId));
  } catch (err) {
    console.error("[classifyAndStoreBrand] Failed", { brandId, err });
    await serviceDb.update(brands).set({ classificationStatus: "failed" }).where(eq(brands.id, brandId));
  }
}
