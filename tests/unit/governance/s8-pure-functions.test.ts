import { describe, expect, it } from "vitest";
import {
  canPerformAction,
  canAssignRole,
  canActOnMember,
} from "@/lib/governance/access-control";
import type { OrgRole, PermissionAction } from "@/lib/governance/access-control";
import {
  TIER_RANK,
  TIER_SEAT_LIMITS,
  TIER_BRAND_LIMITS,
  isTierAtLeast,
} from "@/lib/brands";
import {
  PROVIDER_DISPLAY,
  REGION_LABELS,
} from "@/components/domain/governance/residency-table";

// ---------------------------------------------------------------------------
// 1.1 — Tier math (lib/brands/index.ts)
// ---------------------------------------------------------------------------
describe("TIER_RANK", () => {
  it("encodes strict ordering: free < starter < growth < agency < agency_pro < enterprise", () => {
    const ordered = ["free", "starter", "growth", "agency", "agency_pro", "enterprise"];
    for (let i = 0; i < ordered.length - 1; i++) {
      expect(TIER_RANK[ordered[i]]).toBeLessThan(TIER_RANK[ordered[i + 1]]);
    }
  });

  it("has canon numeric values", () => {
    expect(TIER_RANK).toEqual({
      free: 0,
      starter: 1,
      growth: 2,
      agency: 3,
      agency_pro: 4,
      enterprise: 5,
    });
  });
});

describe("TIER_SEAT_LIMITS", () => {
  it("matches Sri's seat decision: free/starter/growth=1, agency=5, agency_pro=15, enterprise=Infinity", () => {
    expect(TIER_SEAT_LIMITS.free).toBe(1);
    expect(TIER_SEAT_LIMITS.starter).toBe(1);
    expect(TIER_SEAT_LIMITS.growth).toBe(1);
    expect(TIER_SEAT_LIMITS.agency).toBe(5);
    expect(TIER_SEAT_LIMITS.agency_pro).toBe(15);
    expect(TIER_SEAT_LIMITS.enterprise).toBe(Infinity);
  });
});

describe("isTierAtLeast", () => {
  it.each([
    ["growth", "agency", false],
    ["agency", "agency", true],
    ["agency_pro", "agency", true],
    ["enterprise", "agency", true],
    ["free", "starter", false],
    ["starter", "free", true],
    ["free", "free", true],
    ["enterprise", "free", true],
    ["free", "enterprise", false],
  ] as const)("isTierAtLeast('%s', '%s') → %s", (current, required, expected) => {
    expect(isTierAtLeast(current, required)).toBe(expected);
  });

  it("unknown tier degrades safely to false (no throw)", () => {
    expect(() => isTierAtLeast("bogus", "agency")).not.toThrow();
    expect(isTierAtLeast("bogus", "agency")).toBe(false);
  });

  it("unknown required tier degrades safely: any real tier beats unknown", () => {
    expect(isTierAtLeast("free", "bogus")).toBe(true);
  });

  it("both unknown: degrades to equal (0 >= 0 → true)", () => {
    expect(isTierAtLeast("bogus", "bogus")).toBe(true);
  });
});

