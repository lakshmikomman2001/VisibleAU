import { serviceDb } from "@/db/client";
import { auditTrail } from "@/db/schema";

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
  | "member_removed";

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
  | "data_residency";

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
  await serviceDb.insert(auditTrail).values({
    organizationId: params.organizationId,
    userId: params.userId ?? null,
    action: params.action,
    resourceType: params.resourceType,
    resourceId: params.resourceId ?? null,
    metadata: params.metadata ?? null,
    ipAddress: params.ip ?? null,
    userAgent: params.userAgent ?? null,
  });
}
