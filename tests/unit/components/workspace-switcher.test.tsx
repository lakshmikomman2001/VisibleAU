// @vitest-environment jsdom

/**
 * Task #46 Phase 2, Part 0: the audit page (/audits/[auditId], seen live
 * 16 Oct on Audit #19) showed "Select brand" in the header switcher
 * instead of the audit's own brand -- WorkspaceSwitcher's currentBrandId
 * only ever came from a `/brands/([^/]+)` URL-prefix match, which an
 * audit page never satisfies. SetCurrentBrand (current-brand-context.tsx)
 * lets a brand-scoped page outside /brands/* declare its brand instead.
 */
import { render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

let mockPathname = "/dashboard";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn() }),
}));

const BRANDS = [
  { id: "brand-1", name: "Bondi Plumbing", domain: "bondiplumbing.com.au" },
  { id: "brand-2", name: "Another Brand", domain: "another.example.com.au" },
];

beforeEach(() => {
  mockPathname = "/dashboard";
  // A real answer has a status: since the af8de42..d1eb5a1 follow-ups (part 1) the switcher reads only a
  // 2xx one (a failed /api/brands says "Couldn't load your brands", never "No brands").
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ brands: BRANDS }),
    }),
  );
});

async function renderSwitcher(pathname: string, brandIdToDeclare?: string) {
  mockPathname = pathname;
  const { WorkspaceSwitcher } = await import("@/components/domain/agency/workspace-switcher");
  const { CurrentBrandProvider } = await import("@/components/domain/current-brand-context");
  const { SetCurrentBrand } = await import("@/components/domain/set-current-brand");

  const result = render(
    React.createElement(
      CurrentBrandProvider,
      null,
      brandIdToDeclare ? React.createElement(SetCurrentBrand, { brandId: brandIdToDeclare }) : null,
      React.createElement(WorkspaceSwitcher, { tier: "starter" }),
    ),
  );
  await screen.findByRole("button", { name: /switch workspace/i });
  return result;
}

describe("WorkspaceSwitcher — brand-scoped pages outside /brands/*", () => {
  it('on /audits/[id] with no declared brand, falls back to "Select brand" (pre-fix behaviour, regression guard)', async () => {
    await renderSwitcher("/audits/a0682646-4fa2-48f8-8d66-3452a39e9502");
    expect(screen.getByText("Select brand")).toBeInTheDocument();
  });

  it("on /audits/[id] with SetCurrentBrand declaring the audit's real brand, shows that brand's name, not 'Select brand'", async () => {
    await renderSwitcher("/audits/a0682646-4fa2-48f8-8d66-3452a39e9502", "brand-1");
    expect(screen.getByText("Bondi Plumbing")).toBeInTheDocument();
    expect(screen.queryByText("Select brand")).not.toBeInTheDocument();
  });

  it("never shows a brand not in the fetched (org-scoped) brands list, even if an unknown id is declared", async () => {
    await renderSwitcher("/audits/a0682646-4fa2-48f8-8d66-3452a39e9502", "not-in-this-org");
    expect(screen.queryByText("Bondi Plumbing")).not.toBeInTheDocument();
    expect(screen.queryByText("Another Brand")).not.toBeInTheDocument();
    // No matching brand found for the declared id -- falls back to the
    // generic label, same as "no brand known at all". Never fabricates
    // a name, and never reaches across into another org's data (the
    // brands list itself is already scoped by the /api/brands route).
    expect(screen.getByText("Select brand")).toBeInTheDocument();
  });

  it("on /brands/[id] pages, the existing URL-based match still works unaided (no regression)", async () => {
    await renderSwitcher("/brands/brand-2");
    expect(screen.getByText("Another Brand")).toBeInTheDocument();
  });

  it("a declared brand on a /brands/[id] page takes priority over the URL match if they ever disagree", async () => {
    await renderSwitcher("/brands/brand-2", "brand-1");
    expect(screen.getByText("Bondi Plumbing")).toBeInTheDocument();
    expect(screen.queryByText("Another Brand")).not.toBeInTheDocument();
  });
});

describe("WorkspaceSwitcher -- after a brand is deleted or added", () => {
  it("reads the brand list again when the shell's brand count changes, so a deleted brand's name goes", async () => {
    // Playwright-run follow-ups (10 Nov): the list was read once, when the shell mounted. After a delete
    // (router.refresh() gives the shell its new count) /brands still named the deleted brand, "the only
    // brand" of the stale list.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ brands: [BRANDS[0]] }),
      })
      .mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ brands: [] }) });
    vi.stubGlobal("fetch", fetchMock);
    mockPathname = "/brands";
    const { WorkspaceSwitcher } = await import("@/components/domain/agency/workspace-switcher");
    const { CurrentBrandProvider } = await import("@/components/domain/current-brand-context");
    const tree = (count: number) =>
      React.createElement(
        CurrentBrandProvider,
        null,
        React.createElement(WorkspaceSwitcher, { tier: "starter", brandCount: count }),
      );

    const { rerender } = render(tree(1));
    expect(await screen.findByText("Bondi Plumbing")).toBeInTheDocument();

    rerender(tree(0));
    expect(await screen.findByText("No brands")).toBeInTheDocument();
    expect(screen.queryByText("Bondi Plumbing")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
