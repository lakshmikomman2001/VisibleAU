// @vitest-environment jsdom
/**
 * 20 Nov (Sri's decision, part 6): sign-up follows the free-plan switch. With FREE_TIER_ENABLED_AU off, a new workspace
 * is marked as needing a plan (lib/auth/server.ts provisionAppWorkspace, lib/pricing/plan-required.ts): it lands on the
 * plan picker (/pricing) from every app page but Billing, Billing says "No plan yet", and nothing that costs money runs
 * -- adding a business and running an audit answer 402. A paid plan lifts it. With the switch on, nothing changes.
 */
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/dashboard", replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ replace: nav.replace, push: vi.fn(), refresh: vi.fn() }),
}));

import { PlanRequiredGate } from "@/components/domain/plan-required-gate";
import {
  hasPlanRequiredMark,
  newWorkspaceMetadata,
  PLAN_REQUIRED,
  workspaceNeedsPlan,
} from "@/lib/pricing/plan-required";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  nav.replace.mockReset();
});

describe("the new workspace's metadata follows the switch", () => {
  it("off: marked as needing a plan; on: nothing", () => {
    vi.stubEnv("FREE_TIER_ENABLED_AU", "false");
    expect(newWorkspaceMetadata("au")).toEqual({ planRequired: true });
    vi.stubEnv("FREE_TIER_ENABLED_AU", "true");
    expect(newWorkspaceMetadata("au")).toEqual({});
  });

  it("provisionAppWorkspace writes it into the workspace row it creates", () => {
    const src = readFileSync("lib/auth/server.ts", "utf8");
    expect(src).toMatch(
      /tier: "free",\s+region: "au",[\s\S]{0,300}metadata: newWorkspaceMetadata\("au"\)/,
    );
  });
});

/** A database whose selects answer, in order: the workspace's metadata, then its subscription. */
function fakeDb(metadata: unknown, subscription: Record<string, unknown> | null) {
  const answers: unknown[][] = [[{ metadata }], subscription ? [subscription] : []];
  return {
    select: () => {
      const rows = answers.shift() ?? [];
      const chain: Record<string, unknown> = {};
      for (const m of ["from", "where"]) chain[m] = () => chain;
      chain.limit = async () => rows;
      return chain;
    },
  } as unknown as Parameters<typeof workspaceNeedsPlan>[0];
}

describe("whether a workspace needs a plan", () => {
  const ACTIVE_GROWTH = {
    tier: "growth",
    status: "active",
    cancelAtPeriodEnd: false,
    cancelAt: null,
    currentPeriodStart: new Date("2026-11-01T00:00:00Z"),
    currentPeriodEnd: new Date("2026-12-01T00:00:00Z"),
  };

  it("marked and no paid plan: it needs one", async () => {
    expect(await workspaceNeedsPlan(fakeDb({ planRequired: true }, null), "org-1")).toBe(true);
  });

  it("marked, then checkout: a paid plan lifts it", async () => {
    expect(await workspaceNeedsPlan(fakeDb({ planRequired: true }, ACTIVE_GROWTH), "org-1")).toBe(
      false,
    );
  });

  it("not marked (made while the free plan was on): never", async () => {
    expect(await workspaceNeedsPlan(fakeDb({}, null), "org-1")).toBe(false);
    expect(hasPlanRequiredMark({ planRequired: "yes" })).toBe(false);
  });
});

describe("nothing paid runs before checkout", () => {
  it("running an audit and adding a business answer 402 for a workspace with no plan", () => {
    for (const route of ["app/api/audits/route.ts", "app/api/brands/route.ts"]) {
      const src = readFileSync(route, "utf8");
      const post = src.slice(src.indexOf("export async function POST"));
      // Before the body is read: nothing else runs.
      expect(post.indexOf("workspaceNeedsPlan(")).toBeGreaterThan(-1);
      expect(post.indexOf("workspaceNeedsPlan(")).toBeLessThan(post.indexOf("req.json()"));
      expect(post).toContain("return planRequiredResponse();");
    }
    expect(PLAN_REQUIRED).toMatchObject({ error: "plan_required", choosePlanUrl: "/pricing" });
  });

  it("the refusal is 402 with where to choose a plan", async () => {
    const { planRequiredResponse } = await import("@/lib/pricing/plan-required");
    const res = planRequiredResponse();
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual(PLAN_REQUIRED);
  });
});

describe("the app sends a workspace with no plan to the plan picker", () => {
  it("an app page: says why and goes to /pricing", () => {
    nav.pathname = "/dashboard";
    render(<PlanRequiredGate needsPlan={true}>the dashboard</PlanRequiredGate>);
    expect(screen.getByText("Choose a plan to start")).toBeInTheDocument();
    expect(screen.queryByText("the dashboard")).not.toBeInTheDocument();
    expect(nav.replace).toHaveBeenCalledWith("/pricing");
  });

  it("Billing stays open (to see there's no plan, and after checkout before Stripe says)", () => {
    nav.pathname = "/settings/billing";
    render(<PlanRequiredGate needsPlan={true}>billing</PlanRequiredGate>);
    expect(screen.getByText("billing")).toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("with the switch on (no mark), every page is as before", () => {
    nav.pathname = "/dashboard";
    render(<PlanRequiredGate needsPlan={false}>the dashboard</PlanRequiredGate>);
    expect(screen.getByText("the dashboard")).toBeInTheDocument();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("the shell wraps every page in the gate, and Billing says 'No plan yet', not Free", () => {
    const layout = readFileSync("app/(auth)/layout.tsx", "utf8");
    expect(layout).toContain(
      "const needsPlan = await workspaceNeedsPlan(serviceDb, currentUser.organizationId);",
    );
    expect(layout).toContain(
      "<PlanRequiredGate needsPlan={needsPlan}>{children}</PlanRequiredGate>",
    );
    const billing = readFileSync("app/(auth)/settings/billing/billing-view.tsx", "utf8");
    expect(billing).toContain('const tierLabel = planRequired ? "No plan yet" : tierName;');
    const billingPage = readFileSync("app/(auth)/settings/billing/page.tsx", "utf8").replace(
      /\s+/g,
      " ",
    );
    expect(billingPage).toContain(
      "planRequired={ await withRlsContext(currentUser.organizationId, (tx) => workspaceNeedsPlan(tx, currentUser.organizationId), ) }",
    );
  });
});
