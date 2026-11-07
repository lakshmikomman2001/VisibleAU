/**
 * Who may do what in a workspace: the role-by-action matrix every server check reads
 * (lib/governance/access-control.ts roleRefusal) and the UI hides controls by
 * (components/domain/role-context.tsx). No imports: client components read it too.
 *
 * The Team page's role chips say what each role is for: Owner "Full access, billing";
 * Admin "Manage brands & team"; Analyst "Run audits, view reports"; Viewer "Read-only
 * access".
 *
 * Team follow-ups (31 Oct), item 6 -- every route that changes a workspace's data reads
 * one of these. A viewer changes nothing shared. Where the chips name an action (brands
 * and the team: admin; billing: owner; audits and reports: analyst) they decide; where
 * they don't (schedules, integrations, content, a brand's data), analysts keep the access
 * they had, pending Sri's decision.
 */

export type OrgRole = "owner" | "admin" | "analyst" | "viewer";

export const ORG_ROLES: readonly OrgRole[] = ["owner", "admin", "analyst", "viewer"];

export function isOrgRole(value: unknown): value is OrgRole {
  return typeof value === "string" && (ORG_ROLES as readonly string[]).includes(value);
}

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
  | "delete_brand"
  /** Upload a logo; change the report branding (agency name, logo, footer). */
  | "manage_branding"
  /** Add a brand, change its settings or its classification. Admin "Manage brands". */
  | "manage_brands"
  /** Checkout, the billing portal, downgrading. Owner "Full access, billing". */
  | "manage_billing"
  /** Audit schedules and report delivery schedules. */
  | "manage_schedules"
  /** Webhooks, GA4, client-portal invites. */
  | "manage_integrations"
  /** Content drafts, answer capsules, llms.txt, journeys: generated with the LLMs. */
  | "generate_content"
  /** A brand's own data: directory listings, crawler logs, referrals, reviewing a hallucination. */
  | "edit_brand_data";

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
  manage_branding: ["owner", "admin"],
  manage_brands: ["owner", "admin"],
  manage_billing: ["owner"],
  manage_schedules: ["owner", "admin", "analyst"],
  manage_integrations: ["owner", "admin", "analyst"],
  generate_content: ["owner", "admin", "analyst"],
  edit_brand_data: ["owner", "admin", "analyst"],
};

/** What each action is, in a sentence's words ("Only an owner or admin can <these words>."). */
const ACTION_WORDS: Record<PermissionAction, string> = {
  run_audit: "run audits",
  create_edit_tasks: "add or change tasks",
  approve_drafts: "approve drafts",
  view_reports: "view reports",
  view_audit_trail: "view the audit trail",
  generate_reports: "generate reports",
  edit_report_templates: "edit report templates",
  invite_members: "invite people to the team",
  change_member_role: "change someone's role",
  assign_owner_role: "make someone an owner",
  remove_member: "remove someone from the team",
  delete_brand: "delete a brand",
  manage_branding: "change the report branding",
  manage_brands: "add a brand or change its settings",
  manage_billing: "manage billing",
  manage_schedules: "change schedules",
  manage_integrations: "change integrations",
  generate_content: "generate content",
  edit_brand_data: "change a brand's data",
};

export function canPerformAction(role: OrgRole, action: PermissionAction): boolean {
  return RBAC_MATRIX[action]?.includes(role) ?? false;
}

/** The roles that may do `action`, owner first. */
export function rolesAllowed(action: PermissionAction): readonly OrgRole[] {
  return RBAC_MATRIX[action];
}

/** "Only an owner, admin or analyst can generate reports." -- what a refusal says, and a disabled control's tooltip. */
export function refusalMessage(action: PermissionAction): string {
  const roles = RBAC_MATRIX[action];
  const listed =
    roles.length === 1
      ? roles[0]
      : `${roles.slice(0, -1).join(", ")} or ${roles[roles.length - 1]}`;
  const article = /^[aeiou]/.test(listed) ? "an" : "a";
  return `Only ${article} ${listed} can ${ACTION_WORDS[action]}.`;
}

export function canAssignRole(actorRole: OrgRole, targetRole: OrgRole): boolean {
  if (targetRole === "owner") return actorRole === "owner";
  if (actorRole === "owner") return true;
  // targetRole is already narrowed to exclude "owner" by the early return above.
  if (actorRole === "admin") return true;
  return false;
}

export function canActOnMember(actorRole: OrgRole, targetRole: OrgRole): boolean {
  if (actorRole === "owner") return true;
  if (actorRole === "admin") return targetRole !== "owner";
  return false;
}
