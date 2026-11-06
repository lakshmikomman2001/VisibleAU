// @vitest-environment jsdom
/**
 * 6 Nov (phone-layout follow-ups, item 4) -- the top bar's breadcrumb, desktop and
 * phone: a <nav aria-label="Breadcrumb"> list where every part before the page
 * you're on links to its page, and the page you're on is plain text with
 * aria-current="page". On a phone the parts before the last two collapse to "…"
 * and are left out; the parent that's left still links. A page that names its own
 * breadcrumb (SetBreadcrumbs, e.g. a brand's name) gets the same.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
// Imported here, not in each test: a first import under load can outlast a test's 5 s.
import { AppTopbar } from "@/components/domain/app-topbar";
import { BreadcrumbProvider } from "@/components/domain/breadcrumb-context";
import { SetBreadcrumbs } from "@/components/domain/set-breadcrumbs";
import { type Breadcrumbs, brandCrumb, CRUMB } from "@/lib/navigation/breadcrumbs";

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
vi.mock("@/components/domain/agency/workspace-switcher", () => ({ WorkspaceSwitcher: () => null }));

const BRAND = "11111111-1111-4111-8111-111111111111";

// The first render is the slow one on a loaded machine: done here, not in a test.
beforeAll(async () => {
  await renderTopbar();
  cleanup();
}, 60_000);

afterEach(() => {
  cleanup();
  nav.pathname = "/dashboard";
});

async function renderTopbar(own?: Breadcrumbs) {
  render(
    <BreadcrumbProvider>
      <AppTopbar />
      {own && <SetBreadcrumbs crumbs={own} />}
    </BreadcrumbProvider>,
  );
  // Both render in jsdom: the desktop one first, then the phone's (CSS hides one).
  const [desktop, phone] = screen.getAllByRole("navigation", { name: "Breadcrumb" });
  return { desktop, phone };
}

const linksOf = (el: HTMLElement) =>
  within(el)
    .queryAllByRole("link")
    .map((a) => [a.textContent, a.getAttribute("href")]);

describe("the breadcrumb's links", () => {
  it("desktop: every parent is a link to its page, the current page isn't", async () => {
    nav.pathname = `/brands/${BRAND}/trust/consensus`;
    const { desktop } = await renderTopbar();
    expect(within(desktop).getByRole("list")).toBeInTheDocument();
    expect(linksOf(desktop)).toEqual([
      ["Workspace", "/dashboard"],
      ["Brands", "/brands"],
      ["Brand", `/brands/${BRAND}`],
      ["Trust", `/brands/${BRAND}/trust`],
    ]);
    const current = desktop.querySelector('[aria-current="page"]');
    expect(current).toHaveTextContent("Consensus");
    expect(current?.closest("a")).toBeNull();
    expect(desktop.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });

  it("phone: '…' for what's left out, the parent still links, the page doesn't", async () => {
    nav.pathname = `/brands/${BRAND}/trust/consensus`;
    const { phone } = await renderTopbar();
    expect(linksOf(phone)).toEqual([["Trust", `/brands/${BRAND}/trust`]]);
    expect(phone.querySelector('[aria-current="page"]')).toHaveTextContent("Consensus");
    const ellipsis = within(phone).getByText("…");
    expect(ellipsis.closest('[aria-hidden="true"]')).not.toBeNull();
    // Workspace, Brands and the brand are left out (the drawer has every page).
    expect(within(phone).queryByText("Workspace")).toBeNull();
  });

  it("two parts: nothing collapses", async () => {
    nav.pathname = "/brands";
    const { desktop, phone } = await renderTopbar();
    for (const el of [desktop, phone]) {
      expect(linksOf(el)).toEqual([["Workspace", "/dashboard"]]);
      expect(el.querySelector('[aria-current="page"]')).toHaveTextContent("Brands");
      expect(within(el).queryByText("…")).toBeNull();
    }
  });

  it("a page's own breadcrumb, with its brand's name, links the same way", async () => {
    nav.pathname = `/brands/${BRAND}/ai-discovery`;
    const { desktop } = await renderTopbar([
      CRUMB.workspace,
      CRUMB.brands,
      brandCrumb({ id: BRAND, name: "Bondi Plumbing" }),
      { label: "AI Discovery" },
    ]);
    expect(linksOf(desktop)).toEqual([
      ["Workspace", "/dashboard"],
      ["Brands", "/brands"],
      ["Bondi Plumbing", `/brands/${BRAND}`],
    ]);
    expect(desktop.querySelector('[aria-current="page"]')).toHaveTextContent("AI Discovery");
  });
});
