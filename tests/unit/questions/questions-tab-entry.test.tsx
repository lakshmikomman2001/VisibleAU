// @vitest-environment jsdom
/**
 * S02 part 4 (LLD 8.2.2: "brand page tab 'Questions' (and a tile on the brand overview)"; contract P02.states.flagOff,
 * P02 layout): how the tab is reached, and that nothing changes with question_library off.
 * - The brand page's tile "Questions" only with the flag on; off, the tiles are exactly as before.
 * - /brands/:id/questions with the flag off goes to the brand page; on, it shows the tab (which reads the plan itself,
 *   in its one request: the page doesn't).
 * - The breadcrumb: "Workspace › Brands › {brand} › Questions".
 */
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }));
const flags = vi.hoisted(() => ({ on: false, asked: [] as string[] }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT ${to}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1", organizationId: "org-1", role: "viewer" })),
}));
vi.mock("@/lib/flags/flags", () => ({
  isEnabled: vi.fn(async (flag: string) => {
    flags.asked.push(flag);
    return flags.on;
  }),
}));

import BrandQuestionsPage from "@/app/(auth)/brands/[brandId]/questions/page";
import { BrandDetailClient } from "@/components/domain/brand/brand-detail-client";
import { breadcrumbsForPath } from "@/lib/navigation/breadcrumbs";
import { sourceText } from "@/tests/helpers/source-files";

const BRAND_ID = "6f1c0e2a-4b7d-4c1e-9a52-3d8e7f6a1b20";
const BRAND = {
  id: BRAND_ID,
  name: "Bluegum Plumbing",
  domain: "bluegumplumbing.com.au",
  vertical: "tradies",
  region: "au",
  competitors: [],
  primaryRegions: ["NSW:Wollongong"],
};
const NONE = {
  auditCount: 0,
  recentAudits: [],
  latestAudit: null,
  avgPosition: null,
  totalMentions: 0,
  engineStats: [],
};

beforeEach(() => {
  flags.asked = [];
});

describe("reaching the Questions tab", () => {
  it("the brand page's Questions tile only with question_library on", () => {
    const off = render(<BrandDetailClient {...NONE} brand={BRAND} />);
    const before = [...document.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(before).not.toContain(`/brands/${BRAND_ID}/questions`);
    off.unmount();
    render(<BrandDetailClient {...NONE} brand={BRAND} questionLibraryEnabled />);
    const tile = screen.getByRole("link", { name: /^Questions\b/ });
    expect(tile).toHaveAttribute("href", `/brands/${BRAND_ID}/questions`);
    expect(tile).toHaveTextContent("What every audit asks");
    // Everything else as before: the same links, plus the tile.
    const after = [...document.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(after.filter((h) => h !== `/brands/${BRAND_ID}/questions`)).toEqual(before);
  });

  it("flag off: /brands/:id/questions goes to the brand page", async () => {
    flags.on = false;
    await expect(
      BrandQuestionsPage({ params: Promise.resolve({ brandId: BRAND_ID }) }),
    ).rejects.toThrow(`REDIRECT /brands/${BRAND_ID}`);
    expect(flags.asked).toEqual(["question_library"]);
  });

  it("flag on: the tab, for this brand", async () => {
    flags.on = true;
    const page = await BrandQuestionsPage({ params: Promise.resolve({ brandId: BRAND_ID }) });
    const tab = page.props.children;
    expect(tab.props).toEqual({ brandId: BRAND_ID });
  });

  it("a brand id that isn't one: 404", async () => {
    await expect(
      BrandQuestionsPage({ params: Promise.resolve({ brandId: "nope" }) }),
    ).rejects.toThrow("NOT_FOUND");
  });

  it("the intro's link target exists: the methodology page's section on how questions are chosen", () => {
    expect(sourceText("app/(marketing)/methodology/page.tsx")).toMatch(
      /<section id="how-we-gather-answers"[^>]*>\s*<h2[^>]*>How we gather answers<\/h2>/,
    );
  });

  it("the breadcrumb: Workspace › Brands › {brand} › Questions", () => {
    const crumbs = breadcrumbsForPath(`/brands/${BRAND_ID}/questions`, {
      brand: { id: BRAND_ID, name: BRAND.name },
    });
    expect(crumbs.map((c) => c.label)).toEqual([
      "Workspace",
      "Brands",
      "Bluegum Plumbing",
      "Questions",
    ]);
  });
});
