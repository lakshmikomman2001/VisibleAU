/**
 * 3 Nov ("A cancelled plan must stop granting paid features everywhere"). An
 * Agency workspace is taken through its life by the real Stripe webhook route
 * (only the signature check and Stripe's API are stand-ins), and at each stage
 * the real gates are called against the local test database:
 * - while a cancellation is scheduled, every feature stays;
 * - when the period has ended, or the subscription is deleted, the workspace
 *   is free everywhere: the Agency Dashboard, report branding and every API,
 *   page, cron and audit that reads a plan;
 * - Stripe doesn't promise to deliver events in order, so a late event can't
 *   bring a cancelled plan back;
 * - paying again does.
 *
 * tests/helpers/plan-gates.ts lists every gate; a test below checks each listed
 * API route is walked here. tests/unit/pricing/effective-tier-guard.test.ts
 * proves that list against the source.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ASSERT_TIER_GATES, DIRECT_GATES } from "@/tests/helpers/plan-gates";
import { solidPng } from "@/tests/helpers/png";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const currentUser = vi.hoisted(() => ({ value: null as Record<string, unknown> | null }));
const captured = vi.hoisted(() => ({
  shell: null as Record<string, unknown> | null,
  billing: null as Record<string, unknown> | null,
  schedule: null as Record<string, unknown> | null,
  brandDetail: null as Record<string, unknown> | null,
}));
const stripeApi = vi.hoisted(() => ({
  retrieve: null as ((id: string) => unknown) | null,
  update: null as ((id: string, params: unknown) => unknown) | null,
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => currentUser.value),
}));
vi.mock("@/lib/auth/server", () => ({
  auth: { api: { getSession: vi.fn(async () => ({ user: { id: "plan-gates", name: "Owner" } })) } },
}));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  notFound: vi.fn(),
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
// The signature is Stripe's business; the events are ours.
vi.mock("@/lib/stripe/verify-webhook", () => ({
  verifyStripeWebhook: vi.fn(async (req: Request) => JSON.parse(await req.text())),
}));
vi.mock("@/lib/stripe/client", () => ({
  getStripe: () => ({
    subscriptions: {
      retrieve: async (id: string) => stripeApi.retrieve?.(id),
      update: async (id: string, params: unknown) => stripeApi.update?.(id, params),
    },
  }),
}));
vi.mock("@/lib/storage", async () => {
  const { LocalStorageAdapter } = await import("@/lib/storage/local-adapter");
  return { getStorage: () => new LocalStorageAdapter() };
});
// What each page hands the client component that shows the plan.
vi.mock("@/components/domain/app-shell", () => ({
  AppShell: (props: Record<string, unknown>) => {
    captured.shell = props;
    return null;
  },
}));
vi.mock("@/app/(auth)/settings/billing/billing-view", () => ({
  default: (props: Record<string, unknown>) => {
    captured.billing = props;
    return null;
  },
}));
vi.mock("@/app/(auth)/brands/[brandId]/schedule/brand-schedule-view", () => ({
  default: (props: Record<string, unknown>) => {
    captured.schedule = props;
    return null;
  },
}));
vi.mock("@/components/domain/brand/brand-detail-client", () => ({
  BrandDetailClient: (props: Record<string, unknown>) => {
    captured.brandDetail = props;
    return null;
  },
}));

const ORG = randomUUID();
const OWNER = randomUUID();
const BRAND = randomUUID();
const OTHER_BRAND = randomUUID();
const AUDIT = randomUUID();
const ACTION_ITEM = randomUUID();
const JOURNEY = randomUUID();
const MISSING = randomUUID();
const RUN = ORG.slice(0, 8);
const SUB = `sub_gates_${RUN}`;
const CUSTOMER = `cus_gates_${RUN}`;
const METHOD_KEY = `plan-gates-${RUN}`;
const DAY_S = 24 * 60 * 60;
const nowS = () => Math.floor(Date.now() / 1000);
const PERIOD_START = nowS() - 20 * DAY_S;
const PERIOD_END = nowS() + 10 * DAY_S;

let sql: ReturnType<typeof postgres>;
let eventNumber = 0;
const eventIds: string[] = [];

function agencyPrice(): string {
  const price = process.env.STRIPE_PRICE_AGENCY_MONTHLY;
  if (!price) throw new Error("STRIPE_PRICE_AGENCY_MONTHLY isn't set in .env.test.local");
  return price;
}

/** A subscription as this Stripe API version sends it: the period is on the item. */
function stripeSubscription(over: Record<string, unknown> = {}, id = SUB) {
  return {
    id,
    status: "active",
    cancel_at_period_end: false,
    items: {
      data: [
        {
          current_period_start: PERIOD_START,
          current_period_end: PERIOD_END,
          price: { id: agencyPrice(), recurring: { interval: "month" } },
        },
      ],
    },
    ...over,
  };
}

async function deliver(type: string, object: unknown) {
  const { POST } = await import("@/app/api/webhooks/stripe/route");
  const id = `evt_gates_${RUN}_${++eventNumber}`;
  eventIds.push(id);
  const res = await POST(
    new Request("http://localhost/api/webhooks/stripe", {
      method: "POST",
      body: JSON.stringify({ id, type, data: { object } }),
    }),
  );
  expect(res.status).toBe(200);
}

