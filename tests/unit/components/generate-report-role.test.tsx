// @vitest-environment jsdom
/**
 * Team follow-ups (31 Oct), item 10 -- a viewer can't generate a report (the route answers 403), so on the
 * reports page the button is disabled, with a tooltip saying who can. Owners, admins and analysts get it
 * as before.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { RoleProvider } from "@/components/domain/role-context";
import type { OrgRole } from "@/lib/governance/permissions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), back: vi.fn() }),
  useParams: () => ({ brandId: "brand-1" }),
  usePathname: () => "/brands/brand-1/reports",
}));

import ReportsListPage from "@/app/(auth)/brands/[brandId]/reports/page";

const realFetch = global.fetch;
function serveNoReports() {
  global.fetch = vi.fn((url: string) =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(url.startsWith("/api/report-branding") ? { agencyName: "" } : []),
    }),
  ) as unknown as typeof fetch;
}

function page(role: OrgRole) {
  render(
    <RoleProvider role={role}>
      <ReportsListPage />
    </RoleProvider>,
  );
  return screen.findByRole("button", { name: "Generate report" }, { timeout: 30_000 });
}

// The page's first render is the slow one on this machine: paid for here.
beforeAll(async () => {
  serveNoReports();
  await page("owner");
  cleanup();
}, 60_000);
beforeEach(serveNoReports);
afterEach(() => {
  cleanup();
  global.fetch = realFetch;
});

describe("Generate report, by role", () => {
  it("a viewer's is disabled, with a tooltip saying who can", async () => {
    const button = await page("viewer");
    expect(button).toBeDisabled();
    const locked = document.querySelector('[data-role-locked="generate_reports"]');
    expect(locked).toHaveAttribute(
      "title",
      "Only an owner, admin or analyst can generate reports.",
    );
    expect(button).toHaveAccessibleDescription(
      "Only an owner, admin or analyst can generate reports.",
    );
  });

  it.each(["owner", "admin", "analyst"] as const)("an %s's works", async (role) => {
    const button = await page(role);
    expect(button).toBeEnabled();
    expect(document.querySelector("[data-role-locked]")).toBeNull();
  });
});
