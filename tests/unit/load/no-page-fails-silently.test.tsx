// @vitest-environment jsdom
/**
 * Follow-ups from af8de42..d1eb5a1 (10 Nov), part 1 -- no page fails silently. Each of these, when its fetch
 * failed, showed an empty page, "No brands found", default settings as if saved, "Not measured yet" or
 * nothing at all. Now every one says "Couldn't load ..." with Try again (components/shared/load-error.tsx),
 * through one loader (lib/hooks/use-load.ts), and never the empty state or defaults beside it. A form whose
 * settings didn't load has no Save; a refused action says why, in the API's words.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PlanTierProvider } from "@/components/domain/plan-tier-context";

const BRAND = "22222222-2222-4222-8222-222222222222";
const REPORT = "33333333-3333-4333-8333-333333333333";
const ORG = "11111111-1111-4111-8111-111111111111";

vi.mock("next/navigation", () => ({
  useParams: () => ({ brandId: BRAND, reportId: REPORT, orgId: ORG }),
  usePathname: () => `/brands/${BRAND}`,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

type Answer = (url: string, init?: RequestInit) => Response | undefined;

const calls: Array<{ url: string; method: string }> = [];

/** `answer`'s responses; anything it leaves is a 500 with a reason. Every call is recorded. */
function stubFetch(answer: Answer = () => undefined) {
  calls.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? "GET" });
      return answer(url, init) ?? Response.json({ error: "Database unavailable" }, { status: 500 });
    }),
  );
}

const onTopPlan = (node: ReactNode) =>
  render(<PlanTierProvider tier="enterprise">{node}</PlanTierProvider>);

