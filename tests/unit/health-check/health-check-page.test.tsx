// @vitest-environment jsdom
/**
 * Health Check (7 Nov, Sri's decision 2) -- the page shows three measured checks side by side and no
 * combined number: AI presence is the audit's Visibility on the Visibility bands (13% is "Developing",
 * never "Critical"), and a check with no result says "Not measured yet", never 0. Rendered from the
 * page itself with its APIs answered, so what's checked is what a person sees.
 */
import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

vi.mock("next/navigation", () => ({
  useParams: () => ({ brandId: "b1" }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/brands/b1/health-check",
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const ANSWERS: Record<string, unknown> = {
  "/api/auth/me": { tier: "growth" },
  "/api/brands/b1": { brand: { name: "Metro Plumbing", vertical: "tradies" } },
  "/api/brands/b1/latest-audit": {
    audit: {
      completedAt: "2026-11-02T00:00:00.000Z",
      engineCount: 4,
      visibility: { value: "13%", detail: "2 of 15", band: "developing" },
      scoreConfidenceLow: "4.00",
      scoreConfidenceHigh: "38.00",
    },
  },
  // No technical audit yet.
  "/api/brands/b1/site-readiness": { scoreComposite: null, maxScore: 98, checkedAt: null },
  "/api/brands/b1/agent-readiness": {
    latest: { localAiTrustScore: 55, scoredAt: "2026-11-03T00:00:00.000Z" },
  },
  "/api/brands/b1/tasks?status=open&limit=1": { tasks: [] },
};

afterEach(() => vi.restoreAllMocks());

async function renderPage() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const body = ANSWERS[String(input)];
    return new Response(JSON.stringify(body ?? {}), { status: body ? 200 : 404 });
  });
  const { default: HealthCheckPage } = await import(
    "@/app/(auth)/brands/[brandId]/health-check/page"
  );
  render(<HealthCheckPage />);
  await screen.findByText("Metro Plumbing's Health Check");
}

describe("the Health Check page", () => {
  it("13% AI presence is Developing, with its counts and interval", async () => {
    await renderPage();
    const presence = document.querySelector("[data-health-card='ai_presence']");
    expect(presence).toHaveTextContent("13%");
    expect(presence).toHaveTextContent("Developing");
    expect(presence).toHaveTextContent("Named in 2 of 15 answers to everyday questions");
    expect(presence).toHaveTextContent("95% CI 4–38%");
    expect(document.body).not.toHaveTextContent("Critical");
  });

  it("a check with no result says Not measured yet, never 0", async () => {
    await renderPage();
    const site = document.querySelector("[data-health-card='site_readiness']");
    expect(site).toHaveTextContent("Not measured yet");
    expect(site).not.toHaveTextContent(/\b0 of 98/);
    const local = document.querySelector("[data-health-card='local_authority']");
    expect(local).toHaveTextContent("55 of 100");
  });

  it("no blended number: nothing out of 100 overall, no average of the checks", async () => {
    await renderPage();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\/100|overall/i);
    // (13 + 55) / 2 = 34: the old average of the measured checks.
    expect(text).not.toContain("34");
    expect(text).toContain("Health Check: AI presence, site readiness and local authority");
  });
});

describe("no blended score in the Health Check's code", () => {
  const FILES = [
    "components/domain/autopilot/health-check-panel.tsx",
    "components/domain/autopilot/health-check-banner.tsx",
    "app/(auth)/brands/[brandId]/health-check/page.tsx",
  ];

  it("nothing averages the checks or shows a score out of 100", () => {
    for (const file of FILES) {
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
      expect(code, file).not.toMatch(/reduce\(\(a, b\) => a \+ b|\/ scores\.length|overallScore/);
      expect(code, file).not.toMatch(/\/100\b|classifyScore|buildDimensions/);
    }
  });
});
