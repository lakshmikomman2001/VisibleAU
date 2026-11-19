import { type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { brands } from "@/db/schema/brands";
import { organizations } from "@/db/schema/organizations";
import { SAMPLE_ORG_SLUG } from "@/lib/sample-audit/sample-org-slug";

/**
 * Only rows of an open workspace: `orgIdColumn` (an organization_id) is
 * one whose `organizations.deleted_at` isn't set. A closed workspace counts
 * as absent everywhere -- its account can't open it (getCurrentUser), and
 * the crons that walk every organisation's brands, schedules and
 * preferences skip it. Nothing closes a workspace in-app yet; a prod-fix
 * does (e.g. db/prod-fixes/0104).
 *
 * 20 Nov (part 9): nor is the free sample's system workspace (SAMPLE_ORG_SLUG, no members, a visitor's domain per
 * brand) one: the brand-walking crons (YouTube, web mentions, LinkedIn, consensus, classification), the public badge,
 * the visit beacon, schedules, reports and digests all read this, and none may touch it. The sample's own pages find it
 * by its slug.
 */
export function inOpenWorkspace(orgIdColumn: AnyPgColumn): SQL {
  return sql`${orgIdColumn} IN (SELECT ${organizations.id} FROM ${organizations} WHERE ${organizations.deletedAt} IS NULL AND ${notTheSampleWorkspace()})`;
}

/** The workspace isn't the free sample's (organizations.slug IS DISTINCT FROM it: a customer's slug is null). */
export function notTheSampleWorkspace(): SQL {
  return sql`${organizations.slug} IS DISTINCT FROM ${SAMPLE_ORG_SLUG}`;
}

/** The same, for a query that doesn't join organizations: `orgIdColumn` isn't the sample workspace's id. */
export function notInTheSampleWorkspace(orgIdColumn: AnyPgColumn): SQL {
  return sql`${orgIdColumn} NOT IN (SELECT ${organizations.id} FROM ${organizations} WHERE ${organizations.slug} = ${SAMPLE_ORG_SLUG})`;
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
