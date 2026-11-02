import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { type AgencyBrandAsset, agencyBrandAssets } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/current-user";
import { canPerformAction, getMemberRecord, type OrgRole } from "@/lib/governance/access-control";
import { isOwnStoredLogo } from "./logo";

/**
 * 2 Nov ("where does Sri set the agency name and logo for the report
 * cover?", part 3) -- reading and saving agency_brand_assets: a
 * workspace's report branding (brand_id IS NULL) and per-brand overrides.
 *
 * One workspace-wide row per workspace. Its unique index on
 * (organization_id, brand_id) treats NULL brand_ids as distinct, so the old
 * /agency/branding save added a row each time and every reader took
 * whichever came first. Now a save updates the newest row in place (under a
 * per-workspace lock), every reader takes the newest -- the same row,
 * whether or not old duplicates are still there -- and migration 0114 adds
 * a partial unique index.
 */

export type AgencyAssetRow = AgencyBrandAsset;

/** The branding fields Settings -> Report branding edits, per scope. */
export interface BrandingFields {
  agencyName: string | null;
  logoUrl: string | null;
  footerText: string | null;
  contactLine: string | null;
}

/** The client portal's and the audit export's colours: workspace-wide only. */
export interface BrandingColours {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
}

export const BRANDING_FORBIDDEN = "Only owners and admins can change report branding";

/** Owners and admins (RBAC manage_branding) -- the server's own check, wherever branding changes. */
export async function canManageBranding(currentUser: CurrentUser): Promise<boolean> {
  const member = await getMemberRecord(currentUser.organizationId, currentUser.id);
  const role = (member?.role ?? currentUser.role ?? "viewer") as OrgRole;
  return canPerformAction(role, "manage_branding");
}

export const BRANDING_FIELDS = ["agencyName", "logoUrl", "footerText", "contactLine"] as const;
export const BRANDING_COLOURS = ["primaryColor", "secondaryColor", "accentColor"] as const;

/** The workspace-wide row (the newest, while duplicates may remain) and, when asked, a brand's own row. */
export async function loadAgencyAssetRows(
  db: DbClient,
  organizationId: string,
  brandId: string | null = null,
): Promise<{ workspace: AgencyAssetRow | null; brand: AgencyAssetRow | null }> {
  const rows = await db
    .select()
    .from(agencyBrandAssets)
    .where(
      and(
        eq(agencyBrandAssets.organizationId, organizationId),
        brandId
          ? or(isNull(agencyBrandAssets.brandId), eq(agencyBrandAssets.brandId, brandId))
          : isNull(agencyBrandAssets.brandId),
      ),
    )
    .orderBy(desc(agencyBrandAssets.updatedAt), desc(agencyBrandAssets.id));
  return {
    workspace: rows.find((r) => r.brandId === null) ?? null,
    brand: brandId ? (rows.find((r) => r.brandId === brandId) ?? null) : null,
  };
}

function clean(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

/**
 * The client portal's and the audit export's theme input: the brand's own
 * value first, then the workspace's, for each text field (as the report
 * PDF does -- lib/reports/agency-branding.ts); the colours are the
 * workspace's, since a brand row's colour columns always hold defaults.
 */
export function themeAssetFrom(
  brand: AgencyAssetRow | null,
  workspace: AgencyAssetRow | null,
): (BrandingFields & Partial<BrandingColours>) | null {
  if (!brand && !workspace) return null;
  const pick = (field: (typeof BRANDING_FIELDS)[number]) =>
    clean(brand?.[field]) ?? clean(workspace?.[field]);
  const colours = workspace ?? brand;
  return {
    agencyName: pick("agencyName"),
    logoUrl: pick("logoUrl"),
    footerText: pick("footerText"),
    contactLine: pick("contactLine"),
    primaryColor: colours?.primaryColor,
    secondaryColor: colours?.secondaryColor,
    accentColor: colours?.accentColor,
  };
}

/**
 * Whether a logo URL may be saved on a branding row: none, a logo this
 * workspace uploaded, or the value that's already saved there (a web
 * address set before uploads existed stays until it's replaced).
 */
export function logoUrlAllowed(
  logoUrl: string | null,
  organizationId: string,
  current: string | null,
): boolean {
  return logoUrl === null || logoUrl === current || isOwnStoredLogo(logoUrl, organizationId);
}

/** The newest row of one scope -- the workspace's, or one brand's. */
async function currentRow(
  tx: DbClient,
  organizationId: string,
  brandId: string | null,
): Promise<AgencyAssetRow | null> {
  const [row] = await tx
    .select()
    .from(agencyBrandAssets)
    .where(
      and(
        eq(agencyBrandAssets.organizationId, organizationId),
        brandId ? eq(agencyBrandAssets.brandId, brandId) : isNull(agencyBrandAssets.brandId),
      ),
    )
    .orderBy(desc(agencyBrandAssets.updatedAt), desc(agencyBrandAssets.id))
    .limit(1);
  return row ?? null;
}

/** The scope's newest row, for checking a save against what's saved. */
export async function loadScopeRow(
  db: DbClient,
  organizationId: string,
  brandId: string | null,
): Promise<AgencyAssetRow | null> {
  return currentRow(db, organizationId, brandId);
}

/**
 * Saves one scope's branding (and, for the workspace, its colours) in
 * place: updates the newest row of that scope, or adds it if there's none.
 * A transaction-scoped advisory lock per workspace and scope stops two
 * saves at once from both adding a row. Returns the row and the fields that
 * changed (empty: nothing to save, nothing written).
 */
export async function saveAgencyBranding(
  tx: DbClient,
  input: {
    organizationId: string;
    brandId: string | null;
    fields: BrandingFields;
    colours?: Partial<BrandingColours>;
  },
): Promise<{ row: AgencyAssetRow; changed: string[] }> {
  const { organizationId, brandId, fields, colours = {} } = input;
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`agency_brand_assets:${organizationId}:${brandId ?? "workspace"}`}))`,
  );
  const current = await currentRow(tx, organizationId, brandId);
  const next: Partial<BrandingFields & BrandingColours> = { ...fields };
  for (const key of BRANDING_COLOURS) {
    const colour = colours[key];
    if (colour) next[key] = colour;
  }
  const changed = (Object.keys(next) as Array<keyof typeof next>).filter(
    (key) => (current?.[key] ?? null) !== (next[key] ?? null),
  );

  if (current) {
    if (changed.length === 0) return { row: current, changed };
    const [row] = await tx
      .update(agencyBrandAssets)
      .set({ ...next, updatedAt: new Date() })
      .where(eq(agencyBrandAssets.id, current.id))
      .returning();
    return { row, changed };
  }
  const [row] = await tx
    .insert(agencyBrandAssets)
    .values({ organizationId, brandId, ...next })
    .returning();
  return { row, changed };
}

/** Removes a brand's override; that brand then uses the workspace's branding. */
export async function removeBrandOverride(
  tx: DbClient,
  organizationId: string,
  brandId: string,
): Promise<number> {
  const removed = await tx
    .delete(agencyBrandAssets)
    .where(
      and(
        eq(agencyBrandAssets.organizationId, organizationId),
        eq(agencyBrandAssets.brandId, brandId),
      ),
    )
    .returning({ id: agencyBrandAssets.id });
  return removed.length;
}
