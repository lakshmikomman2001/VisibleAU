import { desc, eq, inArray } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { audits, brands, googleSurfaceResults, organizations } from "@/db/schema";
import { GOOGLE_SURFACE_NAMES, type GoogleSurface } from "@/lib/governance/google-surfaces";
import { GOOGLE_PROVIDER_ERROR_LABELS } from "@/lib/serp/dataforseo-errors";
import { googleRowErrorCategory } from "./reasons";

/**
 * Google AI follow-ups (12 Nov), part 2 -- what the operator sees of the provider's problems, on
 * /admin/settings only (lib/auth/platform-admin.ts checks who that is before this is read). Unlike every
 * customer surface, this is the stored reason as it is: the provider's code and its own message.
 */

export interface GoogleProviderErrorEntry {
  id: string;
  at: string;
  auditNumber: number | null;
  workspace: string | null;
  brand: string | null;
  surface: string;
  /** The provider's status code; null when it didn't answer at all. */
  code: number | null;
  /** "login rejected", "timed out", ... */
  category: string;
  /** The stored reason: the provider's own message, as it answered. */
  message: string | null;
}

/** Everything the operator's page shows about the provider's health (part 3 adds the last run). */
export interface GoogleOperatorHealth {
  providerErrors: GoogleProviderErrorEntry[];
}

export async function loadGoogleOperatorHealth(): Promise<GoogleOperatorHealth> {
  return { providerErrors: await loadRecentGoogleProviderErrors() };
}

/** The latest questions the provider failed (or that were stopped because of it), every workspace. */
export async function loadRecentGoogleProviderErrors(
  limit = 10,
): Promise<GoogleProviderErrorEntry[]> {
  const rows = await serviceDb
    .select({
      id: googleSurfaceResults.id,
      at: googleSurfaceResults.updatedAt,
      outcome: googleSurfaceResults.outcome,
      surface: googleSurfaceResults.surface,
      code: googleSurfaceResults.providerStatusCode,
      message: googleSurfaceResults.outcomeReason,
      auditNumber: audits.auditNumber,
      brand: brands.name,
      workspace: organizations.name,
    })
    .from(googleSurfaceResults)
    .leftJoin(audits, eq(audits.id, googleSurfaceResults.auditId))
    .leftJoin(brands, eq(brands.id, audits.brandId))
    .leftJoin(organizations, eq(organizations.id, googleSurfaceResults.organizationId))
    .where(inArray(googleSurfaceResults.outcome, ["failed", "not_completed"]))
    .orderBy(desc(googleSurfaceResults.updatedAt))
    .limit(limit * 4);
  return rows
    .map((r) => {
      const category = googleRowErrorCategory({
        outcome: r.outcome,
        providerStatusCode: r.code,
        outcomeReason: r.message,
      });
      return category
        ? {
            id: r.id,
            at: r.at.toISOString(),
            auditNumber: r.auditNumber,
            workspace: r.workspace,
            brand: r.brand,
            surface: GOOGLE_SURFACE_NAMES[r.surface as GoogleSurface] ?? r.surface,
            code: r.code,
            category: GOOGLE_PROVIDER_ERROR_LABELS[category],
            message: r.message,
          }
        : null;
    })
    .filter((e): e is GoogleProviderErrorEntry => e !== null)
    .slice(0, limit);
}