describe("TIER_RANK unknown-key safety", () => {
  it("TIER_RANK['bogus'] is undefined (falls back to 0 via ?? in isTierAtLeast)", () => {
    expect(TIER_RANK["bogus"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 1.2 — RBAC matrix (lib/governance/access-control.ts)
// ---------------------------------------------------------------------------
describe("canPerformAction — full RBAC matrix", () => {
  const CANON_MATRIX: Array<[PermissionAction, boolean, boolean, boolean, boolean]> = [
    //                                owner  admin  analyst  viewer
    ["run_audit",                     true,  true,  true,    false],
    ["create_edit_tasks",             true,  true,  true,    false],
    ["approve_drafts",                true,  true,  false,   false],
    ["view_reports",                  true,  true,  true,    true],
    ["view_audit_trail",              true,  true,  true,    false],
    ["generate_reports",              true,  true,  true,    false],
    ["edit_report_templates",         true,  true,  false,   false],
    ["invite_members",                true,  true,  false,   false],
    ["change_member_role",            true,  true,  false,   false],
    ["assign_owner_role",             true,  false, false,   false],
    ["remove_member",                 true,  true,  false,   false],
    ["delete_brand",                  true,  false, false,   false],
  ];

  const ROLES: OrgRole[] = ["owner", "admin", "analyst", "viewer"];

  CANON_MATRIX.forEach(([action, ...expected]) => {
    ROLES.forEach((role, i) => {
      it(`${role} + ${action} → ${expected[i]}`, () => {
        expect(canPerformAction(role, action)).toBe(expected[i]);
      });
    });
  });

  it("HIGH-12 boundary: viewer CANNOT view_audit_trail but CAN view_reports", () => {
    expect(canPerformAction("viewer", "view_audit_trail")).toBe(false);
    expect(canPerformAction("viewer", "view_reports")).toBe(true);
  });

  it("unknown role degrades safely to false", () => {
    expect(canPerformAction("superadmin" as OrgRole, "run_audit")).toBe(false);
  });

  it("unknown action degrades safely to false", () => {
    expect(canPerformAction("owner", "nuke_everything" as PermissionAction)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 1.3 — Role-ceiling logic (canAssignRole + canActOnMember)
// ---------------------------------------------------------------------------
describe("canAssignRole — role-ceiling rule", () => {
  it.each([
    ["owner", "owner", true],
    ["owner", "admin", true],
    ["owner", "analyst", true],
    ["owner", "viewer", true],
    ["admin", "owner", false],
    ["admin", "admin", true],
    ["admin", "analyst", true],
    ["admin", "viewer", true],
    ["analyst", "owner", false],
    ["analyst", "admin", false],
    ["analyst", "analyst", false],
    ["analyst", "viewer", false],
    ["viewer", "owner", false],
    ["viewer", "admin", false],
    ["viewer", "analyst", false],
    ["viewer", "viewer", false],
  ] as [OrgRole, OrgRole, boolean][])("canAssignRole('%s', '%s') → %s", (actor, target, expected) => {
    expect(canAssignRole(actor, target)).toBe(expected);
  });

  it("TS2367 verdict: line 44 comparison is cosmetic — admin→owner is already handled by line 42", () => {
    // Line 42: if (targetRole === "owner") return actorRole === "owner"
    // → admin assigning owner returns false at line 42, never reaches line 44
    // Line 44: if (actorRole === "admin") return targetRole !== "owner"
    // → By this point targetRole is narrowed to exclude "owner", so !== "owner" is always true
    // → The comparison is redundant but the logic is CORRECT
    expect(canAssignRole("admin", "owner")).toBe(false);
    expect(canAssignRole("admin", "admin")).toBe(true);
    expect(canAssignRole("admin", "analyst")).toBe(true);
    expect(canAssignRole("admin", "viewer")).toBe(true);
  });
});

describe("canActOnMember — who can modify whom", () => {
  it.each([
    ["owner", "owner", true],
    ["owner", "admin", true],
    ["owner", "analyst", true],
    ["owner", "viewer", true],
    ["admin", "owner", false],
    ["admin", "admin", true],
    ["admin", "analyst", true],
    ["admin", "viewer", true],
    ["analyst", "owner", false],
    ["analyst", "admin", false],
    ["analyst", "analyst", false],
    ["analyst", "viewer", false],
    ["viewer", "owner", false],
    ["viewer", "admin", false],
    ["viewer", "analyst", false],
    ["viewer", "viewer", false],
  ] as [OrgRole, OrgRole, boolean][])("canActOnMember('%s', '%s') → %s", (actor, target, expected) => {
    expect(canActOnMember(actor, target)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// 1.4 — Display maps (residency-table.tsx)
// ---------------------------------------------------------------------------
describe("PROVIDER_DISPLAY", () => {
  it.each([
    ["openai", "OpenAI"],
    ["anthropic", "Anthropic"],
    ["google", "Google"],
    ["perplexity", "Perplexity"],
    ["supabase", "Supabase"],
    ["vercel", "Vercel"],
  ] as const)("maps '%s' → '%s'", (key, display) => {
    expect(PROVIDER_DISPLAY[key]).toBe(display);
  });

  it("unmapped provider returns undefined (fallback via ?? in JSX)", () => {
    expect(PROVIDER_DISPLAY["unknown_provider"]).toBeUndefined();
  });
});

describe("REGION_LABELS", () => {
  it("maps ap-southeast-2 → 'Australia (Sydney)'", () => {
    expect(REGION_LABELS["ap-southeast-2"]).toBe("Australia (Sydney)");
  });

  it("maps us → 'United States'", () => {
    expect(REGION_LABELS["us"]).toBe("United States");
  });

  it("unmapped region returns undefined (fallback via ?? in JSX)", () => {
    expect(REGION_LABELS["eu-west-1"]).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 1.5 — assertBrandAccess
// ---------------------------------------------------------------------------
// SKIPPED: assertBrandAccess is inseparable from the DB (calls getMemberRecord which
// queries org_members). Belongs in Backend Integration (section 2), not here.
