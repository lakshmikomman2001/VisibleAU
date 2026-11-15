// @vitest-environment jsdom
/**
 * 17 Nov, part 3 (Sri: "any page whose numbers disagree with the audit page destroys trust") -- one consistency test:
 * every brand page that shows an audit figure, rendered for the same audits, says what the audit page says.
 *
 * Hero Home Services' shape: four engines, ten everyday questions and three branded ones; #46 (3 Nov) measured 0% by
 * the old name check and is excluded from trends; #49 (14 Nov) 11 of 40; #50 (15 Nov) 13 of 40 (ChatGPT 9, Claude
 * 1, Gemini 0, Perplexity 3), every mention linking Hero's Localsearch profile, never its site. A task made from
 * #49's recommendations (score_before 80, its expected-impact bucket) was re-audited by #50; a drift alert compares
 * #50 with #49.
 *
 * Each page's figures come from one shared function per measure: the headline (resolveOrganicDimensions +
 * visibilityDisplay), the sources line (sourceCitationCard), the position (positionCard), a change between two
 * audits (lib/visibility/audit-change.ts) and "the latest audit" (latestCompleteAudit's order). A future change
 * that makes any page drift from the audit page fails here. Real DB, real routes and pages.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
process.env.TZ = "UTC";

import { randomUUID } from "node:crypto";
import { cleanup, render, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import postgres from "postgres";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PlanTierProvider } from "@/components/domain/plan-tier-context";
import { EARLIER_MENTION_CHECK_REASON } from "@/lib/audit/trend-exclusion";
import { type ReportFixture, seedReportFixture } from "@/tests/helpers/report-fixture";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const { session, params } = vi.hoisted(() => ({
  session: { organizationId: "", userId: "" },
  params: { brandId: "" },
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({
    id: session.userId,
    organizationId: session.organizationId,
    name: "Sam Tester",
    role: "owner",
    organization: { id: session.organizationId, name: "Hero's agency", region: "au", metadata: {} },
  })),
}));
vi.mock("@/lib/auth/platform-admin", () => ({
  checkPlatformAdmin: vi.fn(async () => ({ allowed: false, userId: null })),
  isPlatformAdmin: vi.fn(async () => false),
}));
vi.mock("@/lib/governance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/governance")>()),
  assertTier: vi.fn(async () => undefined),
  assertBrandAccess: vi.fn(async () => undefined),
  recordAction: vi.fn(async () => undefined),
}));
// The dashboard's product tour reads CSS custom properties jsdom doesn't compute; it isn't what's tested here.
vi.mock("react-joyride", () => ({ Joyride: () => null }));
vi.mock("next/navigation", () => ({
  useParams: () => params,
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/brands",
  useSearchParams: () => new URLSearchParams(),
  redirect: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
}));

const W45_46 = "2026-11-03T01:00:00.000Z";
const W46_49 = "2026-11-14T01:00:00.000Z";
const W46_50 = "2026-11-15T01:00:00.000Z";
const LOCALSEARCH = {
  domain: "localsearch.com.au",
  url: "https://www.localsearch.com.au/profile/hero-home-services/castle-hill-nsw/abc123",
};

let client: ReturnType<typeof postgres>;
let hero: ReportFixture;
let taskId: string;

const squash = (s: string) =>
  s
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ");

async function serverPage(element: Promise<unknown>): Promise<string> {
  return squash(renderToStaticMarkup((await element) as ReactElement));
}

/** A client page's fetches, answered by the real route handlers. */
function routeFetch() {
  return vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const req = new Request(`http://localhost${url}`);
    const m = url.match(/\/api\/brands\/([0-9a-f-]+)(?:\/([a-z-]+))?/);
    if (!m) return new Response("not found", { status: 404 });
    const [, brandId, route] = m;
    const ctx = { params: Promise.resolve({ brandId }) };
    const routes: Record<
      string,
      () => Promise<{ GET: (r: Request, c: typeof ctx) => Promise<Response> }>
    > = {
      "": () => import("@/app/api/brands/[brandId]/route"),
      visibility: () => import("@/app/api/brands/[brandId]/visibility/route"),
      "fan-out": () => import("@/app/api/brands/[brandId]/fan-out/route"),
      "competitive-benchmark": () =>
        import("@/app/api/brands/[brandId]/competitive-benchmark/route"),
      "latest-audit": () => import("@/app/api/brands/[brandId]/latest-audit/route"),
      "site-readiness": () => import("@/app/api/brands/[brandId]/site-readiness/route"),
      "agent-readiness": () => import("@/app/api/brands/[brandId]/agent-readiness/route"),
      tasks: () => import("@/app/api/brands/[brandId]/tasks/route"),
      drafts: () => import("@/app/api/brands/[brandId]/drafts/route"),
      prompts: () => import("@/app/api/brands/[brandId]/prompts/route"),
      "citation-failure": () => import("@/app/api/brands/[brandId]/citation-failure/route"),
    };
    const load = routes[route ?? ""];
    if (!load) return new Response("not found", { status: 404 });
    return (await load()).GET(req, ctx);
  });
}