async function subscriptionRow() {
  const [row] = await sql<
    {
      tier: string;
      status: string;
      cancel_at_period_end: boolean;
      current_period_end: Date | null;
      stripe_subscription_id: string;
    }[]
  >`
    SELECT tier, status, cancel_at_period_end, current_period_end, stripe_subscription_id
    FROM subscriptions WHERE organization_id = ${ORG}
  `;
  return row;
}

async function organizationTier() {
  const [row] = await sql<{ tier: string }[]>`SELECT tier FROM organizations WHERE id = ${ORG}`;
  return row.tier;
}

/** Sets the row directly: a fresh, plainly active Agency plan, or a stage's starting point. */
async function setRow(over: {
  status?: string;
  cancelAtPeriodEnd?: boolean;
  periodStart?: number;
  periodEnd?: number;
}) {
  await sql`DELETE FROM subscriptions WHERE organization_id = ${ORG}`;
  await sql`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status, cancel_at_period_end, current_period_start, current_period_end)
    VALUES (${ORG}, ${CUSTOMER}, ${SUB}, ${agencyPrice()}, 'agency', 'monthly', ${over.status ?? "active"}, ${over.cancelAtPeriodEnd ?? false},
      ${new Date((over.periodStart ?? PERIOD_START) * 1000)}, ${new Date((over.periodEnd ?? PERIOD_END) * 1000)})
  `;
  await sql`UPDATE organizations SET tier = 'agency' WHERE id = ${ORG}`;
}

// ---------------------------------------------------------------- the API gates

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type RouteHandler = (
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>> },
) => Promise<Response>;

interface RouteCase {
  file: string;
  load: () => Promise<unknown>;
  methods: Method[];
}

const b = "app/api/brands/[brandId]";

