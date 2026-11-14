/**
 * 14 Nov, part 5 (Sri's review of audit #48): Hero's PDF drew "0% (#46) -> 27% -> 25%", but #46's 0% came from
 * the name-matching bug fixed in a6f75e2. An operator can exclude an audit from trends, with a reason, on
 * /admin/audits (operators only, in the operator's change history). The audit stays in history with its label
 * and is left out of the PDF trend, the dashboard's average, "vs previous audit", the weekly trend and the
 * compare page. Nothing is deleted. Real DB (migration 0148), real routes and pages.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
process.env.TZ = "UTC";

import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { EARLIER_MENTION_CHECK_REASON } from "@/lib/audit/trend-exclusion";
import {
  type OverviewFixture,
  seedOverviewFixture,
  sydneyMonthStart,
} from "@/tests/helpers/overview-fixture";
import { type ReportFixture, seedReportFixture } from "@/tests/helpers/report-fixture";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const { session, operatorState } = vi.hoisted(() => ({
  session: {
    organizationId: "",
    userId: "",
    sql: null as null | ((orgId: string) => Promise<unknown>),
  },
  operatorState: { allowed: false },
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({
    id: session.userId,
    organizationId: session.organizationId,
    name: "Sam Tester",
    role: "owner",
    organization: {
      id: session.organizationId,
      metadata: await session.sql?.(session.organizationId),
    },
  })),
}));
vi.mock("@/lib/auth/platform-admin", () => ({
  checkPlatformAdmin: vi.fn(async () => ({ allowed: operatorState.allowed, userId: "op-1" })),
  isPlatformAdmin: vi.fn(async () => operatorState.allowed),
}));
// The latest-audit route's plan and brand-access checks are tested elsewhere; here, its prior audit.
vi.mock("@/lib/governance", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/governance")>()),
  assertTier: vi.fn(async () => undefined),
  assertBrandAccess: vi.fn(async () => undefined),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard",
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

/** Hero's three audits: #46's 0% (the name-matching bug), then 27.5% and 25%. */
const W45 = "2026-11-03T01:00:00.000Z";
const W46_A = "2026-11-10T01:00:00.000Z";
const W46_B = "2026-11-13T01:00:00.000Z";
const LABEL = `Excluded from trends: ${EARLIER_MENTION_CHECK_REASON}`;

let client: ReturnType<typeof postgres>;
let fx: ReportFixture;
let overview: OverviewFixture;

const text = (html: string) =>
  html
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

async function exclude(auditId: string, reason: string | null) {
  await client`UPDATE audits SET excluded_from_trends_reason = ${reason} WHERE id = ${auditId}`;
}

