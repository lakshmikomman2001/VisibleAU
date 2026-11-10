// @vitest-environment jsdom
/**
 * Playwright-run follow-ups (10 Nov), part 8 -- no loading state that can't end. The Data Residency table said
 * "Residency information loading…" after loading had finished with nothing to show, and the page treated a
 * failed /api/auth/me as success with nothing in it, so the message stayed for good. The agent-analytics CDN
 * Shield section did the same on a failed fetch: "Loading CDN Shield analysis..." forever. A failed fetch now
 * says it failed, and an empty result says it's empty.
 */
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  useParams: () => ({ brandId: "test-brand-id" }),
  usePathname: () => "/brands/test-brand-id",
}));

import DataResidencyPage from "@/app/(auth)/settings/data-residency/page";
import { ResidencyTable } from "@/components/domain/governance/residency-table";
import { AgentAnalyticsSection } from "@/components/domain/retrieval/agent-analytics-section";

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
});

/** Each URL's answer, by the first matching prefix. */
function stubFetch(answers: Array<[prefix: string, status: number, body: unknown]>) {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const [, status, body] = answers.find(([prefix]) => url.startsWith(prefix)) ?? ["", 404, {}];
    return {
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(body),
    } as Response;
  }) as unknown as typeof fetch;
}

describe("Data Residency", () => {
  it("an empty result is empty, never 'loading'", () => {
    render(<ResidencyTable entries={[]} />);
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
    expect(screen.getByText(/No data residency information/)).toBeInTheDocument();
  });

  it("a failed /api/auth/me shows an error, not a table still 'loading'", async () => {
    stubFetch([["/api/auth/me", 401, { error: "Unauthorized" }]]);
    render(<DataResidencyPage />);
    expect(await screen.findByText(/Couldn't load your workspace/)).toBeInTheDocument();
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  });

  it("a failed residency fetch shows an error", async () => {
    stubFetch([
      ["/api/auth/me", 200, { organizationId: "org-1" }],
      ["/api/organizations/org-1/data-residency", 500, { error: "boom" }],
    ]);
    render(<DataResidencyPage />);
    expect(
      await screen.findByText(/Couldn't load the data residency information/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/loading/i)).not.toBeInTheDocument();
  });
});

const OVERVIEW = {
  volumeByVendor: [],
  volumeByPurpose: [],
  verificationRates: [],
  periodStart: "2026-06-01",
  periodEnd: "2026-07-01",
};

describe("agent analytics: CDN Shield × Crawler Activity", () => {
  it("a failed fetch says so, instead of 'Loading CDN Shield analysis...' for good", async () => {
    stubFetch([["/api/brands/t/agent-analytics/cdn-join", 500, { error: "boom" }]]);
    render(
      <AgentAnalyticsSection
        overview={OVERVIEW}
        ratioData={null}
        ratioLocked={false}
        brandId="t"
      />,
    );
    expect(await screen.findByText(/Couldn't load the CDN Shield analysis/)).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText(/Loading CDN Shield analysis/)).not.toBeInTheDocument(),
    );
  });
});
