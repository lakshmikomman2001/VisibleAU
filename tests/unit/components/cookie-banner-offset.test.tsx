// @vitest-environment jsdom
/**
 * 6 Nov (phone-layout follow-ups, item 7) -- until a visitor answers it, the cookie
 * banner (fixed to the bottom of the screen, in the root layout) sat on top of the
 * signed-in sidebar's footer: the account menu and Sign out. In the signed-in app at
 * 1024px and wider it now starts where the sidebar ends. jsdom has no layout, so this
 * holds the three files to one contract -- the rule in app/globals.css matches the
 * real banner inside the real shell, and the sidebar is the width the rule moves it by
 * -- and tests/e2e/responsive/responsive-shell.spec.ts clicks Sign out past the banner
 * at 1280 × 720 and in the drawer at 375 × 667.
 */
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
// Imported here, not in each test: a first import under load can outlast a test's 5 s.
import { AppShell } from "@/components/domain/app-shell";
import { BreadcrumbProvider } from "@/components/domain/breadcrumb-context";
import { CurrentBrandProvider } from "@/components/domain/current-brand-context";
import { CookieConsentBanner } from "@/components/domain/shared/cookie-consent-banner";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
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
vi.mock("@/components/domain/agency/workspace-switcher", () => ({ WorkspaceSwitcher: () => null }));

const CSS = readFileSync(resolve(__dirname, "../../../app/globals.css"), "utf-8");
const OFFSET_RULE = "body:has([data-app-shell]) [data-cookie-banner]";

// The shell's first render is the slow one (a cold process, jsdom's first style
// reads): done here, with room for a loaded machine, not in a test.
beforeAll(async () => {
  await renderBannerAndShell();
  cleanup();
  localStorage.clear();
}, 60_000);

afterEach(() => {
  cleanup();
  localStorage.clear();
});

async function renderBannerAndShell() {
  render(
    <>
      <CookieConsentBanner />
      <BreadcrumbProvider>
        <CurrentBrandProvider>
          <AppShell
            orgName="Bondi Plumbing"
            orgTier="growth"
            userName="Sri Owner"
            brandUsage={{ count: 1, limit: 1, canAdd: false, upgradePlan: "Agency" }}
          >
            <p>Page</p>
          </AppShell>
        </CurrentBrandProvider>
      </BreadcrumbProvider>
    </>,
  );
  await screen.findByRole("button", { name: "Decline" });
}

describe("the cookie banner and the signed-in sidebar", () => {
  it("app/globals.css moves the banner by the sidebar's width, from 1024px", () => {
    const media = CSS.match(/@media \(min-width: 1024px\) \{([\s\S]*?)\r?\n\}/)?.[1] ?? "";
    expect(media).toContain(OFFSET_RULE);
    expect(media).toMatch(/left:\s*var\(--app-sidebar-width\)/);
    expect(CSS).toMatch(/--app-sidebar-width:\s*14rem/);
  });

  it("the rule's selector matches the real banner in the real shell", async () => {
    await renderBannerAndShell();
    const banner = document.querySelector("[data-cookie-banner]");
    expect(banner).not.toBeNull();
    expect(document.querySelector(OFFSET_RULE)).toBe(banner);
    // Full width otherwise: below 1024px, and outside the signed-in app.
    expect(banner).toHaveClass("fixed", "bottom-0", "left-0", "right-0");
  });

  it("the sidebar is the width the banner is moved by", async () => {
    await renderBannerAndShell();
    const sidebar = document.querySelector('aside[data-tour="sidebar"]');
    expect(sidebar?.className).toContain("w-[var(--app-sidebar-width)]");
  });

  it("outside the signed-in app the selector doesn't match: the banner stays full width", async () => {
    render(<CookieConsentBanner />);
    await screen.findByRole("button", { name: "Decline" });
    expect(document.querySelector("[data-cookie-banner]")).not.toBeNull();
    expect(document.querySelector(OFFSET_RULE)).toBeNull();
  });
});
