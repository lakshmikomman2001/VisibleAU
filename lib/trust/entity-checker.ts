import type { DbClient } from "@/db/client";
import { brandEntityScores } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface EntityCheckResult {
  knowledgePanelPresent: boolean;
  knowledgePanelAccurate: boolean | null;
  knowledgePanelUrl: string | null;
  wikidataEntryPresent: boolean;
  wikidataEntryUrl: string | null;
  localRegVerified: boolean;
  localRegNumber: string | null;
  directoryUpdates: Record<string, boolean | number | null>;
}

export async function refreshEntityScore(
  tx: DbClient,
  brandId: string,
  organizationId: string,
  marketCode: string = "AU_EN",
): Promise<EntityCheckResult> {
  const existing = await tx
    .select()
    .from(brandEntityScores)
    .where(eq(brandEntityScores.brandId, brandId))
    .limit(1);

  const current = existing[0];
  const abnAlreadyVerified = current?.abnVerified ?? false;

  let localRegVerified = abnAlreadyVerified;
  let localRegNumber = current?.abnNumber ?? null;

  if (!abnAlreadyVerified) {
    const registryResult = await checkRegistry(marketCode, current?.abnNumber ?? null);
    localRegVerified = registryResult.verified;
    localRegNumber = registryResult.number;
  }

  const kpResult = await checkKnowledgePanel(brandId);
  const wdResult = await checkWikidata(brandId);
  const dirResult = await checkDirectories(brandId, marketCode);

  const updates: Record<string, unknown> = {
    organizationId,
    marketCode,
    localRegVerified,
    localRegNumber,
    knowledgePanelPresent: kpResult.present,
    knowledgePanelAccurate: kpResult.accurate,
    knowledgePanelUrl: kpResult.url,
    wikidataEntryPresent: wdResult.present,
    wikidataEntryUrl: wdResult.url,
    ...dirResult,
    checkedAt: new Date(),
  };

  if (current) {
    await tx
      .update(brandEntityScores)
      .set(updates)
      .where(eq(brandEntityScores.id, current.id));
  }

  return {
    knowledgePanelPresent: kpResult.present,
    knowledgePanelAccurate: kpResult.accurate,
    knowledgePanelUrl: kpResult.url,
    wikidataEntryPresent: wdResult.present,
    wikidataEntryUrl: wdResult.url,
    localRegVerified,
    localRegNumber,
    directoryUpdates: dirResult,
  };
}

async function checkRegistry(
  marketCode: string,
  existingNumber: string | null,
): Promise<{ verified: boolean; number: string | null }> {
  if (process.env.LLM_MODE === "mock") {
    return { verified: !!existingNumber, number: existingNumber };
  }

  if (marketCode.startsWith("AU") && existingNumber) {
    try {
      const res = await fetch(
        `https://abr.business.gov.au/json/AbnDetails.aspx?abn=${existingNumber}&callback=cb`,
      );
      const text = await res.text();
      const match = text.match(/cb\((.*)\)/);
      if (match) {
        const data = JSON.parse(match[1]);
        return {
          verified: data.Abn === existingNumber,
          number: existingNumber,
        };
      }
    } catch {
      // Fall through
    }
  }

  return { verified: false, number: existingNumber };
}

async function checkKnowledgePanel(
  _brandId: string,
): Promise<{ present: boolean; accurate: boolean | null; url: string | null }> {
  if (process.env.LLM_MODE === "mock") {
    return { present: false, accurate: null, url: null };
  }
  return { present: false, accurate: null, url: null };
}

async function checkWikidata(
  _brandId: string,
): Promise<{ present: boolean; url: string | null }> {
  if (process.env.LLM_MODE === "mock") {
    return { present: false, url: null };
  }
  return { present: false, url: null };
}

async function checkDirectories(
  _brandId: string,
  _marketCode: string,
): Promise<Record<string, boolean | number | null>> {
  if (process.env.LLM_MODE === "mock") {
    return {
      hipagesPresent: false,
      hipagesRating: null,
      yellowPagesPresent: false,
      serviceSeekingPresent: false,
      wordOfMouthPresent: false,
      wordOfMouthRating: null,
      localDirectoryCount: 0,
    };
  }
  return {
    hipagesPresent: false,
    hipagesRating: null,
    yellowPagesPresent: false,
    serviceSeekingPresent: false,
    wordOfMouthPresent: false,
    wordOfMouthRating: null,
    localDirectoryCount: 0,
  };
}