async function clientPage(load: () => Promise<{ default: () => ReactElement }>, until: string) {
  session.organizationId = hero.orgId;
  params.brandId = hero.brandId;
  vi.stubGlobal("fetch", routeFetch());
  const Page = (await load()).default;
  render(
    <PlanTierProvider tier="agency">
      <Page />
    </PlanTierProvider>,
  );
  await waitFor(() => expect(document.body.textContent).toContain(until), { timeout: 20_000 });
  return (document.body.textContent ?? "").replace(/\s+/g, " ");
}

async function api(route: string): Promise<unknown> {
  session.organizationId = hero.orgId;
  const res = await routeFetch()(`/api/brands/${hero.brandId}/${route}`);
  expect(res.status, route).toBe(200);
  return res.json();
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  session.userId = randomUUID();
  hero = await seedReportFixture(client, {
    brandName: "Hero Home Services",
    tier: "agency",
    audits: [
      {
        number: 46,
        completedAt: W45_46,
        mentions: {},
        excludedFromTrendsReason: EARLIER_MENTION_CHECK_REASON,
      },
      {
        number: 49,
        completedAt: W46_49,
        mentions: {
          chatgpt: [1, 2, 3, 4, 5, 6, 7, 8],
          claude: [1],
          gemini: [],
          perplexity: [1, 2],
        },
        mentionSources: [LOCALSEARCH],
      },
      {
        number: 50,
        completedAt: W46_50,
        mentions: {
          chatgpt: [1, 2, 3, 4, 5, 6, 7, 8, 9],
          claude: [1],
          gemini: [],
          perplexity: [1, 2, 3],
        },
        mentionSources: [LOCALSEARCH],
      },
    ],
  });
  taskId = randomUUID();
  await client`
    INSERT INTO remediation_tasks (id, organization_id, brand_id, audit_id, reaudit_id, title, status, priority,
                                   score_before, score_after, lift_achieved, completed_at)
    VALUES (${taskId}, ${hero.orgId}, ${hero.brandId}, ${hero.audits[49]}, ${hero.audits[50]},
            'Add a page for emergency plumbing', 'complete', 1, '80.00', '32.50', '-47.50', now())
  `;
  await client`
    INSERT INTO drift_alerts (organization_id, brand_id, current_audit_id, previous_audit_id, severity,
                              score_delta, dimension_deltas)
    VALUES (${hero.orgId}, ${hero.brandId}, ${hero.audits[50]}, ${hero.audits[49]}, 'within_noise', '4.50',
            ${client.json({ sentiment: { delta: 30, severity: "significant_rise" } })})
  `;
}, 120_000);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await client`DELETE FROM drift_alerts WHERE brand_id = ${hero.brandId}`;
  await client`DELETE FROM remediation_tasks WHERE brand_id = ${hero.brandId}`;
  await hero?.cleanup();
  await client?.end();
});

// The audit page's own figures for #50: the reference every other page is held to.
const AUDIT_50 = { value: "33%", counts: "13 of 40", sources: "13 of 13 mentions linked a source" };
const AUDIT_49 = { value: "28%", counts: "11 of 40" };
const CHANGE_49_50 = "Audit #49 → #50: 28% (11 of 40) → 33% (13 of 40), up 5 points";

