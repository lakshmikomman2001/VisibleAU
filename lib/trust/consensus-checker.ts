import type { DbClient } from "@/db/client";
import { brandConsensusChecks } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

export interface ConsensusInput {
  sourceType: string;
  sourceUrl: string | null;
  nameMatch: boolean;
  serviceMatch: boolean;
  locationMatch: boolean;
  pricePositioning: "premium" | "mid" | "budget" | "not_stated";
  differentiatorsMatch: boolean;
}

export interface ConsensusResult {
  consistencyScore: number;
  discrepancies: Array<{
    field: string;
    thisSource: string;
    websiteValue: string;
  }>;
}

export function computeConsistencyScore(input: ConsensusInput): ConsensusResult {
  const discrepancies: ConsensusResult["discrepancies"] = [];
  let matchCount = 0;
  const totalFields = 4;

  if (input.nameMatch) {
    matchCount++;
  } else {
    discrepancies.push({
      field: "name",
      thisSource: "does not match",
      websiteValue: "brand name",
    });
  }

  if (input.serviceMatch) {
    matchCount++;
  } else {
    discrepancies.push({
      field: "services",
      thisSource: "does not match",
      websiteValue: "listed services",
    });
  }

  if (input.locationMatch) {
    matchCount++;
  } else {
    discrepancies.push({
      field: "location",
      thisSource: "does not match",
      websiteValue: "business location",
    });
  }

  if (input.differentiatorsMatch) {
    matchCount++;
  } else {
    discrepancies.push({
      field: "differentiators",
      thisSource: "does not match",
      websiteValue: "key differentiators",
    });
  }

  const consistencyScore = Math.round((matchCount / totalFields) * 100);

  return { consistencyScore, discrepancies };
}

export async function upsertConsensusCheck(
  tx: DbClient,
  brandId: string,
  organizationId: string,
  marketCode: string,
  input: ConsensusInput,
): Promise<void> {
  const result = computeConsistencyScore(input);

  await tx
    .insert(brandConsensusChecks)
    .values({
      brandId,
      organizationId,
      marketCode,
      sourceType: input.sourceType,
      sourceUrl: input.sourceUrl,
      nameMatch: input.nameMatch,
      serviceMatch: input.serviceMatch,
      locationMatch: input.locationMatch,
      pricePositioning: input.pricePositioning,
      differentiatorsMatch: input.differentiatorsMatch,
      consistencyScore: result.consistencyScore,
      discrepancies: result.discrepancies,
    })
    .onConflictDoUpdate({
      target: [brandConsensusChecks.brandId, brandConsensusChecks.sourceType],
      set: {
        sourceUrl: input.sourceUrl,
        nameMatch: input.nameMatch,
        serviceMatch: input.serviceMatch,
        locationMatch: input.locationMatch,
        pricePositioning: input.pricePositioning,
        differentiatorsMatch: input.differentiatorsMatch,
        consistencyScore: result.consistencyScore,
        discrepancies: result.discrepancies,
        checkedAt: new Date(),
        updatedAt: new Date(),
      },
    });
}
