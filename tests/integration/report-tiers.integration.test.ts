/**
 * S01 part 8 (LLD 8.1.7, D-RT1 revised, D-RT2; contract P08.tier, P08.overLimit; LLD amendments 30 and 41): report
 * tiers enforced on the server, on a real database.
 * - Generate route, per plan: Free and Starter keep today's refusal (403 plan_required); Growth generates Basic and
 *   Standard and gets 402 report_tier_not_in_plan for Enhanced (nothing started); Agency generates all three. With no
 *   tier: the brand's saved default when the plan includes it, else the plan's highest. The tier asked for becomes
 *   the brand's default; contents a Basic report doesn't include are dropped. report_v2 off: the route is today's.
 * - PUT report-preferences refuses a default above the plan (402); GET /api/report-tiers gives the workspace's types.
 * - The generator (generate-narrative-report): a manual report is the tier the route sent; a scheduled one reads the
 *   schedule's report_tier (the brand's own schedule first), capped at the plan with an operator log line; the
 *   snapshot carries the tier, its name and its page set, and no cost, provider or id beyond appendix D's.
 *
 * Fixture: a Hero-shaped brand (tests/helpers/report-fixture.ts), one complete audit in 2026-W47.
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { pagesForTier } from "@/lib/reports/report-tiers";
import { type ReportFixture, seedReportFixture } from "@/tests/helpers/report-fixture";
import { runReportGeneration } from "@/tests/helpers/report-generation";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const USER = randomUUID();
const who = vi.hoisted(() => ({ orgId: "", userId: "" }));
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({
    id: who.userId,
    organizationId: who.orgId,
    email: "owner@report-tiers.example.com.au",
    name: "Owner",
    role: "owner",
    organization: { id: who.orgId, name: "Splice Marketing", region: "au", metadata: {} },
  })),
}));

// S01 part 9: an Enhanced report refreshes its stale checks before it's built; here the checks' runners do nothing
// (tests/integration/enhanced-refresh.integration.test.tsx covers the refresh). No live call from a test.
vi.mock("@/lib/reports/enhanced-check-runners", () => ({
  enhancedRunners: () => ({ site: async () => undefined, youtube: async () => undefined }),
}));

const sql = postgres(getTestDatabaseUrl(), { max: 1 });
let fx: ReportFixture;
const COST = "0.987654";

beforeAll(async () => {
  process.env.DATABASE_URL = getTestDatabaseUrl();
  process.env.SERVICE_DATABASE_URL = getTestDatabaseUrl();
  fx = await seedReportFixture(sql, {
    brandName: "Hero Home Services",
    agencyName: "Splice Marketing",
    tier: "agency",
    audits: [
      {
        number: 54,
        completedAt: "2026-11-20T03:00:00.000Z",
        mentions: { chatgpt: [1, 4], claude: [2], gemini: [], perplexity: [1, 3] },
        directories: { "yellowpages.com.au": 17, "hipages.com.au": 9 },
      },
    ],
  });
  who.orgId = fx.orgId;
  who.userId = USER;
  await sql`
    INSERT INTO users (id, clerk_user_id, organization_id, email, name, role)
    VALUES (${USER}, ${`rt-${USER}`}, ${fx.orgId}, ${`owner-${USER.slice(0, 8)}@report-tiers.example.com.au`}, 'Owner', 'owner')`;
  await sql`
    INSERT INTO org_members (organization_id, user_id, role, expires_at, accepted_at, is_active)
    VALUES (${fx.orgId}, ${USER}, 'owner', now(), now(), true)`;
  // What the providers cost us is on every answer row; none of it may reach a snapshot (LLD amendment 41).
  await sql`UPDATE citations SET llm_cost_usd = ${COST} WHERE audit_id = ${fx.audits[54]}`;
}, 60_000);

afterAll(async () => {
  for (const table of [
    "report_action_choices",
    "report_brand_preferences",
    "agency_actions",
    "action_items",
    "org_feature_flags",
    "report_delivery_schedules",
    "org_members",
  ]) {
    await sql`DELETE FROM ${sql(table)} WHERE organization_id = ${fx.orgId}`;
  }
  await sql`DELETE FROM users WHERE id = ${USER}`;
  await fx.cleanup();
  await sql.end();
});

async function setPlan(tier: string) {
  await sql`UPDATE subscriptions SET tier = ${tier} WHERE organization_id = ${fx.orgId}`;
}

async function setFlag(on: boolean) {
  await sql`DELETE FROM org_feature_flags WHERE organization_id = ${fx.orgId} AND flag_key = 'report_v2'`;
  if (on)
    await sql`INSERT INTO org_feature_flags (organization_id, flag_key, is_enabled) VALUES (${fx.orgId}, 'report_v2', true)`;
}

beforeEach(async () => {
  await setPlan("agency");
  await setFlag(true);
  await sql`DELETE FROM report_brand_preferences WHERE brand_id = ${fx.brandId}`;
  await sql`DELETE FROM report_action_choices WHERE brand_id = ${fx.brandId}`;
  await sql`DELETE FROM report_delivery_schedules WHERE organization_id = ${fx.orgId}`;
  await sql`DELETE FROM generated_reports WHERE brand_id = ${fx.brandId}`;
});

async function generateRoute(body: Record<string, unknown>) {
  const { inngest } = await import("@/lib/inngest/client");
  const send = vi.spyOn(inngest, "send").mockResolvedValue({ ids: ["x"] });
  try {
    const { POST } = await import("@/app/api/brands/[brandId]/reports/generate/route");
    const res = await POST(
      new Request(`http://x/api/brands/${fx.brandId}/reports/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ periodType: "weekly", periodLabel: "2026-W47", ...body }),
      }),
      { params: Promise.resolve({ brandId: fx.brandId }) },
    );
    const events = send.mock.calls.flatMap((c) => (Array.isArray(c[0]) ? c[0] : [c[0]]));
    const event = events.find((e) => e.name === "trend/aggregated");
    return {
      status: res.status,
      body: (await res.json()) as Record<string, unknown>,
      event: event?.data as Record<string, unknown> | undefined,
    };
  } finally {
    send.mockRestore();
  }
}

async function savedDefault(): Promise<string | null> {
  const [row] = await sql<{ default_tier: string | null }[]>`
    SELECT default_tier FROM report_brand_preferences WHERE brand_id = ${fx.brandId}`;
  return row?.default_tier ?? null;
}

describe("the generate route, per plan", () => {
  it.each([
    "free",
    "starter",
  ])("%s keeps today's refusal (403 plan_required); nothing starts", async (plan) => {
    await setPlan(plan);
    const { status, body, event } = await generateRoute({ tier: "basic" });
    expect(status).toBe(403);
    expect(body.code).toBe("plan_required");
    expect(event).toBeUndefined();
  });

  it("Growth generates Basic and Standard; Enhanced is 402 report_tier_not_in_plan and nothing starts", async () => {
    await setPlan("growth");
    for (const tier of ["basic", "standard"]) {
      const { status, event } = await generateRoute({ tier });
      expect(status).toBe(202);
      expect(event).toMatchObject({ brandId: fx.brandId, manual: true, tier });
    }
    const refused = await generateRoute({ tier: "enhanced" });
    expect(refused.status).toBe(402);
    expect(refused.body).toEqual({
      error: "Your plan now includes reports up to Standard. Choose another report type.",
      code: "report_tier_not_in_plan",
      maxTier: "standard",
    });
    expect(refused.event).toBeUndefined();
  });

  it("Agency generates all three for the same audit", async () => {
    for (const tier of ["basic", "standard", "enhanced"]) {
      const { status, event } = await generateRoute({ tier });
      expect(status).toBe(202);
      expect(event?.tier).toBe(tier);
    }
  });

  it("an unknown tier is 400", async () => {
    const { status } = await generateRoute({ tier: "premium" });
    expect(status).toBe(400);
  });

  it("no tier: the saved default when the plan includes it, else the plan's highest", async () => {
    await setPlan("growth");
    expect((await generateRoute({})).event?.tier).toBe("standard");
    await sql`INSERT INTO report_brand_preferences (brand_id, organization_id, default_tier) VALUES (${fx.brandId}, ${fx.orgId}, 'basic')`;
    expect((await generateRoute({})).event?.tier).toBe("basic");
    await sql`UPDATE report_brand_preferences SET default_tier = 'enhanced' WHERE brand_id = ${fx.brandId}`;
    // A default saved on Agency, after a move to Growth: the plan's highest, not a refusal.
    expect((await generateRoute({})).event?.tier).toBe("standard");
  });

  it("the tier asked for becomes the brand's default; a Basic report drops the contents it doesn't include", async () => {
    const [item] = await sql<{ id: string }[]>`
      INSERT INTO action_items (organization_id, brand_id, audit_id, recommendation_key, dimension, title, action,
        confidence_label, expected_impact_score, status)
      VALUES (${fx.orgId}, ${fx.brandId}, ${fx.audits[54]}, 'directory-visibility', 'frequency',
        'Link your Yellow Pages profile', 'Do it.', 'confirmed', 'high', 'open')
      RETURNING id`;
    const contents = {
      includeGeneralAdvice: false,
      choices: [{ actionItemId: item.id, included: false, position: 0, note: "Hidden" }],
    };
    const basic = await generateRoute({ tier: "basic", contents });
    expect(basic.status).toBe(202);
    expect(await savedDefault()).toBe("basic");
    const [prefs] = await sql<{ include_general_advice: boolean }[]>`
      SELECT include_general_advice FROM report_brand_preferences WHERE brand_id = ${fx.brandId}`;
    expect(prefs.include_general_advice).toBe(true);
    expect(
      await sql`SELECT 1 FROM report_action_choices WHERE brand_id = ${fx.brandId}`,
    ).toHaveLength(0);

    const standard = await generateRoute({ tier: "standard", contents });
    expect(standard.status).toBe(202);
    expect(await savedDefault()).toBe("standard");
    expect(
      await sql`SELECT 1 FROM report_action_choices WHERE brand_id = ${fx.brandId}`,
    ).toHaveLength(1);
    await sql`DELETE FROM action_items WHERE id = ${item.id}`;
  });

  it("report_v2 off: the route is today's (no tier, nothing refused or saved)", async () => {
    await setFlag(false);
    await setPlan("growth");
    const { status, event } = await generateRoute({ tier: "enhanced" });
    expect(status).toBe(202);
    expect(event).toBeDefined();
    expect(event).not.toHaveProperty("tier");
    expect(await savedDefault()).toBeNull();
  });
});

describe("the default report type and the workspace's types", () => {
  async function putPrefs(body: object) {
    const { PUT } = await import("@/app/api/brands/[brandId]/report-preferences/route");
    const res = await PUT(
      new Request(`http://x/api/brands/${fx.brandId}/report-preferences`, {
        method: "PUT",
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ brandId: fx.brandId }) },
    );
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  it("PUT report-preferences refuses a default above the plan (402) and keeps one it includes", async () => {
    await setPlan("growth");
    const refused = await putPrefs({ defaultTier: "enhanced" });
    expect(refused.status).toBe(402);
    expect(refused.body.code).toBe("report_tier_not_in_plan");
    expect(await savedDefault()).toBeNull();
    expect((await putPrefs({ defaultTier: "standard" })).status).toBe(200);
    expect(await savedDefault()).toBe("standard");
  });

  it("the panel's view opens on the saved default, else the plan's highest, with the plan's locks", async () => {
    const { GET } = await import("@/app/api/brands/[brandId]/report-preferences/route");
    const view = async () =>
      (await (
        await GET(new Request("http://x"), { params: Promise.resolve({ brandId: fx.brandId }) })
      ).json()) as {
        defaultTier: string;
        tiers: Array<{ tier: string; name: string; lockedPlan: string | null }>;
      };
    await setPlan("growth");
    const growth = await view();
    expect(growth.defaultTier).toBe("standard");
    expect(growth.tiers.map((t) => [t.tier, t.lockedPlan])).toEqual([
      ["basic", null],
      ["standard", null],
      ["enhanced", "Agency"],
    ]);
    await setPlan("agency");
    await sql`INSERT INTO report_brand_preferences (brand_id, organization_id, default_tier) VALUES (${fx.brandId}, ${fx.orgId}, 'basic')`;
    expect((await view()).defaultTier).toBe("basic");
  });

  it("GET /api/report-tiers: off says so; on, the workspace's names (Agency and up) and the plan's locks", async () => {
    const { GET } = await import("@/app/api/report-tiers/route");
    await setFlag(false);
    expect(await (await GET()).json()).toEqual({ enabled: false });
    await setFlag(true);
    // The fixture's workspace branding row (one per workspace) gains the agency's names.
    await sql`
      UPDATE agency_brand_assets
      SET report_tier_names = ${sql.json({ basic: "Essentials", standard: "Growth Plan", enhanced: "Premium Audit" })}
      WHERE organization_id = ${fx.orgId} AND brand_id IS NULL`;
    const agency = (await (await GET()).json()) as {
      enabled: boolean;
      tiers: Array<{ tier: string; name: string; lockedPlan: string | null }>;
    };
    expect(agency.enabled).toBe(true);
    expect(agency.tiers.map((t) => t.name)).toEqual(["Essentials", "Growth Plan", "Premium Audit"]);
    await setPlan("growth");
    const growth = (await (await GET()).json()) as typeof agency;
    // Growth can't rename: the default names, and Enhanced locked to Agency.
    expect(growth.tiers.map((t) => [t.name, t.lockedPlan])).toEqual([
      ["Basic", null],
      ["Standard", null],
      ["Enhanced", "Agency"],
    ]);
    await sql`UPDATE agency_brand_assets SET report_tier_names = NULL WHERE organization_id = ${fx.orgId}`;
  });
});

describe("the generator", () => {
  async function runGenerator(data: Record<string, unknown>) {
    const logs: Array<Record<string, unknown>> = [];
    const info = vi.spyOn(console, "info").mockImplementation((line: unknown) => {
      try {
        logs.push(JSON.parse(String(line)));
      } catch {
        /* not a JSON log line */
      }
    });
    try {
      // S01B part 1 (LLD amendment 49): an Enhanced report's snapshot is written by refresh-enhanced-checks, which the
      // generator asks for; the helper runs both, as Inngest would.
      const { generator: out } = await runReportGeneration({
        eventId: `evt-${randomUUID()}`,
        data: {
          brandId: fx.brandId,
          organizationId: fx.orgId,
          periodLabel: "2026-W47",
          periodType: "weekly",
          ...data,
        },
      });
      if (!out.reportId) throw new Error(`no report: ${JSON.stringify(out)}`);
      const [row] = await sql<
        { report_tier: string; contents_snapshot: Record<string, unknown> | null }[]
      >`
        SELECT report_tier, contents_snapshot FROM generated_reports WHERE id = ${out.reportId}`;
      return { row, logs };
    } finally {
      info.mockRestore();
    }
  }

  async function schedule(brandId: string | null, tier: string) {
    await sql`
      INSERT INTO report_delivery_schedules (organization_id, brand_id, frequency, day_of_week, time_of_day, recipient_emails, is_active, report_tier)
      VALUES (${fx.orgId}, ${brandId}, 'weekly', 1, '09:00', ${["client@example.com.au"]}, true, ${tier})`;
  }

  it("a manual report is the tier the route sent: report_tier, the snapshot's tier, name and pages", async () => {
    const { row, logs } = await runGenerator({ manual: true, tier: "standard" });
    expect(row.report_tier).toBe("standard");
    expect(row.contents_snapshot).toMatchObject({
      tier: "standard",
      tierName: "Standard",
      sections: pagesForTier("standard"),
    });
    expect(logs).toContainEqual(
      expect.objectContaining({ event: "report_generated", tier: "standard", plan: "agency" }),
    );
  });

  it("a scheduled report reads the schedule's tier, the brand's own schedule before the workspace's", async () => {
    await schedule(null, "basic");
    await schedule(fx.brandId, "enhanced");
    const { row } = await runGenerator({});
    expect(row.report_tier).toBe("enhanced");
    expect(row.contents_snapshot?.sections).toEqual(pagesForTier("enhanced"));
  });

  it("a schedule's tier above the plan is capped at the plan, with an operator log line", async () => {
    await setPlan("growth");
    await schedule(fx.brandId, "enhanced");
    const { row, logs } = await runGenerator({});
    expect(row.report_tier).toBe("standard");
    expect(logs).toContainEqual(
      expect.objectContaining({
        event: "report_tier_capped",
        brandId: fx.brandId,
        plan: "growth",
        requested: "enhanced",
        tier: "standard",
        source: "schedule",
      }),
    );
  });

  it("report_v2 off: today's report (basic, no snapshot), whatever the schedule says", async () => {
    await setFlag(false);
    await schedule(fx.brandId, "enhanced");
    const { row } = await runGenerator({});
    expect(row.report_tier).toBe("basic");
    expect(row.contents_snapshot).toBeNull();
  });

  it("the snapshot holds only what the PDF prints: no cost, no provider, no ids beyond appendix D's", async () => {
    const { row } = await runGenerator({ manual: true, tier: "enhanced" });
    const text = JSON.stringify(row.contents_snapshot);
    expect(text).not.toContain(COST);
    const keys: string[] = [];
    const walk = (v: unknown) => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object")
        for (const [k, child] of Object.entries(v)) {
          keys.push(k);
          walk(child);
        }
    };
    walk(row.contents_snapshot);
    expect(keys.filter((k) => /cost|usd|spend|provider/i.test(k))).toEqual([]);
    // Ids: appendix D's only (the basis audit, action items, agency actions) -- never the workspace or the brand.
    expect(text).not.toContain(fx.orgId);
    expect(text).not.toContain(fx.brandId);
  });
});

