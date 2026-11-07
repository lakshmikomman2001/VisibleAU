// @vitest-environment jsdom
/**
 * Follow-ups from d247ba7..f13411d, part 1 -- Sri's role decisions (8 Nov), in the UI:
 * - every description of a role is written from the permission matrix, and says plainly "Only the owner can
 *   delete a brand" (the Team page, the invite form's role picker, a brand's page); none says an admin can;
 * - integrations (webhooks, client portals) are an owner's or admin's: an analyst sees no controls, and why;
 * - the workspace's email settings are an owner's or admin's, while anyone can stop the digest sent to them;
 * - the only owner of a workspace with people, a plan or schedules sees why "Switch" isn't offered.
 */
import "@testing-library/jest-dom/vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoleProvider } from "@/components/domain/role-context";
import { ORG_ROLES, type OrgRole, roleDescription } from "@/lib/governance/permissions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));
vi.mock("@/lib/auth/client", () => ({
  authClient: { sendVerificationEmail: vi.fn() },
  signOut: vi.fn(),
}));

import { ClientPortalsView } from "@/app/(auth)/agency/client-portals/client-portals-view";
import NotificationPreferencesPage from "@/app/(auth)/settings/notifications/page";
import { BrandDetailClient } from "@/components/domain/brand/brand-detail-client";
import { InviteForm } from "@/components/domain/governance/invite-form";
import { RoleLegend } from "@/components/domain/governance/role-legend";
import { WebhooksSettingsView } from "@/components/domain/webhooks/webhooks-settings-view";

const as = (role: OrgRole, ui: React.ReactNode) =>
  render(<RoleProvider role={role}>{ui}</RoleProvider>);

const OWNER_ONLY_DELETE = "Only the owner can delete a brand.";

type Answer = Record<string, unknown> | unknown[];
let answers: Record<string, Answer> = {};
let requests: { url: string; method: string }[] = [];