/** Every API route on the lists whose answer to a cancelled workspace is 403. */
const PLAN_REFUSING_ROUTES: RouteCase[] = [
  {
    file: `${b}/agent-analytics/cdn-join/route.ts`,
    methods: ["GET"],
    load: () => import("@/app/api/brands/[brandId]/agent-analytics/cdn-join/route"),
  },
  {
    file: `${b}/agent-analytics/coverage/route.ts`,
    methods: ["GET"],
    load: () => import("@/app/api/brands/[brandId]/agent-analytics/coverage/route"),
  },
  {
    file: `${b}/agent-analytics/overview/route.ts`,
    methods: ["GET"],
    load: () => import("@/app/api/brands/[brandId]/agent-analytics/overview/route"),
  },
  {
    file: `${b}/agent-analytics/ratio/route.ts`,
    methods: ["GET"],
    load: () => import("@/app/api/brands/[brandId]/agent-analytics/ratio/route"),
  },
  {
    file: `${b}/agent-analytics/referrals/route.ts`,
    methods: ["POST"],
    load: () => import("@/app/api/brands/[brandId]/agent-analytics/referrals/route"),
  },
  {
    file: `${b}/agent-readiness/refresh/route.ts`,
    methods: ["POST"],
    load: () => import("@/app/api/brands/[brandId]/agent-readiness/refresh/route"),
  },
  {
    file: `${b}/agent-readiness/route.ts`,
    methods: ["GET"],
    load: () => import("@/app/api/brands/[brandId]/agent-readiness/route"),
  },
  {
    file: `${b}/citation-sources/route.ts`,
    methods: ["GET"],
    load: () => import("@/app/api/brands/[brandId]/citation-sources/route"),
  },
  {
    file: `${b}/consensus-score/refresh/route.ts`,
    methods: ["POST"],
    load: () => import("@/app/api/brands/[brandId]/consensus-score/refresh/route"),
  },
  {
    file: `${b}/consensus-score/route.ts`,
    methods: ["GET"],
    load: () => import("@/app/api/brands/[brandId]/consensus-score/route"),
  },
  {
    file: `${b}/crawler-logs/upload/route.ts`,
    methods: ["POST"],
    load: () => import("@/app/api/brands/[brandId]/crawler-logs/upload/route"),
  },
  {
    file: `${b}/drafts/[id]/route.ts`,
    methods: ["GET", "PATCH"],
    load: () => import("@/app/api/brands/[brandId]/drafts/[id]/route"),
  },
  {
    file: `${b}/drafts/route.ts`,
    methods: ["GET", "POST"],
    load: () => import("@/app/api/brands/[brandId]/drafts/route"),
  },
  {
    file: `${b}/entity-score/refresh/route.ts`,
    methods: ["POST"],
    load: () => import("@/app/api/brands/[brandId]/entity-score/refresh/route"),
  },
  {
    file: `${b}/entity-score/route.ts`,
    methods: ["GET"],
    load: () => import("@/app/api/brands/[brandId]/entity-score/route"),
  },
  {
    file: `${b}/evidence/route.ts`,
    methods: ["GET"],
    load: () => import("@/app/api/brands/[brandId]/evidence/route"),
  },
  {
    file: `${b}/hallucinations/[id]/route.ts`,
    methods: ["PATCH"],
    load: () => import("@/app/api/brands/[brandId]/hallucinations/[id]/route"),
  },
  {
    file: `${b}/hallucinations/route.ts`,
    methods: ["GET"],
    load: () => import("@/app/api/brands/[brandId]/hallucinations/route"),
  },
  {
    file: `${b}/journeys/[journeyId]/results/route.ts`,
    methods: ["GET"],
    load: () => import("@/app/api/brands/[brandId]/journeys/[journeyId]/results/route"),
  },
  {
    file: `${b}/journeys/[journeyId]/run/route.ts`,
    methods: ["POST"],
    load: () => import("@/app/api/brands/[brandId]/journeys/[journeyId]/run/route"),
  },
  {
    file: `${b}/journeys/route.ts`,
    methods: ["GET", "POST"],
    load: () => import("@/app/api/brands/[brandId]/journeys/route"),
  },
  {
    file: `${b}/latest-audit/route.ts`,
    methods: ["GET"],
    load: () => import("@/app/api/brands/[brandId]/latest-audit/route"),
  },
  {
    file: `${b}/linkedin-presence/refresh/route.ts`,
    methods: ["POST"],
    load: () => import("@/app/api/brands/[brandId]/linkedin-presence/refresh/route"),
  },
  {
    file: `${b}/linkedin-presence/route.ts`,
    methods: ["GET"],
    load: () => import("@/app/api/brands/[brandId]/linkedin-presence/route"),
  },
  {
    file: `${b}/reports/[reportId]/retry-pdf/route.ts`,
    methods: ["POST"],
    load: () => import("@/app/api/brands/[brandId]/reports/[reportId]/retry-pdf/route"),
  },
  {
    file: `${b}/reports/[reportId]/route.ts`,
    methods: ["GET"],
    load: () => import("@/app/api/brands/[brandId]/reports/[reportId]/route"),
  },
  {
    file: `${b}/reports/generate/route.ts`,
    methods: ["POST"],
    load: () => import("@/app/api/brands/[brandId]/reports/generate/route"),
  },
  {
    file: `${b}/reports/route.ts`,
    methods: ["GET"],
    load: () => import("@/app/api/brands/[brandId]/reports/route"),
  },
  {
    file: `${b}/site-readiness/route.ts`,
    methods: ["GET"],
    load: () => import("@/app/api/brands/[brandId]/site-readiness/route"),
  },
  {
    file: `${b}/tasks/[id]/complete/route.ts`,
    methods: ["POST"],
    load: () => import("@/app/api/brands/[brandId]/tasks/[id]/complete/route"),
  },
  {
    file: `${b}/tasks/[id]/route.ts`,
    methods: ["GET", "PATCH"],
    load: () => import("@/app/api/brands/[brandId]/tasks/[id]/route"),
  },
  {
    file: `${b}/tasks/route.ts`,
    methods: ["GET", "POST"],
    load: () => import("@/app/api/brands/[brandId]/tasks/route"),
  },
  {
    file: `${b}/topical-gaps/route.ts`,
    methods: ["GET"],
    load: () => import("@/app/api/brands/[brandId]/topical-gaps/route"),
  },
  {
    file: `${b}/trust/route.ts`,
    methods: ["GET"],
    load: () => import("@/app/api/brands/[brandId]/trust/route"),
  },
  {
    file: `${b}/youtube-presence/refresh/route.ts`,
    methods: ["POST"],
    load: () => import("@/app/api/brands/[brandId]/youtube-presence/refresh/route"),
  },
  {
    file: `${b}/youtube-presence/route.ts`,
    methods: ["GET"],
    load: () => import("@/app/api/brands/[brandId]/youtube-presence/route"),
  },
  {
    file: `${b}/action-progress/route.ts`,
    methods: ["GET"],
    load: () => import("@/app/api/brands/[brandId]/action-progress/route"),
  },
  {
    file: `${b}/comparisons/route.ts`,
    methods: ["GET"],
    load: () => import("@/app/api/brands/[brandId]/comparisons/route"),
  },
  {
    file: `${b}/prompts/[promptId]/trend/route.ts`,
    methods: ["GET"],
    load: () => import("@/app/api/brands/[brandId]/prompts/[promptId]/trend/route"),
  },
  {
    file: `${b}/prompts/route.ts`,
    methods: ["GET"],
    load: () => import("@/app/api/brands/[brandId]/prompts/route"),
  },
  {
    file: "app/api/organizations/[orgId]/delivery-schedules/route.ts",
    methods: ["GET", "POST"],
    load: () => import("@/app/api/organizations/[orgId]/delivery-schedules/route"),
  },
];

/** The other API gates on the lists: a limit or a field, each tested by name below. */
const OTHER_API_GATES = [
  "app/api/audit-schedules/route.ts",
  "app/api/auth/me/route.ts",
  "app/api/brands/[brandId]/competitive-benchmark/route.ts",
  "app/api/brands/[brandId]/visibility/route.ts",
  "app/api/brands/route.ts",
  "app/api/citability-methods/route.ts",
  // The seat limit: tests/integration/plan-feature-gates.integration.test.ts.
  "app/api/organizations/[orgId]/members/invite/route.ts",
];

const READ_CALLS = PLAN_REFUSING_ROUTES.filter((r) => r.methods.includes("GET")).map(
  (r) => [r.file, r] as const,
);
const EVERY_CALL = PLAN_REFUSING_ROUTES.flatMap((r) =>
  r.methods.map((method) => [`${method} ${r.file}`, r, method] as const),
);