async function adminPost(body: unknown): Promise<Response> {
  const { POST } = await import("@/app/api/admin/audits/route");
  return POST(
    new Request("http://localhost/api/admin/audits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function weekRow(periodLabel: string) {
  const rows = await client`
    SELECT audit_count, score_composite_avg FROM visibility_trends
    WHERE brand_id = ${fx.brandId} AND period_label = ${periodLabel} AND period_type = 'weekly'
  `;
  return rows[0] ?? null;
}

async function changes() {
  return client`
    SELECT scope, target_brand_id, target_workspace_id, old_value, new_value
    FROM feature_setting_changes
    WHERE setting_key = 'audit_trend_exclusion' AND target_brand_id = ${fx.brandId}
    ORDER BY created_at
  `;
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  session.sql = async (orgId) =>
    (await client`SELECT metadata FROM organizations WHERE id = ${orgId}`)[0]?.metadata;
  session.userId = randomUUID();
  fx = await seedReportFixture(client, {
    brandName: "Hero Home Services",
    audits: [
      { number: 46, completedAt: W45, mentions: {} },
      {
        number: 47,
        completedAt: W46_A,
        mentions: { chatgpt: [1, 2, 3], claude: [1, 2, 3], gemini: [1, 2], perplexity: [1, 2, 3] },
      },
      {
        number: 48,
        completedAt: W46_B,
        mentions: { chatgpt: [1, 2, 3], claude: [1, 2], gemini: [1, 2], perplexity: [1, 2, 3] },
      },
    ],
  });

  const monthStart = await sydneyMonthStart(client);
  const at = (minutes: number) => new Date(monthStart.getTime() + minutes * 60_000);
  overview = await seedOverviewFixture(client, {
    tier: "growth",
    brands: [
      {
        name: "Excluded Average Plumbing",
        audits: [
          // 2 of 10: 20%.
          {
            number: 1,
            createdAt: at(10),
            answers: [{ brand: "verified" }, { brand: "verified" }, ...Array(8).fill({})],
          },
          // The newest: 0 of 10, measured wrongly.
          { number: 2, createdAt: at(20), answers: Array(10).fill({}) },
        ],
      },
    ],
  });
}, 180_000);

afterAll(async () => {
  await client`DELETE FROM feature_setting_changes WHERE target_brand_id = ${fx.brandId}`;
  await client`DELETE FROM visibility_trends WHERE brand_id = ${fx.brandId}`;
  await fx?.cleanup();
  await overview?.cleanup();
  await client.end();
});

describe("the report PDF's trend", () => {
  async function report() {
    const { serviceDb } = await import("@/db/client");
    const { buildReportData } = await import("@/lib/reports/report-data");
    const data = await buildReportData(serviceDb, {
      organizationId: fx.orgId,
      brandId: fx.brandId,
      periodType: "weekly",
      periodLabel: "2026-W46",
      auditId: fx.audits[48],
      now: new Date("2026-11-14T09:00:00.000Z"),
    });
    if (!data) throw new Error("no report data");
    return data;
  }

  it("counted, #46 is on the chart and the change is drawn from it", async () => {
    const data = await report();
    expect(data.trend.points.map((p) => p.auditNumber)).toEqual([46, 47, 48]);
    expect(data.trend.change?.fromAuditNumber).toBe(46);
    expect(data.trend.excluded).toBeUndefined();
  }, 60_000);

  it("excluded, #46 is off the chart and every comparison, and the caption says why", async () => {
    const { trendLines } = await import("@/lib/reports/report-format");
    await exclude(fx.audits[46], EARLIER_MENTION_CHECK_REASON);
    try {
      const data = await report();
      expect(data.trend.points.map((p) => p.auditNumber)).toEqual([47, 48]);
      // Two audits left: under the three a trend needs, so no change is drawn at all.
      expect(data.trend.change).toBeNull();
      expect(data.trend.excluded).toEqual([
        { auditNumber: 46, reason: EARLIER_MENTION_CHECK_REASON },
      ]);
      expect(trendLines(data)).toContain(
        "Audit #46 is left out of this chart and every comparison: measured with an earlier version of the mention check.",
      );
    } finally {
      await exclude(fx.audits[46], null);
    }
  }, 60_000);
});

describe("vs previous audit (the latest-audit API: the PDF builder's comparison)", () => {
  async function prior(): Promise<string | null> {
    session.organizationId = fx.orgId;
    const { GET } = await import("@/app/api/brands/[brandId]/latest-audit/route");
    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ brandId: fx.brandId }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { priorAudit: { completedAt: string } | null };
    return body.priorAudit ? new Date(body.priorAudit.completedAt).toISOString() : null;
  }

  it("the prior audit skips one excluded from trends", async () => {
    expect(await prior()).toBe(W46_A);
    await exclude(fx.audits[47], EARLIER_MENTION_CHECK_REASON);
    try {
      expect(await prior()).toBe(W45);
    } finally {
      await exclude(fx.audits[47], null);
    }
  }, 60_000);
});

describe("the dashboard's average", () => {
  async function dashboard(): Promise<string> {
    session.organizationId = overview.orgId;
    const DashboardPage = (await import("@/app/(auth)/dashboard/page")).default;
    return text(renderToStaticMarkup(await DashboardPage()));
  }

  it("each brand's latest audit that counts; the excluded one is still listed, labelled", async () => {
    const newest = overview.auditIds["Excluded Average Plumbing #2"];
    expect(await dashboard()).toContain("0% Average of 1 brand's latest audit");
    await exclude(newest, EARLIER_MENTION_CHECK_REASON);
    try {
      const page = await dashboard();
      expect(page).toContain("20% Average of 1 brand's latest audit");
      expect(page).toContain(LABEL);
    } finally {
      await exclude(newest, null);
    }
  }, 120_000);
});

describe("history keeps the audit, labelled", () => {
  it("the audit page, the audits list and the compare page", async () => {
    session.organizationId = fx.orgId;
    await exclude(fx.audits[46], EARLIER_MENTION_CHECK_REASON);
    try {
      const AuditPage = (await import("@/app/(auth)/audits/[auditId]/page")).default;
      const auditPage = text(
        renderToStaticMarkup(
          await AuditPage({
            params: Promise.resolve({ auditId: fx.audits[46] }),
            searchParams: Promise.resolve({}),
          }),
        ),
      );
      expect(auditPage).toContain(`${LABEL}. It isn't counted in trends, averages or comparisons.`);

      const AuditsPage = (await import("@/app/(auth)/audits/page")).default;
      const list = renderToStaticMarkup(await AuditsPage({ searchParams: Promise.resolve({}) }));
      const labelled = [...list.matchAll(/data-excluded-from-trends="">([^<]+)</g)].map(
        (m) => m[1],
      );
      expect(labelled).toEqual([LABEL]);

      const ComparePage = (await import("@/app/(auth)/audits/compare/page")).default;
      const compare = text(
        renderToStaticMarkup(
          await ComparePage({
            searchParams: Promise.resolve({ ids: `${fx.audits[48]},${fx.audits[46]}` }),
          }),
        ),
      );
      expect(compare).toContain(`Audit #46: ${LABEL}. It isn't compared, so no change is shown.`);
      expect(compare).not.toMatch(/[+-]\d+ pts/);
    } finally {
      await exclude(fx.audits[46], null);
    }
  }, 120_000);
});

