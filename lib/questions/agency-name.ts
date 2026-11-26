import { eq } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { organizations } from "@/db/schema";
import { loadAgencyAssetRows } from "@/lib/branding/agency-assets";

/**
 * S03 parts 4 and 6 (contract P02.row "Written by {agencyName}", P03.label, P07.mix): who wrote a brand's agency-written
 * questions, by name -- the agency name in report branding (the brand's own, then the workspace's), else the
 * workspace's own name. S02 printed "Written by your agency" until this bound the name.
 */
export async function questionAgencyName(
  db: DbClient,
  organizationId: string,
  brandId: string,
): Promise<string> {
  const { brand, workspace } = await loadAgencyAssetRows(db, organizationId, brandId);
  const branded = brand?.agencyName?.trim() || workspace?.agencyName?.trim();
  if (branded) return branded;
  const [org] = await db
    .select({ name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, organizationId));
  return org?.name?.trim() || "your agency";
}