async function expectLoadError(what: RegExp) {
  const alert = await screen.findByText(what, {}, { timeout: 5_000 });
  expect(alert.closest("[data-load-error]")).not.toBeNull();
  // The server's reason, under it.
  expect(screen.getAllByText("Database unavailable").length).toBeGreaterThan(0);
  expect(screen.getAllByRole("button", { name: "Try again" }).length).toBeGreaterThan(0);
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// The first jsdom render of a page can take seconds (its module graph): load them all once, first.
beforeAll(async () => {
  await Promise.all([
    import("@/app/(auth)/settings/audit-trail/page"),
    import("@/app/(auth)/settings/team/page"),
    import("@/app/(auth)/settings/notifications/page"),
    import("@/app/(auth)/settings/data-residency/page"),
    import("@/app/(auth)/agency/client-portals/client-portals-view"),
    import("@/app/(auth)/agency/bulk/bulk-operations-view"),
    import("@/app/(auth)/agency/reports/pdf-builder/page"),
    import("@/components/domain/autopilot/action-progress-tracker"),
    import("@/components/domain/autopilot/prompt-trend-section"),
    import("@/components/domain/autopilot/prompt-trend-sparkline"),
    import("@/components/domain/vertical/pack-browser"),
    import("@/components/domain/vertical/prompt-preview"),
    import("@/components/domain/branding/report-branding-hint"),
    import("@/components/domain/agency/workspace-switcher"),
    import("@/app/(auth)/brands/[brandId]/trust/page"),
    import("@/app/(auth)/brands/[brandId]/trust/entity-score/page"),
    import("@/app/(auth)/brands/[brandId]/trust/youtube-presence/page"),
    import("@/app/(auth)/brands/[brandId]/retrieval/page"),
    import("@/app/(auth)/brands/[brandId]/retrieval/entity-home/page"),
    import("@/app/(auth)/brands/[brandId]/retrieval/crawler-logs/page"),
    import("@/app/(auth)/brands/[brandId]/discovery/comparisons/page"),
    import("@/app/(auth)/brands/[brandId]/discovery/journeys/page"),
    import("@/app/(auth)/brands/[brandId]/reports/page"),
    import("@/app/(auth)/brands/[brandId]/reports/[reportId]/page"),
    import("@/app/(auth)/organizations/[orgId]/delivery-schedules/page"),
    import("@/app/(auth)/organizations/[orgId]/report-templates/page"),
  ]);
}, 120_000);

describe("Sri's list: a failed fetch says it couldn't load", () => {
  it("Audit trail: a failed /api/auth/me is an error, not 'No activity yet'", async () => {
    stubFetch();
    const { default: Page } = await import("@/app/(auth)/settings/audit-trail/page");
    render(<Page />);
    await expectLoadError(/Couldn't load the audit trail/);
    expect(screen.queryByText("No activity yet")).not.toBeInTheDocument();
  });

  it("Team: a failed /api/auth/me is an error, with no empty table and no Free plan's one seat", async () => {
    stubFetch();
    const { default: Page } = await import("@/app/(auth)/settings/team/page");
    render(<Page />);
    await expectLoadError(/Couldn't load your team/);
    expect(screen.queryByText("Member")).not.toBeInTheDocument();
    expect(screen.queryByText(/Free plan/)).not.toBeInTheDocument();
  });

  it("Team: a failed members list is an error too, not an empty team", async () => {
    stubFetch((url) =>
      url === "/api/auth/me"
        ? Response.json({ id: "u0", organizationId: ORG, role: "owner", tier: "agency" })
        : undefined,
    );
    const { default: Page } = await import("@/app/(auth)/settings/team/page");
    render(<Page />);
    await expectLoadError(/Couldn't load your team/);
    expect(screen.queryByText(/0 members/)).not.toBeInTheDocument();
  });

  it("Client portals: a failed invites list is an error, not 'No invites yet'", async () => {
    stubFetch();
    const { ClientPortalsView } = await import(
      "@/app/(auth)/agency/client-portals/client-portals-view"
    );
    render(<ClientPortalsView canCreate />);
    await expectLoadError(/Couldn't load your client portal links/);
    expect(screen.queryByText(/No invites yet/)).not.toBeInTheDocument();
  });

  it("Client portals: a failed /api/brands is an error in Create Invite, not 'No brands found'", async () => {
    stubFetch((url) =>
      url === "/api/client-portal/invites" ? Response.json({ invites: [] }) : undefined,
    );
    const { ClientPortalsView } = await import(
      "@/app/(auth)/agency/client-portals/client-portals-view"
    );
    render(<ClientPortalsView canCreate />);
    fireEvent.click(await screen.findByRole("button", { name: "Create Invite" }));
    await expectLoadError(/Couldn't load your brands/);
    expect(screen.queryByText(/No brands found/)).not.toBeInTheDocument();
  });

  it("Bulk operations: a failed /api/brands is an error, not 'No brands found.'", async () => {
    stubFetch();
    const { BulkOperationsView } = await import("@/app/(auth)/agency/bulk/bulk-operations-view");
    render(<BulkOperationsView />);
    await expectLoadError(/Couldn't load your brands/);
    expect(screen.queryByText("No brands found.")).not.toBeInTheDocument();
  });

  it("PDF builder: a failed branding fetch is an error, never the default colours as saved branding", async () => {
    stubFetch((url) => (url === "/api/brands" ? Response.json({ brands: [] }) : undefined));
    const { default: Page } = await import("@/app/(auth)/agency/reports/pdf-builder/page");
    onTopPlan(<Page />);
    await expectLoadError(/Couldn't load your report branding and brands/);
    expect(screen.queryByText("Branding")).not.toBeInTheDocument();
  });

  it("PDF builder: a failed latest audit is an error, not 'No completed audit ... yet'", async () => {
    stubFetch((url) => {
      if (url === "/api/agency/branding") return Response.json({ branding: null });
      if (url === "/api/brands") return Response.json({ brands: [{ id: BRAND, name: "Omega" }] });
      return undefined;
    });
    const { default: Page } = await import("@/app/(auth)/agency/reports/pdf-builder/page");
    onTopPlan(<Page />);
    await expectLoadError(/Couldn't load the latest audit for Omega/);
    expect(screen.queryByText(/No completed audit/)).not.toBeInTheDocument();
  });

  it("Autopilot progress: a failed fetch is an error, not 'No gaps closed yet'", async () => {
    stubFetch();
    const { ActionProgressTracker } = await import(
      "@/components/domain/autopilot/action-progress-tracker"
    );
    onTopPlan(<ActionProgressTracker brandId={BRAND} />);
    await expectLoadError(/Couldn't load your Autopilot progress/);
    expect(screen.queryByText(/No gaps closed yet/)).not.toBeInTheDocument();
  });

  it("Prompt trends: a failed fetch is an error, not a hidden section", async () => {
    stubFetch();
    const { PromptTrendSection } = await import(
      "@/components/domain/autopilot/prompt-trend-section"
    );
    onTopPlan(<PromptTrendSection brandId={BRAND} />);
    await expectLoadError(/Couldn't load your prompt trends/);
  });

  it("Pack browser: a failed fetch is an error, not the coming-soon packs alone", async () => {
    stubFetch();
    const { PackBrowser } = await import("@/components/domain/vertical/pack-browser");
    render(<PackBrowser mode="browser" />);
    await expectLoadError(/Couldn't load the industry packs/);
    expect(screen.queryByText("Hospitality")).not.toBeInTheDocument();
  });

  it("Report branding hint: a failed fetch says it couldn't check, not nothing", async () => {
    stubFetch();
    const { ReportBrandingHint } = await import(
      "@/components/domain/branding/report-branding-hint"
    );
    onTopPlan(<ReportBrandingHint brandId={BRAND} />);
    await expectLoadError(/Couldn't load your report branding/);
  });
});

describe("Notification preferences: never defaults after a failed load", () => {
  it("a failed load shows the error, no form and no Save -- so nothing can overwrite the real settings", async () => {
    stubFetch();
    const { default: Page } = await import("@/app/(auth)/settings/notifications/page");
    render(<Page />);
    await expectLoadError(/Couldn't load your notification preferences/);
    expect(screen.queryByRole("button", { name: /Save Preferences/ })).not.toBeInTheDocument();
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
    expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(0);
  });

  it("Try again loads the saved settings, and Save sends exactly those", async () => {
    let fail = true;
    const saved = {
      weeklyDigest: false,
      digestEmail: "owner@omega.com.au",
      emailOnDrift: false,
      emailOnAuditComplete: true,
      emailOnScheduleFailure: false,
    };
    stubFetch((url, init) => {
      if (url !== "/api/notification-preferences") return undefined;
      if (init?.method === "PATCH") return Response.json({ preferences: saved });
      return fail ? undefined : Response.json({ preferences: saved, digestToYou: false });
    });
    const { default: Page } = await import("@/app/(auth)/settings/notifications/page");
    render(<Page />);
    await expectLoadError(/Couldn't load your notification preferences/);
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    const save = await screen.findByRole("button", { name: /Save Preferences/ });
    expect(screen.getByDisplayValue("owner@omega.com.au")).toBeInTheDocument();
    // Not the defaults (every switch on): the saved values.
    expect(screen.getAllByRole("switch").map((s) => s.getAttribute("aria-checked"))).toEqual([
      "false",
      "false",
      "true",
      "false",
    ]);
    fireEvent.click(save);
    await waitFor(() => expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(1));
  });
});

describe("the sweep: the same shape elsewhere", () => {
  const brandPages: Array<
    [
      name: string,
      load: () => Promise<{ default: () => ReactNode }>,
      what: RegExp,
      notShown: RegExp,
    ]
  > = [
    [
      "Trust",
      () => import("@/app/(auth)/brands/[brandId]/trust/page"),
      /Couldn't load your trust summary/,
      /Run an audit to see trust intelligence/,
    ],
    [
      "Entity score",
      () => import("@/app/(auth)/brands/[brandId]/trust/entity-score/page"),
      /Couldn't load the entity authority score/,
      /Run an entity check/,
    ],
    [
      "YouTube",
      () => import("@/app/(auth)/brands/[brandId]/trust/youtube-presence/page"),
      /Couldn't load your YouTube presence/,
      /Not measured yet/,
    ],
    [
      "Retrieval",
      () => import("@/app/(auth)/brands/[brandId]/retrieval/page"),
      /Couldn't load your retrieval summary/,
      /Run an audit to see retrieval intelligence/,
    ],
    [
      "Entity home",
      () => import("@/app/(auth)/brands/[brandId]/retrieval/entity-home/page"),
      /Couldn't load your entity home/,
      /Not identified/,
    ],
    [
      "Crawler logs",
      () => import("@/app/(auth)/brands/[brandId]/retrieval/crawler-logs/page"),
      /Couldn't load your crawler visit logs/,
      /No crawler visits recorded yet/,
    ],
    [
      "Comparisons",
      () => import("@/app/(auth)/brands/[brandId]/discovery/comparisons/page"),
      /Couldn't load your competitor comparisons/,
      /Add competitors to your brand/,
    ],
    [
      "Journeys",
      () => import("@/app/(auth)/brands/[brandId]/discovery/journeys/page"),
      /Couldn't load your journeys/,
      /No journeys yet/,
    ],
    [
      "Reports",
      () => import("@/app/(auth)/brands/[brandId]/reports/page"),
      /Couldn't load your reports/,
      /No reports yet/,
    ],
    [
      "A report (a 500)",
      () => import("@/app/(auth)/brands/[brandId]/reports/[reportId]/page"),
      /Couldn't load this report/,
      /Report not found/,
    ],
    [
      "Delivery schedules",
      () => import("@/app/(auth)/organizations/[orgId]/delivery-schedules/page"),
      /Couldn't load your delivery schedules/,
      /No schedules yet/,
    ],
    [
      "Report templates",
      () => import("@/app/(auth)/organizations/[orgId]/report-templates/page"),
      /Couldn't load your report templates/,
      /No templates yet/,
    ],
    [
      "Data residency",
      () => import("@/app/(auth)/settings/data-residency/page"),
      /Couldn't load the data residency information/,
      /No data residency information/,
    ],
    // Found in part 4: `res.ok ? (await res.json()) : null` on every fetch, which the guard's first pattern missed.
    [
      "Autopilot",
      () => import("@/app/(auth)/brands/[brandId]/autopilot/page"),
      /Couldn't load your Autopilot loop/,
      /No autopilot loop yet/,
    ],
    [
      "Health check",
      () => import("@/app/(auth)/brands/[brandId]/health-check/page"),
      /Couldn't load your Health Check/,
      /Run your first audit to see your Health Check/,
    ],
  ];

  it.each(
    brandPages,
  )("%s: a failed fetch is an error, not its empty state", async (_name, load, what, notShown) => {
    stubFetch();
    const { default: Page } = await load();
    onTopPlan(<Page />);
    await expectLoadError(what);
    expect(screen.queryByText(notShown)).not.toBeInTheDocument();
  });

  it("A report that's really gone (a 404) still says 'Report not found'", async () => {
    stubFetch(() => Response.json({ error: "Not found" }, { status: 404 }));
    const { default: Page } = await import("@/app/(auth)/brands/[brandId]/reports/[reportId]/page");
    onTopPlan(<Page />);
    expect(await screen.findByText("Report not found")).toBeInTheDocument();
  });

  it("Workspace switcher: a failed /api/brands says so, not 'No brands'", async () => {
    stubFetch();
    const { WorkspaceSwitcher } = await import("@/components/domain/agency/workspace-switcher");
    render(<WorkspaceSwitcher tier="starter" />);
    expect(await screen.findByText(/Couldn't load your brands/)).toBeInTheDocument();
    expect(screen.queryByText("No brands")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("Sample prompts: a failed fetch is an error, not a vanished preview", async () => {
    stubFetch();
    const { PromptPreview } = await import("@/components/domain/vertical/prompt-preview");
    render(<PromptPreview packId="p1" brandName="Omega" primaryRegion="NSW:Norwest" />);
    await expectLoadError(/Couldn't load the sample prompts/);
  });

  it("A prompt's trend: a failed fetch is an error, not 'Not enough history yet'", async () => {
    stubFetch();
    const { PromptTrendSparkline } = await import(
      "@/components/domain/autopilot/prompt-trend-sparkline"
    );
    onTopPlan(<PromptTrendSparkline brandId={BRAND} promptId="best plumber" />);
    expect(await screen.findByText(/Couldn't load the trend/)).toBeInTheDocument();
    expect(screen.queryByText(/Not enough history yet/)).not.toBeInTheDocument();
  });

  it("a refused Refresh says why, in the API's words", async () => {
    stubFetch((url, init) => {
      if (url === `/api/brands/${BRAND}/youtube-presence` && (init?.method ?? "GET") === "GET")
        return Response.json(null);
      if (url.endsWith("/youtube-presence/refresh"))
        return Response.json(
          { error: "A check is already running for this brand." },
          { status: 409 },
        );
      return undefined;
    });
    const { default: Page } = await import(
      "@/app/(auth)/brands/[brandId]/trust/youtube-presence/page"
    );
    onTopPlan(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Refresh" }));
    expect(
      await screen.findByText("A check is already running for this brand."),
    ).toBeInTheDocument();
  });
});

describe("Run audit says why it didn't start", () => {
  const brand = {
    id: BRAND,
    name: "Omega Services",
    domain: "omega.com.au",
    vertical: "tradies",
    region: "au",
    competitors: [],
    classificationStatus: "complete" as const,
    locationConfirmedAt: "2026-10-18T11:20:59.000Z",
    primaryRegions: ["NSW:Norwest"],
  };
  const props = {
    auditCount: 2,
    recentAudits: [],
    latestAudit: null,
    avgPosition: null,
    totalMentions: 0,
    engineStats: [],
  };

  it("a refused Run audit shows the API's message, not a spinner that stops", async () => {
    const SPEND_CAP =
      "Today's AI spend cap for this workspace is reached (A$20.00). Audits start again tomorrow.";
    stubFetch((url, init) => {
      if (url === "/api/audits" && init?.method === "POST")
        return Response.json(
          { error: "daily_spend_cap_exceeded", message: SPEND_CAP },
          { status: 429 },
        );
      return Response.json({});
    });
    const { BrandDetailClient } = await import("@/components/domain/brand/brand-detail-client");
    onTopPlan(<BrandDetailClient {...props} brand={brand} />);
    fireEvent.click(screen.getByRole("button", { name: /Run audit/ }));
    expect(await screen.findByText(SPEND_CAP)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Run audit/ })).not.toBeDisabled();
  });

  it("a code with no message reads as a sentence, never the code", async () => {
    stubFetch((url, init) =>
      url === "/api/audits" && init?.method === "POST"
        ? Response.json({ error: "brand_needs_confirmation" }, { status: 409 })
        : Response.json({}),
    );
    const { BrandDetailClient } = await import("@/components/domain/brand/brand-detail-client");
    onTopPlan(<BrandDetailClient {...props} brand={brand} />);
    fireEvent.click(screen.getByRole("button", { name: /Run audit/ }));
    expect(await screen.findByText("The audit couldn't be started.")).toBeInTheDocument();
    expect(screen.queryByText("brand_needs_confirmation")).not.toBeInTheDocument();
  });
});
