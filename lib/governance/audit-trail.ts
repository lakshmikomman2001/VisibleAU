import { eq } from "drizzle-orm";
import { type DbClient, serviceDb } from "@/db/client";
import { auditTrail, users } from "@/db/schema";

/**
 * Follow-ups from 6e27afc..01a6a8c, part 1 -- the actor's name as it was when they acted, kept with the
 * entry (in its metadata, under this key). A workspace sees only the profiles that are in it (RLS,
 * users_org_select), so once someone leaves -- removed, then moved to a workspace of their own -- the
 * trail could no longer name them, and showed their actions as "System". The API reads it back as the
 * actor's name and takes it out of the metadata it returns.
 */
export const ACTOR_NAME_KEY = "actorName";

export type AuditAction =
  | "audit_triggered"
  | "recommendation_dismissed"
  | "task_completed"
  | "report_generated"
  | "brand_deleted"
  | "member_invited"
  | "tier_changed"
  | "linkedin_audit_triggered"
  | "consensus_check_triggered"
  | "draft_approved"
  | "draft_dismissed"
  | "journey_triggered"
  | "hallucination_acknowledged"
  | "feature_flag_changed"
  | "data_residency_accessed"
  | "competitive_benchmark_viewed"
  | "member_role_changed"
  | "member_removed"
  | "directory_listing_confirmed"
  /** 2 Nov: Account -> Report branding saved, or a brand's override removed. */
  | "report_branding_changed"
  /** S01 part 11 (LLD 8.8.6): a brand's ABN set or changed in brand settings, or a suggested ABN confirmed. */
  | "brand_abn_changed"
  /**
   * 15 Nov, part 3 (Sri's decision): Vunnara excluded one of the workspace's audits from trends, included it
   * again, or changed why (lib/admin/trend-exclusions.ts). metadata.summary is the sentence the trail shows:
   * "Vunnara excluded audit #46 from trends: measured with an earlier version of the mention check".
   */
  | "trend_exclusion_changed"
  /** S03 part 3 (LLD 8.3.1): a brand's new question set applied (metadata: version, fromVersion, added, removed). */
  | "brand_questions_applied"
  /** S03 part 3 (LLD 8.3.7): a question archived from a brand's library (metadata: questionId). */
  | "brand_question_archived"
  /** S03 part 5 (LLD 8.3.4): the workspace's question defaults for new brands changed (metadata: the new values). */
  | "question_defaults_changed"
  /** S03 part 5 (LLD 8.3.4): questions copied from another brand into a brand's library as suggestions. */
  | "brand_questions_copied"
  /** S04 part 6 (LLD 8.4.7): a brand's reaches changed in brand settings (metadata: reaches with their targets). */
  | "brand_reaches_changed";

export type AuditResourceType =
  | "audit"
  | "recommendation"
  | "task"
  | "report"
  | "brand"
  | "member"
  | "subscription"
  | "content_draft"
  | "journey"
  | "hallucination_incident"
  | "feature_flag"
  | "competitive_benchmark"
  | "org_member"
  | "data_residency"
  | "directory_listing"
  | "report_branding"
  /** S03 part 5: the workspace's question settings. */
  | "question_settings";

export interface RecordActionParams {
  organizationId: string;
  userId?: string | null;
  action: AuditAction;
  resourceType: AuditResourceType;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

/**
 * Writes one entry to the workspace's audit trail. `db` is the connection to write it on: by default the service
 * connection; 15 Nov, part 3: a caller already in a transaction under the workspace's RLS context
 * (withRlsContext) passes it, so the entry is written with that change, through the workspace's own insert policy
 * (audit_trail_org_insert), no bypass.
 */
export async function recordAction(
  params: RecordActionParams,
  db: DbClient = serviceDb,
): Promise<void> {
  // The actor's own profile, by its id: the name it acted under.
  const [actor] = params.userId
    ? await db.select({ name: users.name }).from(users).where(eq(users.id, params.userId))
    : [];
  const metadata = actor?.name
    ? { ...(params.metadata ?? {}), [ACTOR_NAME_KEY]: actor.name }
    : (params.metadata ?? null);
  await db.insert(auditTrail).values({
    organizationId: params.organizationId,
    userId: params.userId ?? null,
    action: params.action,
    resourceType: params.resourceType,
    resourceId: params.resourceId ?? null,
    metadata,
    ipAddress: params.ip ?? null,
    userAgent: params.userAgent ?? null,
  });
}
