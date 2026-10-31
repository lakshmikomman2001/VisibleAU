import { type SQL, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
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
