// @vitest-environment jsdom
//
// `/methods` (the Citability Methods / Methodology page) had no navigation
// entry -- the only way to reach it was typing the URL. This adds a
// "Methodology" sidebar item under Workspace, with no extra visibility
// condition beyond sign-in: /methods itself has no plan/role gate (any
// signed-in user can open it; free tier just sees a top-10-limited view),
// matching every other WORKSPACE_ITEMS entry (none of which are tier-gated
// for visibility either).
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/auth/client", () => ({
  signOut: vi.fn(),
}));

describe("AppSidebar — Methodology entry", () => {
  async function renderSidebar() {
    const { AppSidebar } = await import("@/components/domain/app-sidebar");
    render(<AppSidebar orgName="Test Org" orgTier="free" userName="Test User" />);
  }

  it('renders a "Methodology" link pointing at /methods', async () => {
    await renderSidebar();
    const link = screen.getByRole("link", { name: "Methodology" });
    expect(link).toHaveAttribute("href", "/methods");
  });

  it("renders Methodology for every org tier -- the route has no plan gate on visibility", async () => {
    for (const orgTier of ["free", "starter", "agency", "enterprise"]) {
      const { AppSidebar } = await import("@/components/domain/app-sidebar");
      const { unmount } = render(
        <AppSidebar orgName="Test Org" orgTier={orgTier} userName="Test User" />,
      );
      expect(screen.getByRole("link", { name: "Methodology" })).toHaveAttribute(
        "href",
        "/methods",
      );
      unmount();
    }
  });

  it("places Methodology under the Workspace section, alongside Action Center", async () => {
    await renderSidebar();
    const actionCenter = screen.getByRole("link", { name: "Action Center" });
    const methodology = screen.getByRole("link", { name: "Methodology" });
    // Both are siblings in the same nav list -- confirms Methodology wasn't
    // accidentally placed under the Account section instead.
    expect(actionCenter.parentElement).toBe(methodology.parentElement);
  });
});