async function call(route: RouteCase, method: Method, body?: unknown): Promise<Response> {
  const mod = (await route.load()) as Record<string, RouteHandler>;
  const handler = mod[method];
  if (!handler) throw new Error(`${route.file} has no ${method}`);
  const request = new NextRequest("http://localhost/api/test", {
    method,
    ...(method === "GET"
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) }),
  });
  return handler(request, {
    params: Promise.resolve({
      brandId: BRAND,
      orgId: ORG,
      id: MISSING,
      reportId: MISSING,
      journeyId: JOURNEY,
      promptId: MISSING,
    }),
  });
}

async function jsonOf(load: () => Promise<unknown>, method: Method = "GET") {
  const res = await call({ file: "", methods: [method], load }, method);
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

const loadMe = () => import("@/app/api/auth/me/route");
const loadBenchmark = () => import("@/app/api/brands/[brandId]/competitive-benchmark/route");
const loadVisibility = () => import("@/app/api/brands/[brandId]/visibility/route");
const loadMethods = () => import("@/app/api/citability-methods/route");

async function reportBrandingSave() {
  const { PUT } = await import("@/app/api/report-branding/route");
  return PUT(
    new Request("http://localhost/api/report-branding", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId: null, agencyName: "Harbour Agency" }),
    }),
  );
}

async function agencyLogoUpload() {
  const { POST } = await import("@/app/api/branding/logo/route");
  const form = new FormData();
  form.append("purpose", "agency");
  form.append(
    "file",
    new Blob([new Uint8Array(solidPng(8, 8, [10, 20, 30]))], { type: "image/png" }),
  );
  return POST(new Request("http://localhost/api/branding/logo", { method: "POST", body: form }));
}

/** What a page handed its client component (a call, so the "= null" before it isn't carried over). */
const propsOf = (key: keyof typeof captured) => captured[key];

async function render(page: Promise<React.ReactNode> | React.ReactNode): Promise<string> {
  return renderToStaticMarkup(<>{await page}</>);
}

async function agencyDashboardHtml() {
  const { default: Page } = await import("@/app/(auth)/agency/page");
  return render(Page());
}

async function agencySchedulesHtml() {
  const { default: Page } = await import("@/app/(auth)/agency/schedules/page");
  return render(Page());
}

async function reportBrandingHtml() {
  const { default: Page } = await import("@/app/(auth)/settings/report-branding/page");
  return render(Page());
}

async function dashboardHtml() {
  const { default: Page } = await import("@/app/(auth)/dashboard/page");
  return render(Page());
}

async function actionCenterHtml() {
  const { default: Page } = await import("@/app/(auth)/action-center/page");
  return render(Page({ searchParams: Promise.resolve({}) }));
}

async function actionItemHtml() {
  const { default: Page } = await import("@/app/(auth)/action-center/[id]/page");
  return render(Page({ params: Promise.resolve({ id: ACTION_ITEM }) }));
}

async function methodsHtml() {
  const { default: Page } = await import("@/app/(auth)/methods/page");
  return render(Page());
}

async function brandsHtml() {
  const { default: Page } = await import("@/app/(auth)/brands/page");
  return render(Page());
}

async function shellTier() {
  captured.shell = null;
  const { default: Layout } = await import("@/app/(auth)/layout");
  await render(Layout({ children: null }));
  return propsOf("shell")?.orgTier;
}

async function scheduleProps() {
  captured.schedule = null;
  const { default: Page } = await import("@/app/(auth)/brands/[brandId]/schedule/page");
  await render(Page({ params: Promise.resolve({ brandId: BRAND }) }));
  return propsOf("schedule");
}

async function brandDetailProps() {
  captured.brandDetail = null;
  const { default: Page } = await import("@/app/(auth)/brands/[brandId]/page");
  await render(Page({ params: Promise.resolve({ brandId: BRAND }) }));
  return propsOf("brandDetail");
}

async function billingProps() {
  captured.billing = null;
  const { default: Page } = await import("@/app/(auth)/settings/billing/page");
  await render(Page({ searchParams: Promise.resolve({}) }));
  return propsOf("billing");
}

async function hasReportBranding() {
  const { withRlsContext } = await import("@/db/client");
  const { orgHasReportBranding } = await import("@/lib/branding/agency-assets");
  return withRlsContext(ORG, (tx) => orgHasReportBranding(tx, ORG));
}

class StopAfterStep extends Error {}

/** Runs an Inngest function's real handler up to one step, and returns that step's result. */
async function stepResult<T>(fn: unknown, event: unknown, stepId: string): Promise<T> {
  let result: T | undefined;
  const step = {
    run: async (id: string, work: () => Promise<unknown>) => {
      const out = await work();
      if (id === stepId) {
        result = out as T;
        throw new StopAfterStep();
      }
      return out;
    },
    sendEvent: async () => undefined,
    sleep: async () => undefined,
    sleepUntil: async () => undefined,
    waitForEvent: async () => null,
  };
  type Handler = (ctx: { event: unknown; step: typeof step }) => Promise<unknown>;
  try {
    await (fn as { fn: Handler }).fn({ event, step });
  } catch (e) {
    if (!(e instanceof StopAfterStep)) throw e;
  }
  return result as T;
}

