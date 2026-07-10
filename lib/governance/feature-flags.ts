import { and, eq } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { orgFeatureFlags } from "@/db/schema";

export const CANONICAL_FLAG_KEYS = [
  "free_tier_enabled",
  "growth_tier_early_access",
  "agency_tier_early_access",
  "fan_out_enabled",
  "linkedin_audit_enabled",
  "youtube_audit_enabled",
  "evidence_archive_enabled",
  "google_ai_mode_enabled",
] as const;

export type CanonicalFlagKey = (typeof CANONICAL_FLAG_KEYS)[number];

export async function getOrgFlag(
  organizationId: string,
  flagKey: string,
): Promise<boolean | null> {
  const [flag] = await serviceDb
    .select({ isEnabled: orgFeatureFlags.isEnabled, expiresAt: orgFeatureFlags.expiresAt })
    .from(orgFeatureFlags)
    .where(
      and(
        eq(orgFeatureFlags.organizationId, organizationId),
        eq(orgFeatureFlags.flagKey, flagKey),
      ),
    );

  if (!flag) return null;
  if (flag.expiresAt && flag.expiresAt < new Date()) return null;
  return flag.isEnabled;
}

export async function getOrgFlags(
  organizationId: string,
): Promise<Record<string, boolean>> {
  const flags = await serviceDb
    .select({
      flagKey: orgFeatureFlags.flagKey,
      isEnabled: orgFeatureFlags.isEnabled,
      expiresAt: orgFeatureFlags.expiresAt,
    })
    .from(orgFeatureFlags)
    .where(eq(orgFeatureFlags.organizationId, organizationId));

  const result: Record<string, boolean> = {};
  for (const f of flags) {
    if (f.expiresAt && f.expiresAt < new Date()) continue;
    result[f.flagKey] = f.isEnabled;
  }
  return result;
}
