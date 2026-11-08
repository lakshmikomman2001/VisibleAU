// @vitest-environment jsdom
/**
 * Live invite test follow-ups (8 Nov), part 4 -- small wording and UI from Sri's live test:
 * - "as analyst" -> "as an analyst" (and "an admin", "a viewer", "an owner"), from one helper
 *   (lib/governance/permissions.ts withArticle), in the invite email, the invite sign-up and the invite page;
 * - "Only the owner can delete a brand." under Admin only in the invite form;
 * - the team table's "Actions" heading only when some row has an action for this viewer;
 * - the "Last audit" badge coloured by age (lib/brands/audit-age.ts): green within 7 days, amber to 30, red
 *   after -- not green at 22 days;
 * - "Avg visibility" says when the averaged audits use different methods, with the same figure.
 */
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { cleanup, render, screen } from "@testing-library/react";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { createElement } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AUDIT_AGE_BANDS, lastAuditTone } from "@/lib/brands/audit-age";
import {
  averageVisibility,
  averageVisibilitySub,
  type BrandVisibility,
  MIXED_METHODS_NOTE,
} from "@/lib/dashboard/overview-cards";
import { teamInviteEmail } from "@/lib/email/templates/auth";
import { withArticle } from "@/lib/governance/permissions";

vi.mock("next/navigation", () => ({
  usePathname: () => "/settings/team",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const NOW = new Date("2026-11-08T03:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

// First renders of these components can take seconds under load: load them once first.
beforeAll(async () => {
  await import("@/components/domain/governance/invite-form");
  await import("@/components/domain/auth/invite-sign-up");
  await import("@/app/(auth)/settings/team/page");
  await import("@/components/domain/brand/brand-row");
}, 30_000);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("a role after 'as' has its article", () => {
  it("an owner, an admin, an analyst, a viewer", () => {
    expect(["owner", "admin", "analyst", "viewer"].map(withArticle)).toEqual([
      "an owner",
      "an admin",
      "an analyst",
      "a viewer",
    ]);
  });

  it("the invite email: 'as an analyst', 'as a viewer'", () => {
    const email = (role: string) =>
      teamInviteEmail({
        inviterName: "Sri",
        orgName: "Splice Marketing",
        role,
        acceptUrl: "https://app.vunnara.com.au/invite/x/y",
        expiresAt: NOW,
      });
    expect(email("analyst").text).toContain("join Splice Marketing on Vunnara as an analyst.");
    // The inbox preview line too (in the HTML).
    expect(email("analyst").html).toContain("Join Splice Marketing on Vunnara as an analyst.");
    expect(email("viewer").text).toContain("as a viewer.");
    expect(email("admin").text).toContain("as an admin.");
    expect(email("analyst").text).not.toMatch(/as analyst\b/);
  });

  it("the invite sign-up: 'as an analyst'", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          orgName: "Splice Marketing",
          role: "analyst",
          forNewAccount: true,
          email: "lee@example.com",
        }),
      ),
    );
    const { InviteSignUp } = await import("@/components/domain/auth/invite-sign-up");
    render(
      createElement(InviteSignUp, { orgId: "0f9d8c7b-6a5e-4d3c-8b2a-1f0e9d8c7b6a", token: "tok" }),
    );
    expect(
      await screen.findByText(/You've been invited to join Splice Marketing as an analyst\./),
    ).toBeInTheDocument();
  });

  it("nothing in the app puts a bare role after 'as'", () => {
    const ROOT = join(__dirname, "../../..");
    const files: string[] = [];
    const walk = (path: string) => {
      if (!existsSync(path)) return;
      if (statSync(path).isDirectory()) for (const e of readdirSync(path)) walk(join(path, e));
      else if (/\.tsx?$/.test(path)) files.push(relative(ROOT, path).split(sep).join("/"));
    };
    for (const dir of ["app", "components", "lib"]) walk(join(ROOT, dir));
    const bare = /\bas \$?\{(?!withArticle\()[^}]*\brole\}/;
    expect(files.filter((f) => bare.test(readFileSync(join(ROOT, f), "utf8")))).toEqual([]);
  });
});