async function runAuditEngines() {
  const pendingAudit = randomUUID();
  await sql`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status)
    VALUES (${pendingAudit}, ${BRAND}, ${ORG}, ${100 + ++eventNumber}, 'manual', 'pending')
  `;
  const { runAudit } = await import("@/inngest/functions/run-audit");
  const loaded = await stepResult<{ engines: string[]; tier: string }>(
    runAudit,
    { data: { auditId: pendingAudit } },
    "load-audit",
  );
  return loaded;
}

async function journeyTier() {
  const { runJourneyFn } = await import("@/inngest/functions/run-journey");
  const context = await stepResult<{ tier: string }>(
    runJourneyFn,
    { data: { journeyId: JOURNEY, brandId: BRAND, organizationId: ORG } },
    "load-journey",
  );
  return context.tier;
}

async function comparisonTier() {
  const { runComparisonPromptsFn } = await import("@/inngest/functions/run-comparison-prompts");
  const context = await stepResult<{ tier: string }>(
    runComparisonPromptsFn,
    { data: { auditId: AUDIT, brandId: BRAND, organizationId: ORG } },
    "load-brand-competitors",
  );
  return context.tier;
}

async function evidenceCapture() {
  const { captureEvidenceSnapshot } = await import("@/inngest/functions/capture-evidence-snapshot");
  type Handler = (ctx: { event: unknown; step: unknown }) => Promise<{ skipped?: boolean }>;
  return (captureEvidenceSnapshot as unknown as { fn: Handler }).fn({
    event: { data: { auditId: AUDIT, brandId: BRAND, organizationId: ORG } },
    step: { run: async (_id: string, work: () => Promise<unknown>) => work() },
  });
}

async function estimateCents() {
  const { BudgetPolicyService } = await import("@/lib/platform/budget-policy.service");
  const estimate = await BudgetPolicyService.estimate({
    organizationId: ORG,
    brandId: BRAND,
    promptCount: 10,
    engineCount: 4,
  });
  return estimate.estimatedCostCents;
}

async function quota() {
  const { checkQuota } = await import("@/lib/scheduling/quota-check");
  return checkQuota(ORG, BRAND);
}

async function assertTierAgency() {
  const { assertTier } = await import("@/lib/governance");
  return assertTier(ORG, "agency");
}

async function cronBrands(load: () => Promise<unknown>) {
  const rows = await stepResult<Array<{ id: string }>>(await load(), {}, "load-brands");
  return rows.map((row) => row.id);
}
const loadContentCron = async () =>
  (await import("@/inngest/functions/content-structure-audit")).contentStructureAuditFn;
const loadLlmsCron = async () =>
  (await import("@/inngest/functions/llmstxt-refresh")).llmstxtRefreshFn;

beforeAll(async () => {
  sql = postgres(getTestDatabaseUrl(), { max: 1 });
  vi.stubEnv("STORAGE_DRIVER", "local");
  vi.stubEnv("STORAGE_LOCAL_DIR", `${process.env.TEMP ?? "/tmp"}/plan-gates-${RUN}`);
  const { inngest } = await import("@/lib/inngest/client");
  vi.spyOn(inngest, "send").mockResolvedValue({ ids: [] });

  await sql`
    INSERT INTO organizations (id, clerk_org_id, name, slug, tier, onboarding_complete)
    VALUES (${ORG}, ${`plan-gates-${RUN}`}, 'Plan Gates Agency', ${`plan-gates-${RUN}`}, 'agency', true)
  `;
  await sql`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${OWNER}, ${`plan-gates-${OWNER}`}, ${ORG}, ${`owner-${RUN}@example.com.au`}, 'Owner', 'owner')
  `;
  await sql`
    INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${ORG}, ${OWNER}, 'owner', now() + interval '7 days', now(), true)
  `;
  await sql`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, competitors, primary_regions) VALUES
      (${BRAND}, ${ORG}, 'Plan Gates Plumbing', ${`gates-${RUN}.example.com.au`}, 'tradies', 'au', ${["Rival Co"]}, ${["NSW:Bondi"]}),
      (${OTHER_BRAND}, ${ORG}, 'Plan Gates Electrical', ${`gates2-${RUN}.example.com.au`}, 'tradies', 'au', ${[]}, ${["NSW:Bondi"]})
  `;
  await sql`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, triggered_by, status, engines, engine_count, prompts_count, runs_per_prompt, total_calls, started_at, completed_at)
    VALUES (${AUDIT}, ${BRAND}, ${ORG}, 1, 'manual', 'complete', ${["chatgpt"]}, 1, 1, 1, 1, now() - interval '9 minutes', now())
  `;
  await sql`
    INSERT INTO action_items (id, organization_id, brand_id, audit_id, recommendation_key, dimension, title, action, confidence_label, confidence_basis, expected_impact_score, evidence_refs)
    VALUES (${ACTION_ITEM}, ${ORG}, ${BRAND}, ${AUDIT}, 'directory-visibility', 'frequency', 'Check your listing', 'Check the listing AI cited.', 'likely', 'inferred', 'medium', ${sql.json([])})
  `;
  await sql`
    INSERT INTO conversation_journeys (id, organization_id, brand_id, journey_name, vertical, buyer_stage, prompt_sequence)
    VALUES (${JOURNEY}, ${ORG}, ${BRAND}, 'Plan gates', 'tradies', 'awareness', ${sql.json([])})
  `;
  // More methods than the free list shows (the test database has none).
  for (let i = 0; i < 11; i++) {
    await sql`
      INSERT INTO citability_methods (method_key, title, description, source, impact_tier)
      VALUES (${`${METHOD_KEY}-${i}`}, ${`Method ${i}`}, 'A method.', 'Test', 'high')
    `;
  }

  currentUser.value = {
    id: OWNER,
    organizationId: ORG,
    role: "owner",
    name: "Owner",
    email: `owner-${RUN}@example.com.au`,
    organization: { id: ORG, name: "Plan Gates Agency", region: "au" },
  };
}, 120_000);

