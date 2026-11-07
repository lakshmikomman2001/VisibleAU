// @vitest-environment jsdom
/**
 * Team follow-ups (31 Oct), item 6 -- after the server checks, the UI hides or disables what a role can't
 * do, as the server decides it (lib/governance/permissions.ts, handed down by RoleProvider). On production
 * an Analyst saw "+ New brand" in the top bar.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoleProvider } from "@/components/domain/role-context";
import type { OrgRole } from "@/lib/governance/permissions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));

import BrandScheduleView from "@/app/(auth)/brands/[brandId]/schedule/brand-schedule-view";
import BillingView from "@/app/(auth)/settings/billing/billing-view";
import { BrandDetailClient } from "@/components/domain/brand/brand-detail-client";
import { NewBrandButton } from "@/components/domain/new-brand-button";

const as = (role: OrgRole, ui: React.ReactNode) =>
  render(<RoleProvider role={role}>{ui}</RoleProvider>);

const USAGE = { canAdd: true, used: 1, limit: 5 } as unknown as Parameters<
  typeof NewBrandButton
>[0]["usage"];

const BRAND = {
  id: "test-brand-id",
  name: "Omega Services",
  domain: "omega.com.au",
  vertical: "tradies",
  region: "au",
  competitors: [],
  classificationStatus: "complete" as const,
  locationConfirmedAt: "2026-10-18T11:20:59.000Z",
  primaryRegions: ["NSW:Norwest"],
};
const BRAND_PROPS = {
  auditCount: 2,
  recentAudits: [],
  latestAudit: null,
  avgPosition: null,
  totalMentions: 0,
  engineStats: [],
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("'+ New brand': owners and admins only", () => {
  it.each(["owner", "admin"] as const)("%s: shown", (role) => {
    as(role, <NewBrandButton usage={USAGE} variant="toolbar" />);
    expect(document.querySelector("[data-new-brand]")).not.toBeNull();
  });

  it.each(["analyst", "viewer"] as const)("%s: not there", (role) => {
    as(role, <NewBrandButton usage={USAGE} variant="toolbar" />);
    expect(document.querySelector("[data-new-brand]")).toBeNull();
  });
});

describe("a brand's page", () => {
  const page = (role: OrgRole) => as(role, <BrandDetailClient {...BRAND_PROPS} brand={BRAND} />);

  it("a viewer can't run an audit: the button is disabled and says who can; no Edit, no Delete", () => {
    page("viewer");
    const run = screen.getByRole("button", { name: "Run audit" });
    expect(run).toBeDisabled();
    expect(run.parentElement).toHaveAttribute(
      "title",
      "Only an owner, admin or analyst can run audits.",
    );
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("an analyst runs audits, and can't edit or delete the brand", () => {
    page("analyst");
    expect(screen.getByRole("button", { name: "Run audit" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("an admin edits it, and can't delete it", () => {
    page("admin");
    expect(screen.getByRole("button", { name: "Edit" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("an owner has all three", () => {
    page("owner");
    expect(screen.getByRole("button", { name: "Run audit" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Edit" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Delete" })).toBeVisible();
  });
});

describe("billing: the owner's", () => {
  const billing = (role: OrgRole) =>
    as(
      role,
      <BillingView
        tier="agency"
        tierName="Agency"
        monthlyPrice="299"
        billingInterval="monthly"
        cancelAtPeriodEnd={false}
        periodEnd={null}
        hasSubscription
        stripeCustomerId="cus_test"
        maxScheduled={10}
        frequency="weekly"
        success={false}
        reason={null}
      />,
    );

  it("an admin sees why, and no subscription buttons", () => {
    billing("admin");
    expect(screen.getByText("Only the owner can manage billing.")).toBeVisible();
    expect(screen.queryByRole("button", { name: /Manage subscription/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancel plan" })).toBeNull();
  });

  it("the owner has them", () => {
    billing("owner");
    expect(screen.getByRole("button", { name: /Manage subscription/ })).toBeVisible();
    expect(screen.getByRole("button", { name: "Cancel plan" })).toBeVisible();
  });
});

describe("a brand's audit schedule: a viewer sees it and changes nothing", () => {
  const schedule = (role: OrgRole) =>
    as(
      role,
      <BrandScheduleView
        brand={{ id: "b1", name: "Omega Services", domain: "omega.com.au" }}
        schedule={null}
        tierFrequency="weekly"
        maxScheduled={10}
        tier="agency"
      />,
    );

  it("a viewer: no Create schedule, and why", () => {
    schedule("viewer");
    expect(screen.queryByRole("button", { name: /Create audit schedule/ })).toBeNull();
    expect(screen.getByText("Only an owner, admin or analyst can change schedules.")).toBeVisible();
  });

  it("an analyst can create one", () => {
    schedule("analyst");
    expect(screen.getByRole("button", { name: /Create audit schedule/ })).toBeVisible();
  });
});