describe("/admin/audits: operators only, logged, and the week recomputed", () => {
  it("anyone else: 403 for both, the page says Forbidden, and nothing changes", async () => {
    operatorState.allowed = false;
    const { GET } = await import("@/app/api/admin/audits/route");
    expect((await GET()).status).toBe(403);
    const res = await adminPost({ auditId: fx.audits[46], reason: EARLIER_MENTION_CHECK_REASON });
    expect(res.status).toBe(403);
    const [row] =
      await client`SELECT excluded_from_trends_reason FROM audits WHERE id = ${fx.audits[46]}`;
    expect(row.excluded_from_trends_reason).toBeNull();
    expect(await changes()).toHaveLength(0);

    const AdminAuditsPage = (await import("@/app/(auth)/admin/audits/page")).default;
    const page = renderToStaticMarkup(await AdminAuditsPage());
    expect(page).toContain("data-admin-forbidden");
    expect(page).not.toContain("Hero Home Services");
  }, 60_000);

  it("exclude #46 (its week's only audit), unchanged on repeat, include again; each change logged", async () => {
    operatorState.allowed = true;
    const { serviceDb } = await import("@/db/client");
    const { refreshWeeklyVisibilityTrend } = await import("@/lib/visibility/refresh-weekly-trend");
    for (const completedAt of [W45, W46_A]) {
      await refreshWeeklyVisibilityTrend(serviceDb, {
        brandId: fx.brandId,
        organizationId: fx.orgId,
        brandDomain: fx.domain,
        completedAt: new Date(completedAt),
      });
    }
    expect(await weekRow("2026-W45")).toMatchObject({ audit_count: 1 });
    expect(await weekRow("2026-W46")).toMatchObject({ audit_count: 2 });

    const saved = await adminPost({ auditId: fx.audits[46], reason: EARLIER_MENTION_CHECK_REASON });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ status: "saved" });
    const [row] =
      await client`SELECT excluded_from_trends_reason FROM audits WHERE id = ${fx.audits[46]}`;
    expect(row.excluded_from_trends_reason).toBe(EARLIER_MENTION_CHECK_REASON);
    // Its week has no audit that counts now: no week of zeros on the Visibility chart.
    expect(await weekRow("2026-W45")).toBeNull();
    expect(await weekRow("2026-W46")).toMatchObject({ audit_count: 2 });

    const again = await adminPost({ auditId: fx.audits[46], reason: EARLIER_MENTION_CHECK_REASON });
    expect(await again.json()).toMatchObject({ status: "unchanged" });

    // The page lists it, labelled, and the change; /admin/settings' history doesn't.
    const AdminAuditsPage = (await import("@/app/(auth)/admin/audits/page")).default;
    const page = text(renderToStaticMarkup(await AdminAuditsPage()));
    expect(page).toContain(LABEL);
    expect(page).toContain(`Excluded: ${EARLIER_MENTION_CHECK_REASON}`);
    const { loadGoogleSurfaceAdminView } = await import("@/lib/governance/google-surfaces");
    const settings = await loadGoogleSurfaceAdminView(null);
    expect(settings.history.map((h) => h.setting)).not.toContain("audit_trend_exclusion");

    const included = await adminPost({ auditId: fx.audits[46], reason: null });
    expect(await included.json()).toMatchObject({ status: "saved" });
    const [after] =
      await client`SELECT excluded_from_trends_reason FROM audits WHERE id = ${fx.audits[46]}`;
    expect(after.excluded_from_trends_reason).toBeNull();
    expect(await weekRow("2026-W45")).toMatchObject({ audit_count: 1 });

    const logged = await changes();
    expect(logged).toHaveLength(2);
    const entry = { auditId: fx.audits[46], auditNumber: 46, reason: EARLIER_MENTION_CHECK_REASON };
    expect(logged[0]).toMatchObject({
      scope: "brand",
      target_brand_id: fx.brandId,
      target_workspace_id: fx.orgId,
      old_value: null,
      new_value: entry,
    });
    expect(logged[1]).toMatchObject({ old_value: entry, new_value: null });
  }, 120_000);

  it("excluding #47 recomputes its week from #48 alone; include it again and both count", async () => {
    operatorState.allowed = true;
    await adminPost({ auditId: fx.audits[47], reason: "measured before the brand name was fixed" });
    expect(await weekRow("2026-W46")).toMatchObject({
      audit_count: 1,
      score_composite_avg: "25.00",
    });
    await adminPost({ auditId: fx.audits[47], reason: "  " });
    expect(await weekRow("2026-W46")).toMatchObject({ audit_count: 2 });
  }, 60_000);

  it("an audit that isn't there, or a reason that's too long: 400, nothing written", async () => {
    operatorState.allowed = true;
    const before = (await changes()).length;
    const missing = await adminPost({
      auditId: randomUUID(),
      reason: EARLIER_MENTION_CHECK_REASON,
    });
    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({ error: "That audit doesn't exist." });
    const long = await adminPost({ auditId: fx.audits[46], reason: "x".repeat(201) });
    expect(long.status).toBe(400);
    expect((await changes()).length).toBe(before);
  }, 60_000);
});
