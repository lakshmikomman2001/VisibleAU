/**
 * Who may do what in a workspace: the role-by-action matrix every server check reads
 * (lib/governance/access-control.ts roleRefusal), the UI hides controls by
 * (components/domain/role-context.tsx), and every description of a role is written from
 * (roleDescription: the Team page's legend, the invite form). No imports: client components
 * read it too.
 *
 * Team follow-ups (31 Oct), item 6 -- every route that changes a workspace's data reads one of
 * these, and a viewer changes nothing shared. Sri's decisions (8 Nov): analysts don't add,
 * edit or classify brands; only the owner deletes one; integrations (webhooks, GA4, client
 * portals), the workspace's email settings and marking its onboarding complete are for owners
 * and admins; schedules, content and a brand's data stay with analysts too.
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
  /** Webhooks, GA4, client-portal invites: what sends the workspace's data, or its reports, outside it. */
  | "manage_integrations"
  /** The workspace's email settings: which alerts go out, and where the weekly digest goes. */
  | "manage_notifications"
  /** Marking the workspace's onboarding complete (a person's own tour isn't this). */
  | "complete_onboarding"
  /** Content drafts, answer capsules, llms.txt, journeys: generated with the LLMs. */
  | "generate_content"
  /** A brand's own data: directory listings, crawler logs, referrals, reviewing a hallucination. */
  | "edit_brand_data";

/** In the order the role descriptions list them. */
const RBAC_MATRIX: Record<PermissionAction, OrgRole[]> = {
  view_reports: ["owner", "admin", "analyst", "viewer"],
  run_audit: ["owner", "admin", "analyst"],
  generate_reports: ["owner", "admin", "analyst"],
  create_edit_tasks: ["owner", "admin", "analyst"],
  generate_content: ["owner", "admin", "analyst"],
  edit_brand_data: ["owner", "admin", "analyst"],
  manage_schedules: ["owner", "admin", "analyst"],
  view_audit_trail: ["owner", "admin", "analyst"],
  manage_brands: ["owner", "admin"],
  approve_drafts: ["owner", "admin"],
  edit_report_templates: ["owner", "admin"],
  manage_branding: ["owner", "admin"],
  manage_integrations: ["owner", "admin"],
  manage_notifications: ["owner", "admin"],
  complete_onboarding: ["owner", "admin"],
  invite_members: ["owner", "admin"],
  change_member_role: ["owner", "admin"],
  remove_member: ["owner", "admin"],
  delete_brand: ["owner"],
  manage_billing: ["owner"],
  assign_owner_role: ["owner"],
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
  manage_notifications: "change the workspace's email settings",
  complete_onboarding: "mark the workspace's onboarding complete",
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

/** "a, b and c". */
function listed(items: readonly string[]): string {
  return items.length < 2
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * "an owner", "an admin", "an analyst", "a viewer" -- live invite test follow-ups (8 Nov), part 4: the one
 * helper wherever a role follows "as" (the invite email, the invite sign-up, the invite page) or a list of
 * roles needs its article ("Only an owner, admin or analyst can ...").
 */
export function withArticle(word: string): string {
  return `${/^[aeiou]/.test(word) ? "an" : "a"} ${word}`;
}

/**
 * "Only an owner, admin or analyst can generate reports." -- what a refusal says, and a disabled control's
 * tooltip. An owner-only action says "Only the owner can delete a brand." (Sri, 8 Nov).
 */
export function refusalMessage(action: PermissionAction): string {
  const roles = RBAC_MATRIX[action];
  const who =
    roles.length === 1 && roles[0] === "owner"
      ? "the owner"
      : withArticle(
          roles.length === 1
            ? roles[0]
            : `${roles.slice(0, -1).join(", ")} or ${roles[roles.length - 1]}`,
        );
  return `Only ${who} can ${ACTION_WORDS[action]}.`;
}

export const ROLE_NAMES: Record<OrgRole, string> = {
  owner: "Owner",
  admin: "Admin",
  analyst: "Analyst",
  viewer: "Viewer",
};

/** The role each one builds on: a description says what a role adds to the one below it. */
const ROLE_BELOW: Record<OrgRole, OrgRole | null> = {
  owner: "admin",
  admin: "analyst",
  analyst: "viewer",
  viewer: null,
};

const ACTIONS = Object.keys(RBAC_MATRIX) as PermissionAction[];

/** Actions that change nothing: a role with only these is read-only. */
const VIEWING: ReadonlySet<PermissionAction> = new Set(["view_reports", "view_audit_trail"]);

/**
 * What a role can do, written from the matrix for every place the app describes roles (the Team page,
 * the invite form), so a description can't promise what the server refuses (Sri, 8 Nov):
 * "Can view reports. Can't change anything." / "Everything a viewer can, and: run audits, ...".
 */
export function roleDescription(role: OrgRole): string {
  const allowed = ACTIONS.filter((a) => canPerformAction(role, a));
  const words = (actions: PermissionAction[]) => listed(actions.map((a) => ACTION_WORDS[a]));
  if (allowed.every((a) => VIEWING.has(a))) return `Can ${words(allowed)}. Can't change anything.`;
  const below = ROLE_BELOW[role];
  if (below && ACTIONS.every((a) => !canPerformAction(below, a) || canPerformAction(role, a))) {
    const added = allowed.filter((a) => !canPerformAction(below, a));
    return `Everything ${withArticle(below)} can, and: ${words(added)}.`;
  }
  return `Can ${words(allowed)}.`;
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
