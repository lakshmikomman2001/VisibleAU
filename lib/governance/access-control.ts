import { eq, and } from "drizzle-orm";
import { serviceDb, withRlsContext } from "@/db/client";
import { orgMembers, subscriptions, users } from "@/db/schema";
import type { CurrentUser } from "@/lib/auth/current-user";
import { isTierAtLeast } from "@/lib/brands";

export type OrgRole = "owner" | "admin" | "analyst" | "viewer";

export type PermissionAction =
  | "run_audit"
  | "create_edit_tasks"
  | "approve_drafts"
  | "view_reports"
  | "view_audit_trail"
  | "generate_reports"
  | "edit_report_templates"
  | "invite_members"
  | "change_member_role"
  | "assign_owner_role"
  | "remove_member"
  | "delete_brand";

const RBAC_MATRIX: Record<PermissionAction, OrgRole[]> = {
  run_audit: ["owner", "admin", "analyst"],
  create_edit_tasks: ["owner", "admin", "analyst"],
  approve_drafts: ["owner", "admin"],
  view_reports: ["owner", "admin", "analyst", "viewer"],
  view_audit_trail: ["owner", "admin", "analyst"],
  generate_reports: ["owner", "admin", "analyst"],
  edit_report_templates: ["owner", "admin"],
  invite_members: ["owner", "admin"],
  change_member_role: ["owner", "admin"],
  assign_owner_role: ["owner"],
  remove_member: ["owner", "admin"],
  delete_brand: ["owner"],
};

export function canPerformAction(role: OrgRole, action: PermissionAction): boolean {
  return RBAC_MATRIX[action]?.includes(role) ?? false;
}

export function canAssignRole(actorRole: OrgRole, targetRole: OrgRole): boolean {
  if (targetRole === "owner") return actorRole === "owner";
  if (actorRole === "owner") return true;
  if (actorRole === "admin") return targetRole !== "owner";
  return false;
}

export function canActOnMember(actorRole: OrgRole, targetRole: OrgRole): boolean {
  if (actorRole === "owner") return true;
  if (actorRole === "admin") return targetRole !== "owner";
  return false;
}

export async function getMemberRecord(
  organizationId: string,
  userId: string,
): Promise<{ role: OrgRole; brandAccess: string[] | null } | null> {
  const [member] = await serviceDb
    .select({
      role: orgMembers.role,
      brandAccess: orgMembers.brandAccess,
    })
    .from(orgMembers)
    .where(
      and(
        eq(orgMembers.organizationId, organizationId),
        eq(orgMembers.userId, userId),
        eq(orgMembers.isActive, true),
      ),
    );

  if (!member) return null;
  return { role: member.role as OrgRole, brandAccess: member.brandAccess };
}

export async function assertBrandAccess(
  user: CurrentUser,
  brandId: string,
): Promise<void> {
  const userRole = user.role as OrgRole;
  if (userRole === "owner" || userRole === "admin") {
    const member = await getMemberRecord(user.organizationId, user.id);
    if (!member || member.brandAccess === null) return;
    if (member.brandAccess.includes(brandId)) return;
    throw new BrandAccessDeniedError();
  }

  const member = await getMemberRecord(user.organizationId, user.id);
  if (!member) return;
  if (member.brandAccess === null) return;
  if (member.brandAccess.includes(brandId)) return;
  throw new BrandAccessDeniedError();
}

export class BrandAccessDeniedError extends Error {
  constructor() {
    super("Brand access denied");
    this.name = "BrandAccessDeniedError";
  }
}

export class TierInsufficientError extends Error {
  public readonly requiredTier: string;
  constructor(requiredTier: string) {
    super(`${requiredTier} plan required`);
    this.name = "TierInsufficientError";
    this.requiredTier = requiredTier;
  }
}

export async function assertTier(
  organizationId: string,
  requiredTier: string,
): Promise<void> {
  const [sub] = await withRlsContext(organizationId, (tx) =>
    tx
      .select({ tier: subscriptions.tier })
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, organizationId))
      .limit(1),
  );
  const tier = sub?.tier ?? "free";
  if (!isTierAtLeast(tier, requiredTier)) {
    throw new TierInsufficientError(requiredTier);
  }
}
