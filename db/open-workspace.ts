import { type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { brands } from "@/db/schema/brands";
import { organizations } from "@/db/schema/organizations";

/**
 * Only rows of an open workspace: `orgIdColumn` (an organization_id) is
 * one whose `organizations.deleted_at` isn't set. A closed workspace counts
 * as absent everywhere -- its account can't open it (getCurrentUser), and
 * the crons that walk every organisation's brands, schedules and
 * preferences skip it. Nothing closes a workspace in-app yet; a prod-fix
 * does (e.g. db/prod-fixes/0104).
 */
export function inOpenWorkspace(orgIdColumn: AnyPgColumn): SQL {
  return sql`${orgIdColumn} IN (SELECT ${organizations.id} FROM ${organizations} WHERE ${organizations.deletedAt} IS NULL)`;
}

/**
 * Team follow-ups (31 Oct), item 7 -- only brands still there: not deleted (deleting a brand sets
 * brands.deleted_at; DELETE /api/brands/[brandId]), in an open workspace. Every cron and fan-out that walks
 * brands reads this, or ofLiveBrand() for rows that belong to a brand, so a deleted brand gets no audits,
 * reports, digests or checks -- and deleting one also pauses its schedules.
 */
export function liveBrandsOnly(): SQL {
  return sql`${brands.deletedAt} IS NULL AND ${inOpenWorkspace(brands.organizationId)}`;
}

/** Only rows of a live brand (liveBrandsOnly): `brandIdColumn` (a brand_id) is one. */
export function ofLiveBrand(brandIdColumn: AnyPgColumn): SQL {
  return sql`${brandIdColumn} IN (SELECT ${brands.id} FROM ${brands} WHERE ${liveBrandsOnly()})`;
}
