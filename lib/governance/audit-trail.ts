import { eq } from "drizzle-orm";
import { serviceDb } from "@/db/client";
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
  | "report_branding_changed";

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
  | "report_branding";

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

export async function recordAction(params: RecordActionParams): Promise<void> {
  // The actor's own profile, by its id: the name it acted under.
  const [actor] = params.userId
    ? await serviceDb.select({ name: users.name }).from(users).where(eq(users.id, params.userId))
    : [];
  const metadata = actor?.name
    ? { ...(params.metadata ?? {}), [ACTOR_NAME_KEY]: actor.name }
    : (params.metadata ?? null);
  await serviceDb.insert(auditTrail).values({
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