describe("the invite form's role help", () => {
  it("says only the owner can delete a brand under Admin, and not under Analyst or Viewer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json([])),
    );
    const user = userEvent.setup();
    const { InviteForm } = await import("@/components/domain/governance/invite-form");
    const { container } = render(createElement(InviteForm, { orgId: "org1" }));
    const help = () => container.querySelector("#invite-role-description")?.textContent ?? "";
    const role = screen.getByLabelText("Role");
    await user.selectOptions(role, "admin");
    expect(help()).toContain("Only the owner can delete a brand.");
    for (const other of ["analyst", "viewer"]) {
      await user.selectOptions(role, other);
      expect(help()).not.toContain("Only the owner can delete a brand.");
    }
  });
});

describe("the team table's Actions heading", () => {
  const ORG = "11111111-1111-4111-8111-111111111111";
  const member = (n: number, role: string) => ({
    id: `m${n}`,
    userId: `u${n}`,
    role,
    brandAccess: null,
    isActive: true,
    acceptedAt: "2026-10-01T00:00:00.000Z",
    name: `Member ${n}`,
    email: `member${n}@example.com.au`,
  });

  function team(role: string, members: unknown[]) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/auth/me")
          return Response.json({ id: "u0", organizationId: ORG, role, tier: "agency" });
        if (url === `/api/organizations/${ORG}/members`) return Response.json(members);
        return Response.json([]);
      }),
    );
  }

  async function headings() {
    const { default: TeamPage } = await import("@/app/(auth)/settings/team/page");
    render(createElement(TeamPage));
    await screen.findByText("Member 0");
  }

  it("an analyst has no actions on any row: no Actions heading", async () => {
    team("analyst", [member(0, "analyst"), member(1, "owner")]);
    await headings();
    expect(screen.queryByText("Actions")).toBeNull();
  });

  it("an owner alone in the team has none either", async () => {
    team("owner", [member(0, "owner")]);
    await headings();
    expect(screen.queryByText("Actions")).toBeNull();
  });

  it("an owner with someone to act on sees it", async () => {
    team("owner", [member(0, "owner"), member(1, "analyst")]);
    await headings();
    expect(screen.getByText("Actions")).toBeInTheDocument();
  });
});

describe("the Last audit badge, by age", () => {
  it(`green within ${AUDIT_AGE_BANDS.freshDays} days, amber to ${AUDIT_AGE_BANDS.ageingDays}, red after`, () => {
    expect(lastAuditTone(daysAgo(0.1), "complete", NOW)).toBe("fresh");
    expect(lastAuditTone(daysAgo(7), "complete", NOW)).toBe("fresh");
    expect(lastAuditTone(daysAgo(8), "complete", NOW)).toBe("ageing");
    expect(lastAuditTone(daysAgo(22), "complete", NOW)).toBe("ageing");
    expect(lastAuditTone(daysAgo(30), "complete", NOW)).toBe("ageing");
    expect(lastAuditTone(daysAgo(31), "complete", NOW)).toBe("stale");
    expect(lastAuditTone(null, null, NOW)).toBe("never");
    expect(lastAuditTone(daysAgo(40), "running", NOW)).toBe("running");
    expect(lastAuditTone(daysAgo(1), "failed", NOW)).toBe("failed");
  });

  it("a brand audited 22 days ago doesn't get a green badge", async () => {
    const { BrandRow } = await import("@/components/domain/brand/brand-row");
    const { container } = render(
      createElement(BrandRow, {
        brand: {
          id: "b1",
          name: "Acme",
          domain: "acme.example",
          vertical: "trades",
          primaryRegions: [],
          lastAuditScore: null,
          lastAuditAt: daysAgo(22).toISOString(),
          lastAuditStatus: "complete",
        },
        index: 0,
        isLast: true,
      }),
    );
    const badge = container.querySelector("[data-audit-tone]");
    expect(badge).toHaveAttribute("data-audit-tone", "ageing");
    expect(badge).toHaveStyle({ color: "var(--warning)" });
  });
});

describe("Avg visibility, when the latest audits use different methods", () => {
  const scored = (value: number, methodologyVersion: number): BrandVisibility => ({
    headline: { status: "scored", value, ci: { lower: 0, upper: 100 } },
    missingAnEngine: false,
    methodologyVersion,
  });

  it("says so under the figure, and the figure is the same", () => {
    const same = averageVisibility([scored(40, 3), scored(60, 3)]);
    const mixed = averageVisibility([scored(40, 2), scored(60, 3)]);
    expect(mixed.value).toBe(same.value);
    expect(averageVisibilitySub(same)).not.toContain(MIXED_METHODS_NOTE);
    expect(averageVisibilitySub(mixed)).toBe(
      "Average of 2 brands' latest audits · Latest audits use different methods",
    );
  });
});
