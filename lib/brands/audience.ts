import type { Audience, BrandClassification } from "@/lib/types/brand";

/**
 * Vunnara Build 1, Part C: every row classified before `audience`
 * existed only has `buyerType`, designed to answer a different
 * question (B2B SaaS customer segment, not "households or
 * businesses?"). This is the one place that derives a reasonable
 * audience from it for those legacy rows -- "consumer" is the only
 * buyerType value that unambiguously means "households"; every
 * B2B-shaped value (smb/enterprise/agency/freelancer) means
 * "businesses"; "mixed" means "both".
 */
export function deriveAudienceFromBuyerType(buyerType: BrandClassification["buyerType"]): Audience {
  switch (buyerType) {
    case "consumer":
      return "households";
    case "mixed":
      return "both";
    case "smb":
    case "enterprise":
    case "agency":
    case "freelancer":
      return "businesses";
  }
}

/** The audience to actually use: the stored value if this row was
 * classified under the new system, or derived from buyerType for a
 * legacy row that predates the audience field. */
export function resolveAudience(classification: BrandClassification): Audience {
  return classification.audience ?? deriveAudienceFromBuyerType(classification.buyerType);
}
