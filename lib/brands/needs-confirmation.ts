import { and, eq } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { auditSchedules } from "@/db/schema";
import { CATEGORY_KEYS } from "@/lib/prompts/templates";
import type { BrandClassification } from "@/lib/types/brand";

const CONFIDENCE_CONFIRMATION_THRESHOLD = 0.7;

export interface ClassificationConfirmationInput {
  classificationStatus: string | null;
  classification: BrandClassification | null;
  categoryConfirmedAt: Date | string | null;
  // Vunnara hotfix (18 Oct, post-df27ef8): the owner's own confirmed
  // categories/audience -- optional so every existing caller/test that
  // predates this fix (and still only has classification/
  // categoryConfirmedAt to hand) keeps working unchanged; a caller
  // that omits them is treated as "not confirmed by this definition"
  // and falls through to the classifier-signal checks below, exactly
  // as before.
  categories?: readonly string[] | null;
  audience?: string | null;
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
 *
 * Hotfix (18 Oct, post-df27ef8): the owner's own confirmation --
 * category_confirmed_at set, categories non-empty and every one a real
 * CATEGORY_KEYS entry, audience set -- is checked FIRST and, once true,
 * is the end of it. The classifier's own category/confidence (the
 * checks below) only ever apply to a brand that HASN'T been confirmed
 * this way yet; they must never re-impose themselves on a brand the
 * owner already confirmed, no matter what the old classifier originally
 * guessed (this was the live bug: Omega Services confirmed through the
 * UI and stayed permanently blocked because its stored
 * classification.category/confidence, from the OLD classifier, never
 * changes and kept failing these checks on every read).
 */
function isOwnerConfirmed(brand: ClassificationConfirmationInput): boolean {
  if (brand.categoryConfirmedAt == null) return false;
  const categories = brand.categories ?? [];
  if (categories.length === 0) return false;
  if (!categories.every((cat) => (CATEGORY_KEYS as readonly string[]).includes(cat))) {
    return false;
  }
  return !!brand.audience;
}

export function brandNeedsClassificationConfirmation(
  brand: ClassificationConfirmationInput,
): boolean {
  if (brand.classificationStatus === "needs_confirmation") return true;
  if (brand.classificationStatus !== "complete") return false;
  if (isOwnerConfirmed(brand)) return false;

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

/**
 * Build 1 follow-up (entry-point check): the schedule's own "Pause/
 * Resume" toggle is hidden while status = 'needs_confirmation'
 * (brand-schedule-view.tsx, agency-schedules-view.tsx) -- a manual
 * resume would just get re-paused on the next cron tick without the
 * brand actually being confirmed. This is the one way the schedule
 * resumes: called right after a confirm action (confirm-classification,
 * or the brand PATCH route's location-confirming path) updates the
 * brand, using its OWN now-current row. A no-op (0 rows matched) for
 * any brand with no schedule, or whose schedule isn't paused for this
 * specific reason -- never touches an "active" or "quota_exceeded" one.
 */
export async function reactivateScheduleIfReady(
  tx: DbClient,
  brand: AuditReadinessInput & { id: string },
): Promise<void> {
  if (!brandReadyForAudit(brand)) return;
  await tx
    .update(auditSchedules)
    .set({ status: "active", pausedReason: null, updatedAt: new Date() })
    .where(and(eq(auditSchedules.brandId, brand.id), eq(auditSchedules.status, "needs_confirmation")));
}