afterAll(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  await sql`DELETE FROM processed_webhook_events WHERE stripe_event_id = ANY(${eventIds})`;
  await sql`DELETE FROM citability_methods WHERE method_key LIKE ${`${METHOD_KEY}-%`}`;
  await sql`DELETE FROM citations WHERE audit_id IN (SELECT id FROM audits WHERE organization_id = ${ORG})`;
  const tables = await sql<{ table_name: string }[]>`
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
    WHERE c.table_schema = 'public' AND c.column_name = 'organization_id'
      AND t.table_type = 'BASE TABLE' AND c.table_name <> 'organizations'
  `;
  let pending = tables.map((t) => t.table_name);
  for (let pass = 0; pass < 6 && pending.length > 0; pass++) {
    const failed: string[] = [];
    for (const table of pending) {
      try {
        await sql`DELETE FROM ${sql(table)} WHERE organization_id = ${ORG}`;
      } catch {
        failed.push(table);
      }
    }
    pending = failed;
  }
  await sql`DELETE FROM organizations WHERE id = ${ORG}`;
  await sql.end();
});

describe("the list of gates", () => {
  it("walks every API route gate the source scan finds", () => {
    const walked = [...PLAN_REFUSING_ROUTES.map((r) => r.file), ...OTHER_API_GATES];
    const listed = [...ASSERT_TIER_GATES, ...DIRECT_GATES].filter((f) => f.startsWith("app/api/"));
    expect([...walked].sort()).toEqual([...listed].sort());
  });
});

describe("a live Agency plan: everything is open (so the refusals below can't pass by accident)", () => {
  beforeAll(() => setRow({}));

  it.each(READ_CALLS)("GET %s isn't refused", async (_file, route) => {
    expect((await call(route, "GET")).status).not.toBe(403);
  });

  it("the plan shows on every field, page and job that reads it", async () => {
    expect((await jsonOf(loadMe)).body.tier).toBe("agency");
    expect((await jsonOf(loadBenchmark)).body.tier).toBe("agency");
    expect((await jsonOf(loadVisibility)).body.tier).toBe("agency");
    expect((await jsonOf(loadMethods)).body.shown).toBe(11);
    expect(await shellTier()).toBe("agency");
    expect(await agencyDashboardHtml()).not.toContain("Upgrade to the Agency tier");
    expect(await agencySchedulesHtml()).not.toContain("Upgrade to the Agency tier");
    expect(await reportBrandingHtml()).not.toContain("data-branding-locked");
    expect(await dashboardHtml()).toContain(`/brands/${BRAND}/health-check`);
    expect(await actionCenterHtml()).not.toContain("Upgrade to Starter to unlock");
    expect(await actionItemHtml()).not.toContain("Upgrade to Starter to unlock");
    expect(await methodsHtml()).not.toContain("Upgrade to see all");
    expect(await brandsHtml()).toContain("Agency");
    expect((await scheduleProps())?.tier).toBe("agency");
    expect((await brandDetailProps())?.tier).toBe("agency");
    expect((await billingProps())?.tier).toBe("agency");
    expect(await hasReportBranding()).toBe(true);
    expect(await quota()).toBe(true);
    await expect(assertTierAgency()).resolves.toBeUndefined();
    expect((await runAuditEngines()).engines).toHaveLength(4);
    expect(await journeyTier()).toBe("agency");
    expect(await comparisonTier()).toBe("agency");
    expect((await evidenceCapture()).skipped).not.toBe(true);
    expect(await cronBrands(loadContentCron)).toContain(BRAND);
    expect(await cronBrands(loadLlmsCron)).toContain(BRAND);
  });
});

