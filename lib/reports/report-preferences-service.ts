import { and, asc, eq, isNull, notInArray } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import {
  actionItems,
  agencyActions,
  reportActionChoices,
  reportBrandPreferences,
} from "@/db/schema";
import { isTierAtLeast } from "@/lib/brands";
import { effectiveTier } from "@/lib/pricing/effective-tier";
import type { ReportPreferencesInput } from "./report-contents";
import { MAX_AGENCY_ACTIONS } from "./report-contents";

/**
 * S01 part 5 (LLD 8.1.3, D1; contract P08): what the report contents panel saves. Every write runs in the caller's
 * RLS transaction (withRlsContext), so a workspace only ever reads or writes its own brands' rows.
 * - Report preferences (section toggles, default tier) and action choices (include, order, note): Agency and up may
 *   change the choices, toggles and notes; Growth may save only the default tier (it sees the panel read-only).
 * - Agency actions: Agency and up.
 */

/** The plan from which the agency curates its client's report (D1: Agency and up). */
export const REPORT_CURATION_FROM_TIER = "agency";

export function reportCurationAllowed(tier: string): boolean {
  return isTierAtLeast(tier, REPORT_CURATION_FROM_TIER);
}

/** Whether the workspace's plan curates its reports (Agency and up), read from its live plan. */
export async function workspaceCurates(tx: DbClient, organizationId: string): Promise<boolean> {
  return reportCurationAllowed(await effectiveTier(tx, organizationId));
}

export interface SavedReportPreferences {
  includeGeneralAdvice: boolean;
  includeDoneSinceLast: boolean;
  defaultTier: "basic" | "standard" | "enhanced" | null;
  choices: Array<{
    actionItemId: string;
    included: boolean;
    position: number | null;
    note: string | null;
  }>;
}

export async function readReportPreferences(
  tx: DbClient,
  brandId: string,
): Promise<SavedReportPreferences> {
  const [[prefs], choices] = await Promise.all([
    tx.select().from(reportBrandPreferences).where(eq(reportBrandPreferences.brandId, brandId)),
    tx
      .select({
        actionItemId: reportActionChoices.actionItemId,
        included: reportActionChoices.included,
        position: reportActionChoices.position,
        note: reportActionChoices.note,
      })
      .from(reportActionChoices)
      .where(eq(reportActionChoices.brandId, brandId))
      .orderBy(asc(reportActionChoices.position)),
  ]);
  return {
    includeGeneralAdvice: prefs?.includeGeneralAdvice ?? true,
    includeDoneSinceLast: prefs?.includeDoneSinceLast ?? true,
    defaultTier: prefs?.defaultTier ?? null,
    choices,
  };
}

export class ReportContentsError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404,
  ) {
    super(message);
  }
}

/**
 * Saves what was sent. `curated` false (below Agency): only `defaultTier` is kept; anything else sent is ignored
 * (the caller refuses it with the plan refusal first when it should). Choices replace the brand's saved list: an action not sent
 * loses its saved choice. Every action sent must be one of this brand's Action Center items.
 */
export async function saveReportPreferences(
  tx: DbClient,
  input: {
    organizationId: string;
    brandId: string;
    userId: string | null;
    curated: boolean;
    preferences: ReportPreferencesInput;
  },
): Promise<SavedReportPreferences> {
  const { organizationId, brandId, userId, curated, preferences } = input;
  const toggles = curated
    ? {
        ...(preferences.includeGeneralAdvice !== undefined
          ? { includeGeneralAdvice: preferences.includeGeneralAdvice }
          : {}),
        ...(preferences.includeDoneSinceLast !== undefined
          ? { includeDoneSinceLast: preferences.includeDoneSinceLast }
          : {}),
      }
    : {};
  const tier =
    preferences.defaultTier !== undefined ? { defaultTier: preferences.defaultTier } : {};
  await tx
    .insert(reportBrandPreferences)
    .values({ brandId, organizationId, ...toggles, ...tier, updatedBy: userId })
    .onConflictDoUpdate({
      target: reportBrandPreferences.brandId,
      set: { ...toggles, ...tier, updatedBy: userId, updatedAt: new Date() },
    });

  if (curated && preferences.choices) {
    const ids = preferences.choices.map((c) => c.actionItemId);
    if (ids.length > 0) {
      const owned = await tx
        .select({ id: actionItems.id })
        .from(actionItems)
        .where(
          and(eq(actionItems.brandId, brandId), eq(actionItems.organizationId, organizationId)),
        );
      const ownedIds = new Set(owned.map((o) => o.id));
      if (ids.some((id) => !ownedIds.has(id)))
        throw new ReportContentsError("choices: an action isn't one of this brand's", 400);
    }
    await tx
      .delete(reportActionChoices)
      .where(
        ids.length > 0
          ? and(
              eq(reportActionChoices.brandId, brandId),
              notInArray(reportActionChoices.actionItemId, ids),
            )
          : eq(reportActionChoices.brandId, brandId),
      );
    for (const c of preferences.choices) {
      await tx
        .insert(reportActionChoices)
        .values({
          organizationId,
          brandId,
          actionItemId: c.actionItemId,
          included: c.included,
          position: c.position,
          note: c.note,
          updatedBy: userId,
        })
        .onConflictDoUpdate({
          target: [reportActionChoices.brandId, reportActionChoices.actionItemId],
          set: {
            included: c.included,
            position: c.position,
            note: c.note,
            updatedBy: userId,
            updatedAt: new Date(),
          },
        });
    }
  }
  return readReportPreferences(tx, brandId);
}

export async function listAgencyActions(tx: DbClient, brandId: string) {
  return tx
    .select()
    .from(agencyActions)
    .where(and(eq(agencyActions.brandId, brandId), isNull(agencyActions.archivedAt)))
    .orderBy(asc(agencyActions.position), asc(agencyActions.createdAt));
}

export async function countLiveAgencyActions(tx: DbClient, brandId: string): Promise<number> {
  return (await listAgencyActions(tx, brandId)).length;
}

export { MAX_AGENCY_ACTIONS };
