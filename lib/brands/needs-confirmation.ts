import { CATEGORY_KEYS } from "@/lib/prompts/templates";
import type { BrandClassification } from "@/lib/types/brand";

const CONFIDENCE_CONFIRMATION_THRESHOLD = 0.7;

export interface ClassificationConfirmationInput {
  classificationStatus: string | null;
  classification: BrandClassification | null;
  categoryConfirmedAt: Date | string | null;
}

/**
 * Build 1 addendum, item 10: existing rows kept whatever
 * classification_status the OLD classifier wrote, and got `audience`
 * derived from buyerType rather than confirmed -- Omega-shaped bug:
 * buyerType "smb", confidence 0.62, category "trades_general_services"
 * (not a real CATEGORY_KEYS entry) got classification_status =
 * 'complete' and would never be asked to confirm, even though today's
 * classifier (Part C) would mark a brand with this exact shape
 * needs_confirmation on first classification.
 *
 * Re-checked at READ TIME against TODAY's bar -- no data edit, no
 * stored value trusted blindly. A `classification_status` of
 * "pending"/"processing"/"failed" is left to its own existing handling
 * (not a confirmation question); "needs_confirmation" is already
 * explicit; "complete" is the one status re-validated here.
 */
export function brandNeedsClassificationConfirmation(
  brand: ClassificationConfirmationInput,
): boolean {
  if (brand.classificationStatus === "needs_confirmation") return true;
  if (brand.classificationStatus !== "complete") return false;

  const c = brand.classification;
  if (!c) return false;
  if (!(CATEGORY_KEYS as readonly string[]).includes(c.category)) return true;
  if (c.confidence < CONFIDENCE_CONFIRMATION_THRESHOLD) return true;
  if (brand.categoryConfirmedAt == null) return true;
  return false;
}

export interface AuditReadinessInput extends ClassificationConfirmationInput {
  locationMode: string | null;
}

/**
 * Build 1 addendum, item 9: whether a brand is ready for a REAL,
 * tailored audit -- classification actually COMPLETE (pending,
 * processing or failed are not "ready" either, even though they don't
 * show the confirm card above -- they have no usable classification to
 * ask about at all yet), confirmed by the item-10 bar, AND a location
 * actually confirmed (fixed or online_only). Required behaviour per
 * the addendum: callers that find this false must BLOCK the audit
 * with a clear call to action, never silently fall back to a generic
 * vertical pack or a stale classification.
 */
export function brandReadyForAudit(brand: AuditReadinessInput): boolean {
  return (
    brand.classificationStatus === "complete" &&
    !brandNeedsClassificationConfirmation(brand) &&
    brand.locationMode != null
  );
}
