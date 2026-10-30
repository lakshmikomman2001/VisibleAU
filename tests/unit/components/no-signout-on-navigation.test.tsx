// @vitest-environment jsdom
/**
 * "Signing in reaches the dashboard, then the user is signed out" (27 Oct).
 * The app shell never signs anyone out by itself: not on mount, not on a
 * route change, not when the phone drawer opens or closes (it closes on
 * every route change). Only the account menu's Sign out item does -- the
 * account button used to sign out on click before it opened a menu.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ pathname: "/dashboard" }));
const { signOutSpy } = vi.hoisted(() => ({ signOutSpy: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
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
vi.mock("@/lib/auth/client", () => ({ signOut: signOutSpy }));

async function renderShell() {
  const { AppShell } = await import("@/components/domain/app-shell");
  const { BreadcrumbProvider } = await import("@/components/domain/breadcrumb-context");
  const { CurrentBrandProvider } = await import("@/components/domain/current-brand-context");
  const tree = () => (
    <BreadcrumbProvider>
      <CurrentBrandProvider>
        <AppShell orgName="Harbour Agency" orgTier="agency_pro" userName="Sri Owner">
          <p>Page content</p>
        </AppShell>
      </CurrentBrandProvider>
    </BreadcrumbProvider>
  );
  const result = render(tree());
  return { ...result, rerenderShell: () => result.rerender(tree()) };
}

beforeEach(() => {
  signOutSpy.mockClear();
  nav.pathname = "/dashboard";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ brands: [] }), { status: 200 })),
  );
});

describe("the app shell never signs anyone out by itself", () => {
  it("not on mount, not on route changes, not when the drawer opens and closes", async () => {
    const { rerenderShell } = await renderShell();
    expect(signOutSpy).not.toHaveBeenCalled();

    for (const path of ["/brands", "/audits", "/settings/team", "/dashboard"]) {
      nav.pathname = path;
      await act(async () => rerenderShell());
    }
    expect(signOutSpy).not.toHaveBeenCalled();

    // The phone drawer: open it, then a route change closes it.
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    nav.pathname = "/brands";
    await act(async () => rerenderShell());
    // And open it again, then close it with Esc and with its close button.
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    fireEvent.click(
      within(screen.getByRole("dialog", { hidden: true })).getByRole("button", {
        name: "Close menu",
        hidden: true,
      }),
    );
    expect(signOutSpy).not.toHaveBeenCalled();
  });

  it("opening the account menu doesn't sign out; its Sign out item does, once", async () => {
    await renderShell();
    const [accountButton] = screen.getAllByRole("button", { name: "Open user menu" });
    fireEvent.click(accountButton);
    expect(signOutSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("menuitem", { name: "Sign out" }));
    expect(signOutSpy).toHaveBeenCalledTimes(1);
  });
});
