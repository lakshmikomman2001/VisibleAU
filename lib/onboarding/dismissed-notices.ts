import { eq, sql } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { organizations } from "@/db/schema";

/**
 * Overview (7 Nov), item 4: a notice a person has dismissed stays dismissed for that person -- on any
 * device -- and only for them. Stored in the workspace row's metadata (where the product tour's
 * "complete" flag already lives), under dismissedNotices["<user id>/<notice>"] = when, so no
 * migration is needed and a teammate still sees it. A user row belongs to one workspace
 * (users.organization_id), so the key can't collide across workspaces.
 */

/** The Overview's Health Check banner for one brand. */
export function healthCheckBannerNotice(brandId: string): string {
  return `health-check-banner:${brandId}`;
}

function noticeKey(userId: string, notice: string): string {
  return `${userId}/${notice}`;
}

export function isNoticeDismissed(
  organizationMetadata: unknown,
  userId: string,
  notice: string,
): boolean {
  if (typeof organizationMetadata !== "object" || organizationMetadata === null) return false;
  const dismissed = (organizationMetadata as { dismissedNotices?: unknown }).dismissedNotices;
  if (typeof dismissed !== "object" || dismissed === null) return false;
  return noticeKey(userId, notice) in dismissed;
}

/** One UPDATE that merges the key in, so two people dismissing at once can't overwrite each other. */
export async function dismissNotice(
  organizationId: string,
  userId: string,
  notice: string,
  now: Date = new Date(),
): Promise<void> {
  const entry = sql`jsonb_build_object(${noticeKey(userId, notice)}::text, ${now.toISOString()}::text)`;
  await serviceDb
    .update(organizations)
    .set({
      metadata: sql`${organizations.metadata} || jsonb_build_object('dismissedNotices', COALESCE(${organizations.metadata} -> 'dismissedNotices', '{}'::jsonb) || ${entry})`,
    })
    .where(eq(organizations.id, organizationId));
}