describe("a scheduled cancellation: the features stay until the period ends", () => {
  beforeAll(async () => {
    await setRow({ periodEnd: nowS() + DAY_S });
    await deliver(
      "customer.subscription.updated",
      stripeSubscription({ cancel_at_period_end: true }),
    );
  });

  it("the webhook records it, with the period end from where this API version keeps it", async () => {
    const row = await subscriptionRow();
    expect(row.status).toBe("active");
    expect(row.cancel_at_period_end).toBe(true);
    expect(row.current_period_end?.getTime()).toBe(PERIOD_END * 1000);
    expect(await organizationTier()).toBe("agency");
  });

  it.each(READ_CALLS)("GET %s isn't refused", async (_file, route) => {
    expect((await call(route, "GET")).status).not.toBe(403);
  });

  it("the plan still shows everywhere, and billing says when it ends", async () => {
    expect((await jsonOf(loadMe)).body.tier).toBe("agency");
    expect(await shellTier()).toBe("agency");
    expect(await agencyDashboardHtml()).not.toContain("Upgrade to the Agency tier");
    expect(await reportBrandingHtml()).not.toContain("data-branding-locked");
    expect(await hasReportBranding()).toBe(true);
    expect(await quota()).toBe(true);
    expect((await runAuditEngines()).engines).toHaveLength(4);
    const billing = await billingProps();
    expect(billing?.tier).toBe("agency");
    expect(billing?.cancelAtPeriodEnd).toBe(true);
    expect(billing?.periodEnd).toBe(new Date(PERIOD_END * 1000).toISOString());
  });

  it("an older event with the period on the subscription itself still works", async () => {
    await deliver("customer.subscription.updated", {
      ...stripeSubscription({ cancel_at_period_end: true }),
      current_period_end: PERIOD_END + 60,
      items: { data: [{ price: { id: agencyPrice(), recurring: { interval: "month" } } }] },
    });
    expect((await subscriptionRow()).current_period_end?.getTime()).toBe((PERIOD_END + 60) * 1000);
    await deliver(
      "customer.subscription.updated",
      stripeSubscription({ cancel_at_period_end: true }),
    );
  });

  it("Cancel plan (POST /api/billing/downgrade) keeps the features too, with the period Stripe returns", async () => {
    await setRow({ periodEnd: nowS() - 40 * DAY_S, periodStart: nowS() - 70 * DAY_S });
    stripeApi.update = (id) => stripeSubscription({ cancel_at_period_end: true }, id);
    const { POST } = await import("@/app/api/billing/downgrade/route");
    expect((await POST()).status).toBe(200);
    const row = await subscriptionRow();
    expect(row.cancel_at_period_end).toBe(true);
    expect(row.current_period_end?.getTime()).toBe(PERIOD_END * 1000);
    expect((await jsonOf(loadMe)).body.tier).toBe("agency");
  });

  it("a row the old checkout handler wrote doesn't lose the plan the moment a cancellation is scheduled", async () => {
    const checkoutTime = nowS() - 5 * DAY_S;
    await setRow({ cancelAtPeriodEnd: true, periodStart: checkoutTime, periodEnd: checkoutTime });
    expect((await jsonOf(loadMe)).body.tier).toBe("agency");
    expect(await hasReportBranding()).toBe(true);
  });
});

describe.each([
  ["the period of a scheduled cancellation has ended, Stripe's event not in yet", "period-over"],
  ["Stripe deleted the subscription", "deleted"],
  ["Stripe let the first payment expire", "incomplete-expired"],
])("%s: the workspace is free everywhere", (_name, stage) => {
  beforeAll(async () => {
    if (stage === "period-over") {
      await setRow({ cancelAtPeriodEnd: true, periodEnd: nowS() - 60 });
    } else if (stage === "deleted") {
      await setRow({ cancelAtPeriodEnd: true });
      await deliver("customer.subscription.deleted", stripeSubscription({ status: "canceled" }));
    } else {
      await setRow({ status: "incomplete_expired" });
    }
  });

  it.each(EVERY_CALL)("%s is refused with 403", async (_label, route, method) => {
    expect((await call(route, method)).status).toBe(403);
  });

  it("the fields that say the plan say free", async () => {
    expect((await jsonOf(loadMe)).body.tier).toBe("free");
    expect((await jsonOf(loadBenchmark)).body.tier).toBe("free");
    expect((await jsonOf(loadVisibility)).body.tier).toBe("free");
    expect(await shellTier()).toBe("free");
  });

  it("the free limits apply: one brand, no scheduled audits, ten methods", async () => {
    const { POST: createBrand } = await import("@/app/api/brands/route");
    const brandResponse = await createBrand(
      new Request("http://localhost/api/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "One Too Many",
          domain: `toomany-${RUN}.example.com.au`,
          vertical: "tradies",
          primaryRegions: ["NSW:Bondi"],
        }),
      }),
    );
    expect(brandResponse.status).toBe(403);
    expect(((await brandResponse.json()) as { error: string }).error).toMatch(/Brand limit/);

    const schedules = await import("@/app/api/audit-schedules/route");
    const scheduleResponse = await schedules.POST(
      new Request("http://localhost/api/audit-schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: BRAND }),
      }),
    );
    expect(scheduleResponse.status).toBe(403);
    expect((await jsonOf(loadMethods)).body.shown).toBe(10);
  });

  it("the Agency Dashboard and its schedules are locked", async () => {
    expect(await agencyDashboardHtml()).toContain("Upgrade to the Agency tier");
    expect(await agencySchedulesHtml()).toContain("Upgrade to the Agency tier");
  });

  it("report branding is refused and locked", async () => {
    expect(await hasReportBranding()).toBe(false);
    expect((await reportBrandingSave()).status).toBe(403);
    expect((await agencyLogoUpload()).status).toBe(403);
    expect(await reportBrandingHtml()).toContain("data-branding-locked");
  });

  it("the pages show the free view", async () => {
    expect(await dashboardHtml()).not.toContain(`/brands/${BRAND}/health-check`);
    expect(await actionCenterHtml()).toContain("Upgrade to Starter to unlock");
    expect(await actionItemHtml()).toContain("Upgrade to Starter to unlock");
    expect(await methodsHtml()).toContain("Upgrade to see all");
    expect(await brandsHtml()).toContain("Free");
    expect((await scheduleProps())?.tier).toBe("free");
    expect((await scheduleProps())?.maxScheduled).toBe(0);
    const detail = await brandDetailProps();
    expect(detail?.tier).toBe("free");
    expect(detail?.isFree).toBe(true);
  });

  it("the billing page offers a new plan, with nothing about the old one", async () => {
    const billing = await billingProps();
    expect(billing?.tier).toBe("free");
    expect(billing?.hasSubscription).toBe(false);
    expect(billing?.cancelAtPeriodEnd).toBe(false);
    expect(billing?.periodEnd).toBeNull();
  });

  it("jobs and audits read it too", async () => {
    await expect(assertTierAgency()).rejects.toThrow("agency plan required");
    expect(await quota()).toBe(false);
    const { enginesForTier } = await import("@/lib/llm/tier-engines");
    const audit = await runAuditEngines();
    expect(audit.tier).toBe("free");
    expect(audit.engines).toEqual([...enginesForTier("free")]);
    expect(await journeyTier()).toBe("free");
    expect(await comparisonTier()).toBe("free");
    expect((await evidenceCapture()).skipped).toBe(true);
    await setRow({});
    const liveEstimate = await estimateCents();
    await setRow({ status: "canceled" });
    expect(await estimateCents()).toBeLessThan(liveEstimate);
  });
});