beforeEach(() => {
  answers = {};
  requests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      requests.push({ url, method });
      return Response.json(answers[`${method} ${url}`] ?? {}, { status: 200 });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("decision 2: role descriptions come from the matrix, and say only the owner deletes a brand", () => {
  it("the Team page's legend: each role's description from the matrix, and the rule in Sri's words", () => {
    render(<RoleLegend />);
    const legend = document.querySelector("[data-role-legend]") as HTMLElement;
    for (const role of ORG_ROLES) expect(legend).toHaveTextContent(roleDescription(role));
    expect(screen.getByText(OWNER_ONLY_DELETE)).toBeVisible();
  });

  it("the invite form's role picker describes the chosen role, from the matrix, with the rule", async () => {
    render(<InviteForm orgId="org-1" />);
    const picker = screen.getByLabelText("Role");
    fireEvent.change(picker, { target: { value: "admin" } });
    const described = document.querySelector("[data-role-description]") as HTMLElement;
    expect(described).toHaveAttribute("data-role-description", "admin");
    expect(described).toHaveTextContent(roleDescription("admin"));
    expect(described).toHaveTextContent(OWNER_ONLY_DELETE);
    expect(described).not.toHaveTextContent(/delete a brand,|delete a brand and/);
  });

  it("a brand's page: an admin, who can edit it, is told only the owner deletes it; the owner isn't", () => {
    const brand = {
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
    const props = {
      auditCount: 2,
      recentAudits: [],
      latestAudit: null,
      avgPosition: null,
      totalMentions: 0,
      engineStats: [],
    };
    as("admin", <BrandDetailClient {...props} brand={brand} />);
    expect(screen.getByText(OWNER_ONLY_DELETE)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    cleanup();
    as("owner", <BrandDetailClient {...props} brand={brand} />);
    expect(screen.queryByText(OWNER_ONLY_DELETE)).toBeNull();
    expect(screen.getByRole("button", { name: "Delete" })).toBeVisible();
  });

  it("no hand-written role description is left in the app, and none says an admin deletes brands", () => {
    const root = resolve(__dirname, "../../..");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (path.endsWith(".tsx")) files.push(path);
      }
    };
    walk(join(root, "app"));
    walk(join(root, "components"));
    const offenders: string[] = [];
    for (const file of files) {
      // What the page shows, not what its comments say.
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      if (/admins?\b[^.\n"]{0,60}\bdelet/i.test(code)) offenders.push(`${file}: admin + delete`);
      for (const chip of [
        "Full access, billing",
        "Manage brands & team",
        "Run audits, view reports",
        "Read-only access",
      ]) {
        if (code.includes(chip)) offenders.push(`${file}: "${chip}"`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("decision 3: integrations are an owner's or admin's", () => {
  const ENDPOINT = {
    id: "ep-1",
    organizationId: "org-1",
    url: "https://hooks.example.com.au/visibility",
    channel: "custom",
    events: ["audit.completed"],
    isActive: true,
    lastDeliveryAt: null,
    lastDeliveryStatus: null,
    createdAt: new Date("2026-11-01T00:00:00Z"),
    updatedAt: new Date("2026-11-01T00:00:00Z"),
  };
  const webhooks = (role: OrgRole) =>
    as(
      role,
      <WebhooksSettingsView
        endpoints={[ENDPOINT]}
        recentDeliveries={[]}
        validEvents={["audit.completed"]}
      />,
    );

  it("webhooks, an analyst: no Add endpoint, test or delete, and why", () => {
    webhooks("analyst");
    expect(screen.queryByRole("button", { name: /Add endpoint/ })).toBeNull();
    expect(screen.queryByTitle("Send test delivery")).toBeNull();
    expect(screen.queryByTitle("Delete endpoint")).toBeNull();
    expect(screen.getByText("Only an owner or admin can change integrations.")).toBeVisible();
  });

  it("webhooks, an admin: all three", () => {
    webhooks("admin");
    expect(screen.getByRole("button", { name: /Add endpoint/ })).toBeVisible();
    expect(screen.getByTitle("Send test delivery")).toBeVisible();
    expect(screen.getByTitle("Delete endpoint")).toBeVisible();
    expect(screen.queryByText("Only an owner or admin can change integrations.")).toBeNull();
  });

  const portalInvite = (token: string | null) => ({
    invites: [
      {
        id: "inv-1",
        inviteToken: token,
        brandId: "brand-1",
        brandName: "Omega Services",
        inviteeName: "Client Co",
        status: "active",
        expiresAt: null,
        isRevoked: false,
        createdAt: "2026-11-01T00:00:00Z",
      },
    ],
  });

  it("client portals, an analyst: no Create Invite, copy or revoke, and why", async () => {
    answers["GET /api/client-portal/invites"] = portalInvite(null);
    as("analyst", <ClientPortalsView canCreate />);
    expect(await screen.findByText("Omega Services")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Create Invite" })).toBeNull();
    expect(screen.queryByTitle("Copy portal link")).toBeNull();
    expect(screen.queryByRole("button", { name: "Revoke" })).toBeNull();
    expect(screen.getByText("Only an owner or admin can change integrations.")).toBeVisible();
  });

  it("client portals, an admin: all three", async () => {
    answers["GET /api/client-portal/invites"] = portalInvite("tok_abcdefghijklmnop");
    as("admin", <ClientPortalsView canCreate />);
    expect(await screen.findByText("Omega Services")).toBeVisible();
    expect(screen.getByRole("button", { name: "Create Invite" })).toBeVisible();
    expect(screen.getByTitle("Copy portal link")).toBeVisible();
    expect(screen.getByRole("button", { name: "Revoke" })).toBeVisible();
  });
});

describe("decision 5: the workspace's email settings are an owner's or admin's", () => {
  const PREFS = {
    weeklyDigest: true,
    digestEmail: "lee@example.com.au",
    emailOnDrift: true,
    emailOnAuditComplete: true,
    emailOnScheduleFailure: true,
  };

  it("an analyst sees them, changes none, and can stop the digest sent to them", async () => {
    answers["GET /api/notification-preferences"] = { preferences: PREFS, digestToYou: true };
    answers["POST /api/notification-preferences/stop-my-digest"] = { weeklyDigest: false };
    as("analyst", <NotificationPreferencesPage />);
    const stop = await screen.findByRole("button", { name: "Stop sending me the weekly digest" });
    for (const toggle of screen.getAllByRole("switch")) expect(toggle).toBeDisabled();
    expect(screen.getByLabelText("Digest Email Address")).toBeDisabled();
    expect(screen.queryByRole("button", { name: /Save Preferences/ })).toBeNull();
    expect(
      screen.getByText(/Only an owner or admin can change the workspace's email settings\./),
    ).toBeVisible();

    fireEvent.click(stop);
    await waitFor(() =>
      expect(requests).toContainEqual({
        url: "/api/notification-preferences/stop-my-digest",
        method: "POST",
      }),
    );
    expect(await screen.findByText("You won't get the weekly digest any more.")).toBeVisible();
    expect(requests.some((r) => r.method === "PATCH")).toBe(false);
  });

  it("an analyst the digest doesn't go to has nothing to stop", async () => {
    answers["GET /api/notification-preferences"] = { preferences: PREFS, digestToYou: false };
    as("analyst", <NotificationPreferencesPage />);
    await screen.findByText(/Only an owner or admin can change/);
    expect(screen.queryByRole("button", { name: "Stop sending me the weekly digest" })).toBeNull();
  });

  it("an admin changes them", async () => {
    answers["GET /api/notification-preferences"] = { preferences: PREFS, digestToYou: false };
    as("admin", <NotificationPreferencesPage />);
    expect(await screen.findByRole("button", { name: /Save Preferences/ })).toBeVisible();
    for (const toggle of screen.getAllByRole("switch")) expect(toggle).toBeEnabled();
  });
});

describe("decision 9: the only owner can't switch away from a workspace with people, a plan or schedules", () => {
  const BLOCKED =
    "You're the only owner of Lee's Agency. Make someone else owner or cancel the subscription first.";

  it("says why, and doesn't offer Switch", async () => {
    const ORG = "0f9d8c7b-6a5e-4d3c-8b2a-1f0e9d8c7b6a";
    const TOKEN = "AbC_-12345xyzAbC_-123";
    answers[`GET /api/organizations/${ORG}/members/accept?token=${TOKEN}`] = {
      choice: true,
      orgName: "Splice Marketing",
      role: "analyst",
      ownWorkspaceName: "Lee's Agency",
      expiresAt: "2026-11-13T23:00:00Z",
      switchBlocked: BLOCKED,
    };
    const { AcceptInvite } = await import("@/app/invite/[orgId]/[token]/invite-client");
    render(<AcceptInvite orgId={ORG} token={TOKEN} email="lee@example.com" />);
    const switchButton = await screen.findByRole("button", { name: "Switch to Splice Marketing" });
    expect(switchButton).toBeDisabled();
    expect(screen.getByText(BLOCKED)).toBeVisible();
    expect(screen.getByRole("button", { name: "Not now" })).toBeEnabled();
  });
});
