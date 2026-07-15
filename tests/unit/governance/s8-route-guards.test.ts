import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const SRC = resolve(__dirname, "../../..");

function src(rel: string): string {
  return readFileSync(resolve(SRC, rel), "utf-8");
}

// ---------------------------------------------------------------------------
// 2.2 — recordAction call-site invocation guards (source assertions)
//
// Each route that writes to audit_trail MUST contain a recordAction call with
// the correct action string. Removing the call = test RED = the exact
// "writer built but never called" class of F2/F6 bugs.
// ---------------------------------------------------------------------------
describe("2.2 — recordAction is invoked at all 9 call sites", () => {
  const CALL_SITES: Array<[string, string, string | string[]]> = [
    [
      "hallucination acknowledge",
      "app/api/brands/[brandId]/hallucinations/[id]/route.ts",
      "hallucination_acknowledged",
    ],
    [
      "competitive benchmark viewed",
      "app/api/brands/[brandId]/competitive-benchmark/route.ts",
      "competitive_benchmark_viewed",
    ],
    [
      "journey triggered",
      "app/api/brands/[brandId]/journeys/[journeyId]/run/route.ts",
      "journey_triggered",
    ],
    [
      "draft approved + dismissed",
      "app/api/brands/[brandId]/drafts/[id]/route.ts",
      ["draft_approved", "draft_dismissed"],
    ],
    [
      "data residency accessed",
      "app/api/organizations/[orgId]/data-residency/route.ts",
      "data_residency_accessed",
    ],
    [
      "member invited",
      "app/api/organizations/[orgId]/members/invite/route.ts",
      "member_invited",
    ],
    [
      "member role changed + removed",
      "app/api/organizations/[orgId]/members/[memberId]/route.ts",
      ["member_role_changed", "member_removed"],
    ],
  ];

  function hasUncommentedCall(source: string, action: string): boolean {
    const lines = source.split("\n");
    let foundRecordAction = false;
    let foundAction = false;
    for (const line of lines) {
      const trimmed = line.trimStart();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
      if (trimmed.includes("recordAction(")) foundRecordAction = true;
      if (trimmed.includes(`"${action}"`)) foundAction = true;
    }
    return foundRecordAction && foundAction;
  }

  for (const [label, file, actions] of CALL_SITES) {
    const actionList = Array.isArray(actions) ? actions : [actions];
    for (const action of actionList) {
      it(`${file} contains uncommented recordAction("${action}")`, () => {
        const source = src(file);
        expect(hasUncommentedCall(source, action)).toBe(true);
      });
    }
  }

  it("all 9 call sites pass organizationId (never orgId) to recordAction", () => {
    const routeFiles = CALL_SITES.map(([, f]) => f);
    for (const file of routeFiles) {
      const source = src(file);
      const recordCalls = source.split("recordAction(").slice(1);
      for (const call of recordCalls) {
        expect(call).toContain("organizationId");
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 2.4 — Viewer DENIED on audit-trail route (HIGH-12 guard)
// ---------------------------------------------------------------------------
describe("2.4 — audit-trail route enforces view_audit_trail (not view_reports)", () => {
  const routeSource = src("app/api/organizations/[orgId]/audit-trail/route.ts");

  it("uses canPerformAction with 'view_audit_trail'", () => {
    expect(routeSource).toContain('canPerformAction(role, "view_audit_trail")');
  });

  it("does NOT use view_reports for the audit-trail route", () => {
    const permChecks = routeSource.match(/canPerformAction\(role,\s*"([^"]+)"\)/g) ?? [];
    for (const check of permChecks) {
      expect(check).not.toContain("view_reports");
    }
  });

  it("returns 403 when permission check fails", () => {
    expect(routeSource).toContain("403");
    expect(routeSource).toContain("Forbidden");
  });
});

// ---------------------------------------------------------------------------
// 2.5 — Cross-org → 404 (existence-hiding) on audit-trail route
// ---------------------------------------------------------------------------
describe("2.5 — audit-trail route hides existence for cross-org callers", () => {
  const routeSource = src("app/api/organizations/[orgId]/audit-trail/route.ts");

  it("checks orgId === currentUser.organizationId", () => {
    expect(routeSource).toContain("currentUser.organizationId");
    expect(routeSource).toMatch(/orgId\s*!==\s*currentUser\.organizationId/);
  });

  it("returns 404 (not 403) for org mismatch", () => {
    const mismatchBlock = routeSource.split("currentUser.organizationId")[1]?.split("\n").slice(0, 3).join("\n");
    expect(mismatchBlock).toContain("404");
    expect(mismatchBlock).toContain("Not found");
  });

  it("uses withRlsContext to enforce row-level security", () => {
    expect(routeSource).toContain("withRlsContext");
  });
});

// ---------------------------------------------------------------------------
// 2.5 (extended) — Cross-org 404 on ALL governance routes
// ---------------------------------------------------------------------------
describe("2.5 — cross-org 404 on all governance routes", () => {
  const GOVERNANCE_ROUTES = [
    "app/api/organizations/[orgId]/audit-trail/route.ts",
    "app/api/organizations/[orgId]/members/invite/route.ts",
    "app/api/organizations/[orgId]/members/[memberId]/route.ts",
    "app/api/organizations/[orgId]/data-residency/route.ts",
    "app/api/organizations/[orgId]/feature-flags/route.ts",
  ];

  for (const file of GOVERNANCE_ROUTES) {
    it(`${file} checks org ownership and returns 404 for mismatch`, () => {
      const source = src(file);
      expect(source).toContain("currentUser.organizationId");
      expect(source).toMatch(/orgId\s*!==\s*currentUser\.organizationId/);
      const mismatchBlock = source.split("currentUser.organizationId")[1]?.split("\n").slice(0, 3).join("\n");
      expect(mismatchBlock).toContain("404");
    });
  }
});

// ---------------------------------------------------------------------------
// 2.8 — Provisioning: afterCreateOrganization seeds owner + residency
// ---------------------------------------------------------------------------
describe("2.8 — afterCreateOrganization provisions owner row + residency data", () => {
  const authSrc = src("lib/auth/server.ts");

  it("inserts into orgMembers with role='owner' (scoped — not satisfiable by users-table insert)", () => {
    // role:"owner" appears in BOTH the users insert and the orgMembers insert.
    // This regex requires insert(orgMembers) before role:"owner" so the users insert can't satisfy it.
    expect(authSrc).toMatch(
      /\.insert\(\s*orgMembers\s*\)[\s\S]{0,500}role:\s*"owner"/
    );
  });

  it("sets brandAccess to null (all-brands access)", () => {
    expect(authSrc).toContain("brandAccess: null");
  });

  it("sets acceptedAt and isActive=true (pre-accepted)", () => {
    expect(authSrc).toContain("acceptedAt:");
    expect(authSrc).toContain("isActive: true");
  });

  it("calls recordDataResidency after org creation", () => {
    expect(authSrc).toContain("recordDataResidency(orgRow.id)");
  });

  it("seeds the org with tier='free' and region='au'", () => {
    const provisionBlock = authSrc.split("afterCreateOrganization")[1] ?? "";
    expect(provisionBlock).toContain('tier: "free"');
    expect(provisionBlock).toContain('region: "au"');
  });
});

// ---------------------------------------------------------------------------
// 2.9 — Webhook fanout dedup uses internalEventId (not event type)
// ---------------------------------------------------------------------------
describe("2.9 — fanout webhook dedup keys on event INSTANCE not event TYPE (F19 guard)", () => {
  const fanoutSrc = src("inngest/functions/fanout-webhooks.ts");

  it("extracts event.id as internalEventId", () => {
    expect(fanoutSrc).toContain("event.id");
    expect(fanoutSrc).toContain("internalEventId");
  });

  it("dedup WHERE clause uses internalEventId (NOT event name)", () => {
    const whereMatch = fanoutSrc.match(/\.where\(\s*and\(\s*eq\(webhookDeliveries\.\w+,\s*\w+\.?\w*\),\s*eq\(webhookDeliveries\.(\w+),/);
    expect(whereMatch).not.toBeNull();
    expect(whereMatch![1]).toBe("internalEventId");
  });

  it("passes internalEventId through to webhook.deliver event", () => {
    const sendBlock = fanoutSrc.split("inngest.send")[1] ?? "";
    expect(sendBlock).toContain("internalEventId");
  });

  it("deliver function accepts and stores internalEventId", () => {
    const deliverSrc = src("inngest/functions/deliver-webhook.ts");
    expect(deliverSrc).toContain("internalEventId");
    expect(deliverSrc).toContain("internalEventId: internalEventId ?? null");
  });

  it("EVENT_NAME_MAP covers all registered triggers", () => {
    const mapMatch = fanoutSrc.match(/EVENT_NAME_MAP[^}]+\}/s)?.[0] ?? "";
    const triggerMatch = fanoutSrc.match(/triggers:\s*\[([^\]]+)\]/s)?.[0] ?? "";
    const internalEvents = [
      "audit.complete",
      "drift.detected",
      "recommendation.created",
      "report/generated",
      "hallucination/detected",
      "hallucination/acknowledged",
      "visibility/trend-updated",
      "agent/readiness-scored",
    ];
    for (const evt of internalEvents) {
      expect(mapMatch).toContain(`"${evt}"`);
      expect(triggerMatch).toContain(`"${evt}"`);
    }
  });
});

// ---------------------------------------------------------------------------
// 2.1 S8b-02 — Admin cannot assign owner role (route-level guard)
// ---------------------------------------------------------------------------
describe("2.1 — member PATCH route enforces role-ceiling (S8b-02)", () => {
  const memberSrc = src("app/api/organizations/[orgId]/members/[memberId]/route.ts");

  it("PATCH handler calls canAssignRole before updating", () => {
    expect(memberSrc).toContain("canAssignRole(");
  });

  it("returns 403 when canAssignRole denies the assignment", () => {
    expect(memberSrc).toMatch(/canAssignRole\([^)]+\)\s*\)\s*\n\s*return\s+NextResponse\.json\(\{[^}]*\},\s*\{\s*status:\s*403\s*\}\)/);
  });

  it("PATCH handler calls canActOnMember before modifying", () => {
    expect(memberSrc).toContain("canActOnMember(");
  });

  it("DELETE handler calls canActOnMember before removing", () => {
    const deleteBlock = memberSrc.split("export async function DELETE")[1] ?? "";
    expect(deleteBlock).toContain("canActOnMember(");
  });

  it("DELETE distinguishes accepted vs pending (IC-01 footgun guard)", () => {
    const deleteBlock = memberSrc.split("export async function DELETE")[1] ?? "";
    expect(deleteBlock).toContain("acceptedAt");
    expect(deleteBlock).toContain("isActive");
  });
});

// ---------------------------------------------------------------------------
// 2.10 — Feature flags route resolution: org_feature_flags > env > default
// ---------------------------------------------------------------------------
describe("2.10 — feature-flags route resolves org > env > default", () => {
  const flagRouteSrc = src("app/api/organizations/[orgId]/feature-flags/route.ts");

  it("calls getOrgFlags to load DB overrides", () => {
    expect(flagRouteSrc).toContain("getOrgFlags(");
  });

  it("iterates CANONICAL_FLAG_KEYS for resolution", () => {
    expect(flagRouteSrc).toContain("CANONICAL_FLAG_KEYS");
  });

  it("checks DB flags first, then falls back to env var", () => {
    expect(flagRouteSrc).toContain("key in dbFlags");
    expect(flagRouteSrc).toContain("process.env[envKey]");
  });

  it("is a GET-only route (no write path for users)", () => {
    expect(flagRouteSrc).toContain("export async function GET");
    expect(flagRouteSrc).not.toContain("export async function POST");
    expect(flagRouteSrc).not.toContain("export async function PUT");
    expect(flagRouteSrc).not.toContain("export async function PATCH");
  });
});