describe("what a deleted subscription writes", () => {
  it("status and organizations.tier change; subscriptions.tier stays as the record of what it was", async () => {
    await setRow({});
    await deliver("customer.subscription.deleted", stripeSubscription({ status: "canceled" }));
    const row = await subscriptionRow();
    expect(row.status).toBe("canceled");
    expect(row.tier).toBe("agency");
    expect(await organizationTier()).toBe("free");
  });
});

describe("Stripe doesn't promise order: a late event can't bring a cancelled plan back", () => {
  beforeAll(async () => {
    await setRow({});
    await deliver("customer.subscription.deleted", stripeSubscription({ status: "canceled" }));
  });

  it.each([
    ["customer.subscription.updated", () => stripeSubscription()],
    ["invoice.paid", () => ({ id: "in_late", subscription: SUB })],
    ["invoice.payment_failed", () => ({ id: "in_late", subscription: SUB })],
  ])("%s after the deletion changes nothing", async (type, object) => {
    await deliver(type, object());
    expect((await subscriptionRow()).status).toBe("canceled");
    expect(await organizationTier()).toBe("free");
    expect((await jsonOf(loadMe)).body.tier).toBe("free");
    expect(await hasReportBranding()).toBe(false);
  });

  it("Cancel plan on a cancelled subscription says there's none, without calling Stripe", async () => {
    stripeApi.update = () => {
      throw new Error("Stripe refuses to update a cancelled subscription");
    };
    const { POST } = await import("@/app/api/billing/downgrade/route");
    expect((await POST()).status).toBe(404);
  });
});

describe("paying again", () => {
  it("a new checkout gives the plan back, with the real period", async () => {
    await setRow({ status: "canceled", cancelAtPeriodEnd: true });
    const newSub = `sub_gates_new_${RUN}`;
    stripeApi.retrieve = (id) => stripeSubscription({}, id);
    await deliver("checkout.session.completed", {
      id: "cs_again",
      mode: "subscription",
      subscription: newSub,
      customer: CUSTOMER,
      metadata: { organizationId: ORG },
    });
    const row = await subscriptionRow();
    expect(row.stripe_subscription_id).toBe(newSub);
    expect(row.status).toBe("active");
    expect(row.cancel_at_period_end).toBe(false);
    expect(row.current_period_end?.getTime()).toBe(PERIOD_END * 1000);
    expect((await jsonOf(loadMe)).body.tier).toBe("agency");
    expect(await hasReportBranding()).toBe(true);
    expect(await agencyDashboardHtml()).not.toContain("Upgrade to the Agency tier");
  });
});

describe("not changed: a failed payment keeps the plan until Stripe ends it (a decision for Sri)", () => {
  beforeAll(() => setRow({}));

  it("invoice.payment_failed marks it past_due and every gate stays open", async () => {
    await deliver("invoice.payment_failed", { id: "in_failed", subscription: SUB });
    expect((await subscriptionRow()).status).toBe("past_due");
    expect((await jsonOf(loadMe)).body.tier).toBe("agency");
    expect(await hasReportBranding()).toBe(true);
    expect(await cronBrands(loadContentCron)).not.toContain(BRAND);
  });

  it.each([
    "past_due",
    "unpaid",
  ])("customer.subscription.updated to %s keeps the plan", async (status) => {
    await deliver("customer.subscription.updated", stripeSubscription({ status }));
    expect((await subscriptionRow()).status).toBe(status);
    expect((await jsonOf(loadMe)).body.tier).toBe("agency");
  });

  it("invoice.paid brings it back to active", async () => {
    await deliver("invoice.paid", { id: "in_paid", subscription: SUB });
    expect((await subscriptionRow()).status).toBe("active");
  });
});
