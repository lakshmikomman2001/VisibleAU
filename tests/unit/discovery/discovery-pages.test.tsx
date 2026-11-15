// @vitest-environment jsdom
/**
 * 17 Nov, part 3 -- the Discovery pages say what they measured, and say so when they couldn't load it.
 * - Hub: the counts started at 0 and a failed fetch left them there, so a failure read "0 journeys" and
 *   "0 results" as fact.
 * - Comparisons: each card says when it ran, labels its name match as this answer's ("Named in this answer",
 *   not the audit's mention), and says when only the start of the answer was kept.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PlanTierProvider } from "@/components/domain/plan-tier-context";

const BRAND = "22222222-2222-4222-8222-222222222222";
const API = `/api/brands/${BRAND}`;

vi.mock("next/navigation", () => ({
  useParams: () => ({ brandId: BRAND }),
  usePathname: () => `/brands/${BRAND}/discovery`,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function stubFetch(answer: (url: string) => Response | undefined) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async (input: RequestInfo | URL) =>
        answer(String(input)) ?? Response.json({ error: "Database unavailable" }, { status: 500 }),
    ),
  );
}

const onTopPlan = (node: ReactNode) =>
  render(<PlanTierProvider tier="enterprise">{node}</PlanTierProvider>);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeAll(async () => {
  await Promise.all([
    import("@/app/(auth)/brands/[brandId]/discovery/page"),
    import("@/app/(auth)/brands/[brandId]/discovery/comparisons/page"),
  ]);
}, 120_000);

describe("Discovery hub", () => {
  it("a failed fetch says it couldn't load, never '0 journeys' or '0 results'", async () => {
    stubFetch(() => undefined);
    const { default: Hub } = await import("@/app/(auth)/brands/[brandId]/discovery/page");
    onTopPlan(<Hub />);
    expect(await screen.findByText("Couldn't load your journeys.")).toBeInTheDocument();
    expect(screen.getByText("Couldn't load your competitor comparisons.")).toBeInTheDocument();
    expect(screen.queryByText(/^0 (journeys?|results?)$/)).not.toBeInTheDocument();
    expect(screen.getAllByText("Couldn't load")).toHaveLength(2);
  });

  it("counts only from a load that worked", async () => {
    stubFetch((url) =>
      url === `${API}/journeys`
        ? Response.json({ journeys: [{ id: "j1" }, { id: "j2" }], templates: [] })
        : url === `${API}/comparisons`
          ? Response.json([])
          : undefined,
    );
    const { default: Hub } = await import("@/app/(auth)/brands/[brandId]/discovery/page");
    onTopPlan(<Hub />);
    expect(await screen.findByText("2 journeys")).toBeInTheDocument();
    expect(screen.getByText("0 results")).toBeInTheDocument();
    expect(document.querySelector("[data-load-error]")).toBeNull();
  });

  it("one failure is that tile's alone: the other's count still shows", async () => {
    stubFetch((url) =>
      url === `${API}/journeys`
        ? Response.json({ journeys: [{ id: "j1" }], templates: [] })
        : undefined,
    );
    const { default: Hub } = await import("@/app/(auth)/brands/[brandId]/discovery/page");
    onTopPlan(<Hub />);
    expect(await screen.findByText("1 journey")).toBeInTheDocument();
    expect(screen.getByText("Couldn't load your competitor comparisons.")).toBeInTheDocument();
  });
});

describe("Competitor comparisons", () => {
  it("each card says when it ran and labels the name match as this answer's", async () => {
    stubFetch((url) =>
      url === `${API}/comparisons`
        ? Response.json([
            {
              id: "c1",
              auditId: "a1",
              competitorDomain: "sydneyplumbers.com.au",
              engine: "chatgpt",
              brandWon: false,
              brandMentioned: true,
              competitorMentioned: true,
              answerCutOff: false,
              runAt: "2026-11-14T23:30:00.000Z",
            },
            {
              id: "c2",
              auditId: "a1",
              competitorDomain: "sydneyplumbers.com.au",
              engine: "claude",
              brandWon: null,
              brandMentioned: true,
              competitorMentioned: false,
              answerCutOff: true,
              runAt: "2026-11-02T01:00:00.000Z",
            },
          ])
        : undefined,
    );
    const { default: Comparisons } = await import(
      "@/app/(auth)/brands/[brandId]/discovery/comparisons/page"
    );
    onTopPlan(<Comparisons />);
    expect(await screen.findByText("ChatGPT · Ran 15 Nov 2026")).toBeInTheDocument();
    expect(screen.getByText("Claude · Ran 2 Nov 2026")).toBeInTheDocument();
    expect(screen.getAllByText("Named in this answer: Yes")).toHaveLength(2);
    expect(screen.queryByText(/Brand mentioned/)).not.toBeInTheDocument();
    expect(
      screen.getByText("Only the start of this answer was kept, so its verdict can't be read."),
    ).toBeInTheDocument();
  });
});
