// @vitest-environment jsdom
/**
 * 6 Nov (phone-layout follow-ups, item 1) -- "New brand" on every screen. The phone
 * drawer has it as the Workspace section's first item (the desktop sidebar doesn't:
 * the top bar has it); the top bar shows it on the Overview; and every one of them is
 * the same control: the wizard while the plan has room, and at the limit the same
 * lock, "Limit reached" and the way to the plans -- never a button that ends in the
 * API's 403. (The Brands page's header: tests/integration/new-brand-entries.)
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
// Imported here, not in each test: a first import under load can outlast a test's 5 s.
import { AppShell } from "@/components/domain/app-shell";
import { BreadcrumbProvider } from "@/components/domain/breadcrumb-context";
import { CurrentBrandProvider } from "@/components/domain/current-brand-context";
import { BrandLimitCard, NewBrandButton } from "@/components/domain/new-brand-button";
import type { BrandUsage } from "@/lib/brands/limits";

const nav = vi.hoisted(() => ({ pathname: "/dashboard" }));

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
vi.mock("@/lib/auth/client", () => ({ signOut: vi.fn() }));
// The brand switcher fetches its list; not what's tested here.
vi.mock("@/components/domain/agency/workspace-switcher", () => ({ WorkspaceSwitcher: () => null }));

const ROOM: BrandUsage = { count: 1, limit: 5, canAdd: true, upgradePlan: null };
const FULL: BrandUsage = { count: 1, limit: 1, canAdd: false, upgradePlan: "Agency" };
const UPGRADE = "/settings/billing?reason=brand-limit";

// The shell's first render is the slow one (a cold process, jsdom's first style
// reads: 9 s once on a loaded machine): done here, with room for that, not in a test.
beforeAll(async () => {
  await renderShell(ROOM);
  cleanup();
}, 60_000);

afterEach(() => {
  cleanup();
  nav.pathname = "/dashboard";
});

async function renderShell(usage: BrandUsage) {
  return render(
    <BreadcrumbProvider>
      <CurrentBrandProvider>
        <AppShell orgName="Bondi Plumbing" orgTier="growth" userName="Sri Owner" brandUsage={usage}>
          <p>Page</p>
        </AppShell>
      </CurrentBrandProvider>
    </BreadcrumbProvider>,
  );
}

/** The drawer, open or not (a closed dialog has no accessible name to find it by). */
const drawer = () => document.getElementById("main-menu") as HTMLElement;
const desktopSidebar = () => document.querySelector<HTMLElement>('aside[data-tour="sidebar"]');
// Selectors, not role queries: the shell holds the sidebar twice, and a role query
// over all of it took about 2 s per test, too close to the 5 s limit under load.
const openMenu = () =>
  fireEvent.click(document.querySelector('button[aria-label="Open menu"]') as HTMLElement);

describe("the phone drawer's New brand", () => {
  it("is the Workspace section's first item, and opens the wizard", async () => {
    await renderShell(ROOM);
    openMenu();
    const main = drawer().querySelector<HTMLElement>('nav[aria-label="Main"]');
    const links = [...(main?.querySelectorAll<HTMLElement>("a[href]") ?? [])];
    expect(links[0]).toHaveAccessibleName("New brand");
    expect(links[0]).toHaveAttribute("href", "/brands/wizard");
    expect(links[1]).toHaveAccessibleName("Overview");
    // Right under the section's label.
    expect(links[0].previousElementSibling).toHaveTextContent("Workspace");
  });

  it("closes the drawer when followed", async () => {
    await renderShell(ROOM);
    openMenu();
    expect(drawer()).toHaveStyle({ visibility: "visible" });
    fireEvent.click(drawer().querySelector('[data-new-brand="nav"]') as HTMLElement);
    expect(drawer()).toHaveStyle({ visibility: "hidden" });
  });

  it("isn't in the desktop sidebar: the top bar has it", async () => {
    await renderShell(ROOM);
    const sidebar = desktopSidebar();
    expect(sidebar).not.toBeNull();
    expect(within(sidebar as HTMLElement).queryByText("New brand")).toBeNull();
  });
});

describe("the top bar's New brand", () => {
  it("is the Overview's page action, opening the wizard", async () => {
    await renderShell(ROOM);
    const toolbar = document.querySelector('header [data-new-brand="toolbar"]');
    expect(toolbar).toHaveAttribute("href", "/brands/wizard");
    expect(toolbar).toHaveAccessibleName("New brand");
  });

  it("leaves the Brands page to its own header button", async () => {
    nav.pathname = "/brands";
    await renderShell(ROOM);
    expect(document.querySelector('header [data-new-brand="toolbar"]')).toBeNull();
  });
});

describe("at the plan's limit", () => {
  it("the top bar and the drawer show the same lock and 'Limit reached', and lead to the plans", async () => {
    await renderShell(FULL);
    openMenu();
    const toolbar = document.querySelector<HTMLElement>('header [data-new-brand="toolbar"]');
    const item = drawer().querySelector<HTMLElement>('[data-new-brand="nav"]');
    for (const entry of [toolbar, item]) {
      expect(entry).toHaveAttribute("href", UPGRADE);
      expect(entry).toHaveAttribute("data-brand-limit-reached");
      expect(entry).toHaveAccessibleName(
        "New brand: Limit reached. The Agency plan has more brands.",
      );
      // The lock, not the plus.
      expect(entry?.querySelector("svg.lucide-lock")).not.toBeNull();
      expect(entry?.querySelector("svg.lucide-plus")).toBeNull();
    }
    expect(toolbar?.textContent).toBe(item?.textContent);
  });

  it("every variant of the control is the same link with the same words", async () => {
    for (const usage of [ROOM, FULL]) {
      const texts = (["toolbar", "page", "nav"] as const).map((variant) => {
        const { container, unmount } = render(<NewBrandButton usage={usage} variant={variant} />);
        const link = container.querySelector("a");
        const seen = [link?.getAttribute("href"), link?.textContent];
        unmount();
        return seen;
      });
      expect(new Set(texts.map((t) => JSON.stringify(t))).size).toBe(1);
      expect(texts[0][0]).toBe(usage.canAdd ? "/brands/wizard" : UPGRADE);
    }
  });

  it("the wizard's own page says why, and the way to more", async () => {
    render(<BrandLimitCard usage={FULL} />);
    expect(screen.getByText("You've reached your plan's brand limit")).toBeInTheDocument();
    expect(
      screen.getByText("Your workspace has 1 of 1 brands. The Agency plan has more."),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See plans" })).toHaveAttribute("href", UPGRADE);
    expect(screen.getByRole("link", { name: "Back to Brands" })).toHaveAttribute("href", "/brands");
  });
});
