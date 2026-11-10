// @vitest-environment jsdom
/**
 * Brand-feature locks and pricing claims (8 Nov), part 1 (Sri: "no page shows a raw 403 or an empty
 * error") -- the brand pages whose routes need a plan (lib/pricing/brand-features.ts), as a visitor sees
 * them:
 * - below the plan: the locked card, and no request to the route (the fetch mock records every call);
 * - at the plan: the page's own content, from the route;
 * - a plan refusal anyway (the plan changed mid-session): the locked card, never an error or an empty
 *   state; and a 403 that isn't one (a role, a brand outside the workspace) stays the page's own.
 * Before this, every one of these fetched first and showed "growth plan required" under a blurred overlay,
 * an empty state ("Run an entity check", "Not yet available"), or "Failed to load visibility data".
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PlanTierProvider } from "@/components/domain/plan-tier-context";
import {
  type BrandFeature,
  brandFeatureBuilt,
  brandFeaturePlan,
  brandFeaturePlanName,
} from "@/lib/pricing/brand-features";
import { planRefusalBody } from "@/lib/pricing/plan-refusal";

const BRAND = "22222222-2222-4222-8222-222222222222";
const REPORT = "33333333-3333-4333-8333-333333333333";
const API = `/api/brands/${BRAND}`;

// The Workflow pages' reads: the plan (effectiveTier, below), and their data -- tasks, their counts, drafts --
// each of which calls `data`.
const reads = vi.hoisted(() => {
  const data = vi.fn();
  return {
    tier: "starter",
    data,
    rls: vi.fn(async (_org: string, fn: (tx: unknown) => unknown) =>
      fn({
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: async () => {
                data("drafts");
                return [];
              },
            }),
          }),
        }),
      }),
    ),
  };
});
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: async () => ({ id: "u1", organizationId: "o1" }),
}));
vi.mock("@/lib/pricing/effective-tier", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/pricing/effective-tier")>()),
  effectiveTier: async () => reads.tier,
}));
vi.mock("@/lib/governance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/governance")>()),
  assertBrandAccess: async () => undefined,
}));
vi.mock("@/lib/workflow/task-manager", () => ({
  getTaskCountsByStatus: async () => {
    reads.data("task counts");
    return { open: 1 };
  },
  getTasksByBrand: async () => {
    reads.data("tasks");
    return [];
  },
}));
vi.mock("@/db/client", () => ({ serviceDb: {}, withRlsContext: reads.rls }));

vi.mock("next/navigation", () => ({
  useParams: () => ({ brandId: BRAND, reportId: REPORT }),
  usePathname: () => `/brands/${BRAND}`,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

type Answer = (url: string, init?: RequestInit) => Response | undefined;
let fetchMock: ReturnType<typeof vi.fn>;

/** fetch answers from `answer`; whatever it leaves is a 404. Every call is recorded. */
function stubFetch(answer: Answer) {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    return answer(String(input), init) ?? Response.json({ error: "Not found" }, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
}

const requested = (): string[] => fetchMock.mock.calls.map(([url]) => String(url));
const asked = (route: string) =>
  requested().filter((url) => url === route || url.startsWith(`${route}?`));
const planRefusal = (plan: string) => Response.json(planRefusalBody(plan), { status: 403 });
const lockedCard = (feature: string) => document.querySelector(`[data-plan-locked="${feature}"]`);
// 9 Nov (regression follow-ups, part 6): a feature whose check isn't built (consensus, hallucinations,
// LinkedIn) is part of no plan; in place of the plan lock its page says it isn't available yet.
const notAvailableCard = (feature: string) =>
  document.querySelector(`[data-not-available="${feature}"]`);
const lockBadge = (feature: string) => document.querySelector(`[data-plan-lock="${feature}"]`);

function withPlan(tier: string, node: ReactNode) {
  return render(<PlanTierProvider tier={tier}>{node}</PlanTierProvider>);
}

const page = (load: () => Promise<{ default: () => ReactNode }>) => async () =>
  createElement((await load()).default);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// First renders can take seconds under load (they transform the page's whole graph): load them once.
beforeAll(async () => {
  await Promise.all([
    import("@/app/(auth)/brands/[brandId]/trust/page"),
    import("@/app/(auth)/brands/[brandId]/retrieval/agent-analytics/page"),
    import("@/app/(auth)/brands/[brandId]/visibility/page"),
    import("@/app/(auth)/brands/[brandId]/autopilot/page"),
    import("@/app/(auth)/brands/[brandId]/workflow/page"),
    import("@/app/(auth)/brands/[brandId]/workflow/tasks/page"),
    import("@/app/(auth)/brands/[brandId]/workflow/drafts/page"),
  ]);
}, 120_000);

interface PageCase {
  name: string;
  element: () => Promise<ReactNode>;
  feature: BrandFeature;
  below: string;
  at: string;
  route: string;
  payload: unknown;
  shows: RegExp;
}

const TRUST_SUMMARY = {
  hallucinationRisk: 10,
  citationCount: 3,
  entityScore: null,
  linkedinPresenceScore: null,
  consensusScore: null,
  youtubePresenceScore: null,
  overallTrustScore: null,
  rationale: "Not enough data yet",
  confidence_label: null,
  confidence_note: null,
  top_action: null,
  riskLevel: null,
  riskRationale: "Not enough AI coverage yet",
};

const PAGES: PageCase[] = [
  {
    name: "Trust",
    element: page(() => import("@/app/(auth)/brands/[brandId]/trust/page")),
    feature: "trust_intelligence",
    below: "starter",
    at: "growth",
    route: `${API}/trust`,
    payload: TRUST_SUMMARY,
    shows: /Overall Trust Score/,
  },
  {
    name: "Trust → Consensus",
    element: page(() => import("@/app/(auth)/brands/[brandId]/trust/consensus/page")),
    feature: "consensus_score",
    below: "starter",
    at: "growth",
    route: `${API}/consensus-score`,
    payload: { implemented: false },
    shows: /Not yet available/,
  },
  {
    name: "Trust → Entity score",
    element: page(() => import("@/app/(auth)/brands/[brandId]/trust/entity-score/page")),
    feature: "entity_score",
    below: "starter",
    at: "growth",
    route: `${API}/entity-score`,
    payload: null,
    shows: /Run an entity check/,
  },
  {
    name: "Trust → Hallucinations",
    element: page(() => import("@/app/(auth)/brands/[brandId]/trust/hallucinations/page")),
    feature: "hallucinations",
    below: "starter",
    at: "growth",
    route: `${API}/hallucinations`,
    payload: { implemented: false },
    shows: /Not yet available/,
  },
  {
    name: "LinkedIn presence",
    element: page(() => import("@/app/(auth)/brands/[brandId]/trust/linkedin-presence/page")),
    feature: "linkedin_presence",
    below: "starter",
    at: "growth",
    route: `${API}/linkedin-presence`,
    payload: null,
    shows: /Add your LinkedIn URLs and run an audit/,
  },
  {
    name: "YouTube presence",
    element: page(() => import("@/app/(auth)/brands/[brandId]/trust/youtube-presence/page")),
    feature: "youtube_presence",
    below: "starter",
    at: "growth",
    route: `${API}/youtube-presence`,
    payload: null,
    shows: /Not measured yet/,
  },
  {
    name: "Citation sources",
    element: page(() => import("@/app/(auth)/brands/[brandId]/trust/citation-sources/page")),
    feature: "citation_sources",
    below: "starter",
    at: "growth",
    route: `${API}/citation-sources`,
    payload: { categories: [], enginesWithoutCitations: [], citationCount: 0 },
    shows: /No AI responses have been recorded/,
  },
  {
    name: "Evidence",
    element: page(() => import("@/app/(auth)/brands/[brandId]/trust/evidence/page")),
    feature: "evidence_archive",
    below: "growth",
    at: "agency",
    route: `${API}/evidence`,
    payload: { snapshots: [], citationCount: 0 },
    shows: /No AI responses have been recorded/,
  },
  {
    name: "Retrieval → Agent readiness",
    element: page(() => import("@/app/(auth)/brands/[brandId]/retrieval/agent-readiness/page")),
    feature: "agent_readiness",
    below: "starter",
    at: "growth",
    route: `${API}/agent-readiness`,
    payload: { latest: null, llmstxtDepthScore: null },
    shows: /No agent readiness score yet/,
  },
  {
    name: "Journeys",
    element: page(() => import("@/app/(auth)/brands/[brandId]/discovery/journeys/page")),
    feature: "journeys",
    below: "growth",
    at: "agency",
    route: `${API}/journeys`,
    payload: { journeys: [], templates: [] },
    shows: /No journeys yet/,
  },
  {
    name: "Competitor comparisons",
    element: page(() => import("@/app/(auth)/brands/[brandId]/discovery/comparisons/page")),
    feature: "competitor_comparisons",
    below: "starter",
    at: "growth",
    route: `${API}/comparisons`,
    payload: [],
    shows: /Comparisons will appear after your next audit/,
  },
  {
    name: "Reports",
    element: page(() => import("@/app/(auth)/brands/[brandId]/reports/page")),
    feature: "reports",
    below: "starter",
    at: "growth",
    route: `${API}/reports`,
    payload: [],
    shows: /No reports yet/,
  },
  {
    name: "A report",
    element: page(() => import("@/app/(auth)/brands/[brandId]/reports/[reportId]/page")),
    feature: "reports",
    below: "starter",
    at: "growth",
    route: `${API}/reports/${REPORT}`,
    payload: null,
    shows: /Report not found/,
  },
  {
    name: "Autopilot's prompt trends",
    element: async () => {
      const { PromptTrendSection } = await import(
        "@/components/domain/autopilot/prompt-trend-section"
      );
      return createElement(PromptTrendSection, { brandId: BRAND });
    },
    feature: "prompt_trends",
    below: "starter",
    at: "growth",
    route: `${API}/prompts`,
    payload: { prompts: ["best cafe in Newtown"] },
    // The heading alone: the locked card names the feature too.
    shows: /^Prompt trends$/,
  },
  {
    name: "The dashboard's action progress",
    element: async () => {
      const { ActionProgressTracker } = await import(
        "@/components/domain/autopilot/action-progress-tracker"
      );
      return createElement(ActionProgressTracker, { brandId: BRAND });
    },
    feature: "action_progress",
    below: "starter",
    at: "growth",
    route: `${API}/action-progress`,
    payload: null,
    shows: /No gaps closed yet this month/,
  },
];

describe.each(PAGES)("$name", (c) => {
  it("below its plan: the locked card, and no request", async () => {
    stubFetch(() => undefined);
    withPlan(c.below, await c.element());
    if (brandFeatureBuilt(c.feature)) {
      await waitFor(() => expect(lockedCard(c.feature)).not.toBeNull());
      expect(lockedCard(c.feature)?.textContent).toContain(
        `is part of the ${brandFeaturePlanName(c.feature)} plan`,
      );
    } else {
      await waitFor(() => expect(notAvailableCard(c.feature)).not.toBeNull());
      expect(notAvailableCard(c.feature)?.textContent).toContain("isn't available yet");
      expect(document.querySelector("[data-plan-locked]")).toBeNull();
    }
    expect(asked(c.route)).toEqual([]);
  });

  it("at its plan: its content, from the route", async () => {
    stubFetch((url) => (url.split("?")[0] === c.route ? Response.json(c.payload) : undefined));
    withPlan(c.at, await c.element());
    expect(await screen.findByText(c.shows)).toBeInTheDocument();
    expect(asked(c.route).length).toBeGreaterThan(0);
    expect(document.querySelector("[data-plan-locked]")).toBeNull();
  });

  it("a plan refusal mid-session: the locked card, never an error or an empty state", async () => {
    stubFetch((url) =>
      url.split("?")[0] === c.route ? planRefusal(brandFeaturePlan(c.feature)) : undefined,
    );
    withPlan(c.at, await c.element());
    const card = brandFeatureBuilt(c.feature) ? lockedCard : notAvailableCard;
    await waitFor(() => expect(card(c.feature)).not.toBeNull());
    expect(screen.queryByText(c.shows)).toBeNull();
  });
});

describe("a 403 that isn't the plan's", () => {
  it("stays the page's own: a brand outside the workspace shows no lock", async () => {
    stubFetch((url) =>
      url === `${API}/consensus-score`
        ? Response.json({ error: "Brand access denied" }, { status: 403 })
        : undefined,
    );
    const { default: Consensus } = await import(
      "@/app/(auth)/brands/[brandId]/trust/consensus/page"
    );
    withPlan("growth", createElement(Consensus));
    // The page's own state for a refusal that isn't the plan's: since the af8de42..d1eb5a1 follow-ups
    // (part 1) that's "Couldn't load" with the server's reason. It fell through to "Not yet available".
    expect(await screen.findByText(/Couldn't load the consensus score/)).toBeInTheDocument();
    expect(screen.getByText("Brand access denied")).toBeInTheDocument();
    expect(document.querySelector("[data-plan-locked]")).toBeNull();
  });
});

describe("Trust's tiles", () => {
  it("on Growth, the Evidence tile shows the lock and Agency; the others none", async () => {
    stubFetch((url) => (url === `${API}/trust` ? Response.json(TRUST_SUMMARY) : undefined));
    const { default: Trust } = await import("@/app/(auth)/brands/[brandId]/trust/page");
    withPlan("growth", createElement(Trust));
    await screen.findByText(/Overall Trust Score/);
    expect(lockBadge("evidence_archive")?.textContent).toBe("Part of the Agency plan");
    expect(document.querySelectorAll("[data-plan-lock]")).toHaveLength(1);
  });
});

describe("Agent analytics (Starter; its ratio, CDN check and page coverage Growth)", () => {
  const OVERVIEW = { overview: { volumeByVendor: [], volumeByPurpose: [], verificationRates: [] } };
  const GROWTH_ROUTES = [
    `${API}/agent-analytics/ratio`,
    `${API}/agent-analytics/cdn-join`,
    `${API}/agent-analytics/coverage`,
  ];

  async function analytics(tier: string) {
    stubFetch((url) =>
      url === `${API}/agent-analytics/overview` ? Response.json(OVERVIEW) : undefined,
    );
    const { default: Analytics } = await import(
      "@/app/(auth)/brands/[brandId]/retrieval/agent-analytics/page"
    );
    withPlan(tier, createElement(Analytics));
  }

  it("Free: the locked card, and nothing fetched", async () => {
    await analytics("free");
    await waitFor(() => expect(lockedCard("agent_analytics")).not.toBeNull());
    expect(requested().filter((url) => url.includes("/agent-analytics/"))).toEqual([]);
  });

  it("Starter: the overview, with the three Growth sections locked in place and never fetched", async () => {
    await analytics("starter");
    await waitFor(() => expect(lockedCard("page_coverage")).not.toBeNull());
    expect(lockedCard("crawl_referral_ratio")).not.toBeNull();
    expect(lockedCard("cdn_shield_check")).not.toBeNull();
    expect(asked(`${API}/agent-analytics/overview`)).toHaveLength(1);
    for (const route of GROWTH_ROUTES) expect(asked(route), route).toEqual([]);
  });

  it("Growth: every section fetched, nothing locked", async () => {
    await analytics("growth");
    await waitFor(() => {
      for (const route of GROWTH_ROUTES) expect(asked(route), route).toHaveLength(1);
    });
    expect(document.querySelector("[data-plan-locked]")).toBeNull();
  });
});

describe("Health check and Autopilot (Growth: four routes each)", () => {
  const CASES = [
    {
      name: "Health check",
      feature: "health_check",
      load: () => import("@/app/(auth)/brands/[brandId]/health-check/page"),
      routes: ["latest-audit", "site-readiness", "agent-readiness", "tasks"],
      shows: /Run your first audit to see your Health Check/,
    },
    {
      name: "Autopilot",
      feature: "autopilot",
      load: () => import("@/app/(auth)/brands/[brandId]/autopilot/page"),
      routes: ["latest-audit", "topical-gaps", "tasks", "drafts"],
      shows: null,
    },
  ] as const;

  const answer: Answer = (url) => {
    if (url === API) return Response.json({ brand: { name: "Cafe", vertical: "hospitality" } });
    if (url === `${API}/latest-audit`) return Response.json({ audit: null });
    if (url === `${API}/topical-gaps`) return Response.json({ gaps: [] });
    if (url.startsWith(`${API}/tasks`) || url.startsWith(`${API}/drafts`)) return Response.json([]);
    if (url === `${API}/prompts`) return Response.json({ prompts: [] });
    return undefined;
  };

  it.each(
    CASES,
  )("$name on Starter: the locked page, nothing fetched, not even the plan", async (c) => {
    stubFetch(answer);
    withPlan("starter", createElement((await c.load()).default));
    await waitFor(() => expect(lockedCard(c.feature)).not.toBeNull());
    expect(requested()).toEqual([]);
  });

  it.each(CASES)("$name on Growth: its routes, and its own page", async (c) => {
    stubFetch(answer);
    withPlan("growth", createElement((await c.load()).default));
    await waitFor(() => {
      for (const route of c.routes) expect(asked(`${API}/${route}`).length, route).toBe(1);
    });
    if (c.shows) expect(await screen.findByText(c.shows)).toBeInTheDocument();
    expect(requested()).not.toContain("/api/auth/me");
    expect(document.querySelector("[data-plan-locked]")).toBeNull();
  });

  it.each(CASES)("$name: a plan refusal mid-session locks it", async (c) => {
    stubFetch((url, init) =>
      url === `${API}/latest-audit` ? planRefusal("growth") : answer(url, init),
    );
    withPlan("growth", createElement((await c.load()).default));
    await waitFor(() => expect(lockedCard(c.feature)).not.toBeNull());
  });
});

describe("Visibility (every plan; its Topical gaps panel Growth)", () => {
  const answer: Answer = (url) => {
    if (url === `${API}/visibility`)
      return Response.json({ trends: null, shareOfVoice: null, tier: "starter", brandDomain: "" });
    if (url === `${API}/fan-out`) return Response.json({ groups: [], paused: true });
    if (url === `${API}/topical-gaps`) return Response.json({ gaps: [] });
    return undefined;
  };

  async function visibility(tier: string, given: Answer = answer) {
    stubFetch(given);
    const { default: Visibility } = await import("@/app/(auth)/brands/[brandId]/visibility/page");
    withPlan(tier, createElement(Visibility));
  }

  it("Starter: the page loads, the panel is locked, topical gaps never fetched", async () => {
    await visibility("starter");
    await waitFor(() => expect(lockedCard("topical_gaps")).not.toBeNull());
    await waitFor(() => expect(asked(`${API}/fan-out`)).toHaveLength(1));
    expect(asked(`${API}/topical-gaps`)).toEqual([]);
    expect(screen.queryByText("Failed to load visibility data")).toBeNull();
  });

  it("Growth: topical gaps fetched, no lock", async () => {
    await visibility("growth");
    await waitFor(() => expect(asked(`${API}/topical-gaps`)).toHaveLength(1));
    expect(document.querySelector("[data-plan-locked]")).toBeNull();
  });

  it("a plan refusal for the panel locks the panel, not the page", async () => {
    await visibility("growth", (url, init) =>
      url === `${API}/topical-gaps` ? planRefusal("growth") : answer(url, init),
    );
    await waitFor(() => expect(lockedCard("topical_gaps")).not.toBeNull());
    expect(screen.queryByText("Failed to load visibility data")).toBeNull();
  });
});

describe("Discovery's tiles (Journeys Agency, Comparisons Growth)", () => {
  async function discovery(tier: string) {
    stubFetch((url) => {
      if (url === `${API}/journeys`) return Response.json({ journeys: [] });
      if (url === `${API}/comparisons`) return Response.json([]);
      return undefined;
    });
    const { default: Discovery } = await import("@/app/(auth)/brands/[brandId]/discovery/page");
    withPlan(tier, createElement(Discovery));
    await screen.findByText("Conversational Journeys");
  }

  it("Starter: both tiles locked, with their plans, and nothing fetched", async () => {
    await discovery("starter");
    expect(lockBadge("journeys")?.textContent).toBe("Part of the Agency plan");
    expect(lockBadge("competitor_comparisons")?.textContent).toBe("Part of the Growth plan");
    expect(requested()).toEqual([]);
  });

  it("Growth: Comparisons open and counted; Journeys locked and not fetched", async () => {
    await discovery("growth");
    expect(lockBadge("journeys")).not.toBeNull();
    expect(lockBadge("competitor_comparisons")).toBeNull();
    await waitFor(() => expect(asked(`${API}/comparisons`)).toHaveLength(1));
    expect(asked(`${API}/journeys`)).toEqual([]);
  });

  it("Agency: both open and fetched", async () => {
    await discovery("agency");
    await waitFor(() => expect(asked(`${API}/journeys`)).toHaveLength(1));
    expect(asked(`${API}/comparisons`)).toHaveLength(1);
    expect(document.querySelector("[data-plan-lock]")).toBeNull();
  });
});

describe("the PDF builder's preview (the latest audit, Growth)", () => {
  async function builder(tier: string) {
    stubFetch((url) => {
      if (url === "/api/agency/branding") return Response.json({ branding: null });
      // The route's own shape (app/api/brands/route.ts), which the builder reads since the af8de42..d1eb5a1
      // follow-ups (part 1).
      if (url === "/api/brands") return Response.json({ brands: [{ id: BRAND, name: "Cafe" }] });
      if (url === `${API}/latest-audit`) return Response.json({ audit: null });
      return undefined;
    });
    const { default: Builder } = await import("@/app/(auth)/agency/reports/pdf-builder/page");
    withPlan(tier, createElement(Builder));
    await waitFor(() => expect(asked("/api/brands")).toHaveLength(1));
  }

  it("Starter: the locked card in its place, and the audit never fetched", async () => {
    await builder("starter");
    await waitFor(() => expect(lockedCard("latest_audit_summary")).not.toBeNull());
    expect(asked(`${API}/latest-audit`)).toEqual([]);
  });

  it("Agency: the audit fetched", async () => {
    await builder("agency");
    await waitFor(() => expect(asked(`${API}/latest-audit`)).toHaveLength(1));
    expect(lockedCard("latest_audit_summary")).toBeNull();
  });
});

describe("actions on Growth features", () => {
  it("Action center, Starter: 'Create task' shows the lock and leads to the plans; nothing is posted", async () => {
    stubFetch(() => undefined);
    const { ActionStatusButtons } = await import(
      "@/components/domain/action-center/action-status-buttons"
    );
    withPlan("starter", createElement(ActionStatusButtons, { itemId: "i1", brandId: BRAND }));
    const link = screen.getByText("Create task").closest("a");
    expect(link).toHaveAttribute("href", "/pricing");
    expect(lockBadge("tasks")?.textContent).toBe("Part of the Growth plan");
    expect(requested()).toEqual([]);
  });

  it("Action center, Growth: 'Create task' posts the task", async () => {
    stubFetch((url, init) =>
      url === `${API}/tasks` && init?.method === "POST" ? Response.json({ id: "t1" }) : undefined,
    );
    const { ActionStatusButtons } = await import(
      "@/components/domain/action-center/action-status-buttons"
    );
    withPlan("growth", createElement(ActionStatusButtons, { itemId: "i1", brandId: BRAND }));
    fireEvent.click(screen.getByRole("button", { name: /Create task/ }));
    await waitFor(() => expect(asked(`${API}/tasks`)).toHaveLength(1));
    expect(lockBadge("tasks")).toBeNull();
  });

  it("New task: a plan refusal shows the locked card in the form", async () => {
    stubFetch((url) => (url === `${API}/tasks` ? planRefusal("growth") : undefined));
    const { CreateTaskModal } = await import("@/components/domain/workflow/create-task-modal");
    withPlan(
      "growth",
      createElement(CreateTaskModal, { brandId: BRAND, onClose: vi.fn(), onSuccess: vi.fn() }),
    );
    const title = screen.getByLabelText(/Title/);
    fireEvent.change(title, { target: { value: "Add a sitemap" } });
    fireEvent.submit(title.closest("form") as HTMLFormElement);
    await waitFor(() => expect(lockedCard("tasks")).not.toBeNull());
  });

  it("Drafts: approving after a plan refusal shows the locked card", async () => {
    stubFetch((url) => (url === `${API}/drafts/d1` ? planRefusal("growth") : undefined));
    const { DraftsPageClient } = await import(
      "@/app/(auth)/brands/[brandId]/workflow/drafts/drafts-page-client"
    );
    withPlan(
      "growth",
      createElement(DraftsPageClient, {
        brandId: BRAND,
        drafts: [
          {
            id: "d1",
            title: "About us",
            body: "Draft",
            status: "draft",
            draftType: "page",
            contentFormat: "expert_article",
            formatRecommendationReason: null,
            targetWordCount: null,
            wordCount: 120,
            createdAt: "2026-11-01T00:00:00.000Z",
          },
        ],
      }),
    );
    fireEvent.click(screen.getByText("About us"));
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(lockedCard("content_drafts")).not.toBeNull());
  });

  it("Try again on a failed PDF: a plan refusal shows the lock; a role refusal says why", async () => {
    const { RetryPdfButton } = await import("@/components/domain/communication/retry-pdf-button");
    const retry = `${API}/reports/${REPORT}/retry-pdf`;

    stubFetch((url) => (url === retry ? planRefusal("growth") : undefined));
    withPlan(
      "growth",
      createElement(RetryPdfButton, { brandId: BRAND, reportId: REPORT, onRetrying: vi.fn() }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(lockBadge("reports")).not.toBeNull());
    cleanup();

    stubFetch((url) =>
      url === retry
        ? Response.json({ error: "Only owners, admins and analysts can do this" }, { status: 403 })
        : undefined,
    );
    withPlan(
      "growth",
      createElement(RetryPdfButton, { brandId: BRAND, reportId: REPORT, onRetrying: vi.fn() }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Only owners, admins and analysts can do this",
    );
    expect(lockBadge("reports")).toBeNull();
  });
});

describe("the Workflow pages (server; tasks and drafts Growth)", () => {
  const PAGES_SERVER = [
    {
      name: "Workflow",
      feature: "tasks",
      load: () => import("@/app/(auth)/brands/[brandId]/workflow/page"),
    },
    {
      name: "Remediation Tasks",
      feature: "tasks",
      load: () => import("@/app/(auth)/brands/[brandId]/workflow/tasks/page"),
    },
    {
      name: "Content Drafts",
      feature: "content_drafts",
      load: () => import("@/app/(auth)/brands/[brandId]/workflow/drafts/page"),
    },
  ] as const;

  async function html(load: () => Promise<{ default: (p: never) => Promise<ReactNode> }>) {
    const { default: Page } = await load();
    const element = await Page({ params: Promise.resolve({ brandId: BRAND }) } as never);
    return renderToStaticMarkup(<PlanTierProvider tier={reads.tier}>{element}</PlanTierProvider>);
  }

  it.each(PAGES_SERVER)("$name on Starter: the locked card, and nothing read", async (c) => {
    reads.tier = "starter";
    reads.data.mockClear();
    const out = await html(c.load as never);
    expect(out).toContain(`data-plan-locked="${c.feature}"`);
    expect(out).toContain("is part of the Growth plan");
    expect(reads.data).not.toHaveBeenCalled();
  });

  it.each(PAGES_SERVER)("$name on Growth: its data, no lock", async (c) => {
    reads.tier = "growth";
    reads.data.mockClear();
    const out = await html(c.load as never);
    expect(out).not.toContain("data-plan-locked");
    expect(reads.data).toHaveBeenCalledTimes(1);
  });
});