describe("delivery schedules: the report type (Agency)", () => {
  async function createSchedule(extra: Record<string, unknown>) {
    const { POST } = await import("@/app/api/organizations/[orgId]/delivery-schedules/route");
    const res = await POST(
      new Request(`http://x/api/organizations/${fx.orgId}/delivery-schedules`, {
        method: "POST",
        body: JSON.stringify({
          brandId: fx.brandId,
          frequency: "weekly",
          dayOfWeek: 1,
          timeOfDay: "09:00",
          recipientEmails: ["client@example.com.au"],
          ...extra,
        }),
      }),
      { params: Promise.resolve({ orgId: fx.orgId }) },
    );
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  it("report_v2 on: the schedule keeps the report type chosen; none chosen is Basic", async () => {
    const chosen = await createSchedule({ reportTier: "enhanced" });
    expect(chosen.status).toBe(201);
    expect(chosen.body.reportTier).toBe("enhanced");
    expect((await createSchedule({})).body.reportTier).toBe("basic");
  });

  it("an unknown report type is 400", async () => {
    expect((await createSchedule({ reportTier: "premium" })).status).toBe(400);
  });

  it("report_v2 off: the report type is ignored (Basic, today's report)", async () => {
    await setFlag(false);
    const { status, body } = await createSchedule({ reportTier: "enhanced" });
    expect(status).toBe(201);
    expect(body.reportTier).toBe("basic");
  });
});