describe("the audit page (the reference)", () => {
  it("#50: 33%, 13 of 40, 13 of 13 mentions linked a source, ChatGPT 9 of 10; #49: 28%, 11 of 40", async () => {
    session.organizationId = hero.orgId;
    const AuditPage = (await import("@/app/(auth)/audits/[auditId]/page")).default;
    const page50 = await serverPage(
      AuditPage({
        params: Promise.resolve({ auditId: hero.audits[50] }),
        searchParams: Promise.resolve({}),
      }),
    );
    expect(page50).toContain(AUDIT_50.value);
    expect(page50).toContain(AUDIT_50.counts);
    expect(page50).toContain(AUDIT_50.sources);
    expect(page50).toContain("9 of 10");
    const page49 = await serverPage(
      AuditPage({
        params: Promise.resolve({ auditId: hero.audits[49] }),
        searchParams: Promise.resolve({}),
      }),
    );
    expect(page49).toContain(AUDIT_49.value);
    expect(page49).toContain(AUDIT_49.counts);
  }, 60_000);
});

describe("every other page says the same", () => {
  it("the brand page: the Visibility tile names audit #50; typical position, mentions and the chart agree", async () => {
    session.organizationId = hero.orgId;
    const { resolveAuditDimensionsAndHeadline } = await import(
      "@/lib/scoring/resolve-audit-dimensions"
    );
    const { positionCard } = await import("@/lib/scoring/measured-display");
    const { withRlsContext } = await import("@/db/client");
    const resolved = await withRlsContext(hero.orgId, (tx) =>
      resolveAuditDimensionsAndHeadline(tx, hero.audits[50]),
    );
    const position = positionCard(resolved);
    const Page = (await import("@/app/(auth)/brands/[brandId]/page")).default;
    const html = renderToStaticMarkup(
      (await Page({ params: Promise.resolve({ brandId: hero.brandId }) } as never)) as ReactElement,
    );
    const text = squash(html);
    expect(text).toContain(AUDIT_50.value);
    expect(text).toContain(`${AUDIT_50.counts} · audit #50`);
    if (position.kind === "measured") expect(text).toContain(position.detail);
    // Verified mentions across the three audits: 0 + 11 + 13.
    expect(text).toMatch(/Total mentions \(3 audits\) 24/);
    expect(text).toContain("9 of 10");
    // The chart: each bar's audit and figure; #46 (excluded from trends) isn't drawn.
    expect(html).toContain(`Audit #49: ${AUDIT_49.value} (${AUDIT_49.counts})`);
    expect(html).toContain(`Audit #50: ${AUDIT_50.value} (${AUDIT_50.counts})`);
    expect(html).not.toContain("Audit #46:");
    expect(text).not.toMatch(/weeks? ago/);
  }, 60_000);

  it("the brands list: 33%, 13 of 40", async () => {
    session.organizationId = hero.orgId;
    const Page = (await import("@/app/(auth)/brands/page")).default;
    const text = await serverPage(Page());
    expect(text).toContain(AUDIT_50.value);
    expect(text).toContain(AUDIT_50.counts);
  }, 60_000);

  it("the Visibility page: Mentions and sources and Share of Voice are audit #50's; no trend row, no volatility", async () => {
    const text = await clientPage(
      () => import("@/app/(auth)/brands/[brandId]/visibility/page") as never,
      "Mentions and sources",
    );
    await waitFor(() => expect(document.body.textContent).toContain("Audit #50"));
    expect(text).toContain(`in ${AUDIT_50.counts} everyday answers`);
    expect(text).toContain("13 of 13");
    expect(text).not.toMatch(/Volatility|81\.8%|0\.0%|Known but Untrusted/);
    const body = (await api("visibility")) as Record<string, unknown>;
    expect(body).not.toHaveProperty("trends");
  }, 60_000);

  it("the Health Check: AI presence 33%, named in 13 of 40, latest audit #50", async () => {
    const text = await clientPage(
      () => import("@/app/(auth)/brands/[brandId]/health-check/page") as never,
      "AI presence",
    );
    expect(text).toContain(AUDIT_50.value);
    expect(text).toContain(`Named in ${AUDIT_50.counts} answers`);
    expect(text).toContain("latest audit #50");
  }, 60_000);

  it("Autopilot: step 1 is audit #50's 33% (13 of 40)", async () => {
    const text = await clientPage(
      () => import("@/app/(auth)/brands/[brandId]/autopilot/page") as never,
      "Audit complete",
    );
    expect(text).toContain(`Visibility ${AUDIT_50.value} (${AUDIT_50.counts}) · audit #50`);
    expect(text).not.toMatch(/\d+ prompts/);
  }, 60_000);

  it("the task: its re-audit is #49 → #50 as their audit pages show them, never the 80 expected-impact bucket", async () => {
    const tasks = (await api("tasks")) as Array<{
      id: string;
      change: { kind: string; line?: string };
    }>;
    const task = tasks.find((t) => t.id === taskId);
    expect(task?.change).toMatchObject({ kind: "measured", line: CHANGE_49_50 });
    const { TaskCard } = await import("@/components/domain/workflow/task-card");
    const { container } = render(
      createElement(TaskCard, {
        ...(task as unknown as Parameters<typeof TaskCard>[0]),
        title: "Add a page for emergency plumbing",
      }),
    );
    expect(container.textContent).toContain(CHANGE_49_50);
    expect(container.textContent).not.toMatch(/\b80\b|-47\.5/);
  }, 60_000);

  it("the dashboard's tracker: 1 task re-audited this month, up, the latest change in full", async () => {
    session.organizationId = hero.orgId;
    const { GET } = await import("@/app/api/brands/[brandId]/action-progress/route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ brandId: hero.brandId }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      reaudits: { measured: number; up: number; latest: string | null };
    };
    expect(body.reaudits).toMatchObject({ measured: 1, up: 1, latest: CHANGE_49_50 });
    expect(JSON.stringify(body)).not.toMatch(/measuredImpact|-47\.5/);
  }, 60_000);

  it("the dashboard: audit #50's 33% and 13 of 40", async () => {
    session.organizationId = hero.orgId;
    const Page = (await import("@/app/(auth)/dashboard/page")).default;
    const text = await serverPage(Page());
    expect(text).toContain(AUDIT_50.value);
    expect(text).toContain(AUDIT_50.counts);
  }, 120_000);

  it("the agency dashboard: the average is 33%, and the top mover is #49 (11 of 40) → #50 (13 of 40)", async () => {
    session.organizationId = hero.orgId;
    const Page = (await import("@/app/(auth)/agency/page")).default;
    const text = await serverPage(Page());
    expect(text).toContain(`Avg Visibility ${AUDIT_50.value}`);
    expect(text).toContain(`${AUDIT_49.value} → ${AUDIT_50.value}`);
    expect(text).toContain(`#49 (${AUDIT_49.counts}) → #50 (${AUDIT_50.counts})`);
  }, 60_000);

  it("drift alerts: #49 → #50 from the audits (a rise), never a stored sentiment change", async () => {
    session.organizationId = hero.orgId;
    const Page = (await import("@/app/(auth)/drift-alerts/page")).default;
    const text = await serverPage(Page());
    expect(text).toContain(CHANGE_49_50);
    expect(text).toContain("Rise");
    expect(text).not.toMatch(/sentiment|Composite score drift|\+4\.5/i);
  }, 60_000);

  it("Citation Failure: counted in audit #50's answers", async () => {
    const body = (await api("citation-failure")) as { diagnoses: Array<{ evidence: string }> };
    expect(body.diagnoses.map((d) => d.evidence).join("\n")).toContain(
      "In audit #50, 13 of 40 everyday answers linked a source",
    );
    expect(JSON.stringify(body)).not.toMatch(/Fixing this could improve|is cited \d+ times/);
  }, 60_000);

  it("Prompt trends: the latest audit's everyday questions, audit by audit with counts", async () => {
    const { prompts } = (await api("prompts")) as { prompts: string[] };
    expect(prompts).toHaveLength(10);
    expect(prompts.some((p) => p.includes("Omega") || p.includes("Hero Home"))).toBe(false);
    session.organizationId = hero.orgId;
    const { GET } = await import("@/app/api/brands/[brandId]/prompts/[promptId]/trend/route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ brandId: hero.brandId, promptId: encodeURIComponent(prompts[0]) }),
    } as never);
    const { trend } = (await res.json()) as {
      trend: Array<{ auditNumber: number; mentioned: number; answers: number }>;
    };
    // #46 is excluded from trends; #49 and #50 each asked it of four engines.
    expect(trend.map((p) => p.auditNumber)).toEqual([49, 50]);
    expect(trend.every((p) => p.answers === 4)).toBe(true);
  }, 60_000);
});
