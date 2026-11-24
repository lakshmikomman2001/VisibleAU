/**
 * S01B part 1 (LLD amendment 49, D-RT4): an Enhanced report's checks in their own function, refresh-enhanced-checks,
 * on a real database with recorded runners (no live call from a test).
 * - The generator (POST_AUDIT_POOL) ends once the row is written: it asks for the checks and starts nothing else.
 * - Two Enhanced reports for one brand still run one refresh (the function's brand key runs them one after another;
 *   the second finds the first one's results fresh).
 * - Brand A's report doesn't wait for brand B's refresh, and a post-audit job (the generator) runs while it's held.
 * - A check that fails prints its failure line, every tile still prints, and the PDF is started.
 * - A run in flight when S01B is deployed (its row written by the code before) finishes in the generator under its
 *   old step ids, so Inngest never asks for a step the new code doesn't have.
 * The concurrency keys themselves: tests/unit/inngest/enhanced-checks-concurrency.test.ts.
 *
 * Two invented businesses, one complete audit each. (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ReportDocument } from "@/lib/communication/pdf-builder";
import { collectPdfPages } from "@/tests/helpers/pdf-text";
import { type ReportFixture, seedReportFixture } from "@/tests/helpers/report-fixture";
import type { SentEvent, StepRunner } from "@/tests/helpers/report-generation";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

type Behaviour = "ok" | "hold" | "throw";
const runners = vi.hoisted(() => ({
  calls: [] as string[],
  behaviour: new Map<string, Behaviour>(),
  release: null as null | (() => void),
  write: null as null | ((brandId: string, orgId: string) => Promise<void>),
}));
vi.mock("@/lib/reports/enhanced-check-runners", () => ({
  enhancedRunners: (organizationId: string) => ({
    site: async (brand: { id: string }) => {
      runners.calls.push(brand.id);
      const behaviour = runners.behaviour.get(brand.id) ?? "ok";
      if (behaviour === "throw") throw new Error("recorded runner: the site didn't answer");
      if (behaviour === "hold")
        await new Promise<void>((resolve) => {
          runners.release = resolve;
        });
      await runners.write?.(brand.id, organizationId);
    },
    youtube: async () => undefined,
  }),
}));

type Handler = (ctx: {
  event: { id: string; data: Record<string, unknown> };
  step: StepRunner;
}) => Promise<unknown>;

const sql = postgres(getTestDatabaseUrl(), { max: 2 });
let a: ReportFixture;
let b: ReportFixture;
const ROBOTS = {
  fetchStatus: "ok",
  aiBotsAllowed: ["OAI-SearchBot", "Claude-SearchBot"],
  aiBotsBlocked: [],
};

beforeAll(async () => {
  process.env.DATABASE_URL = getTestDatabaseUrl();
  process.env.SERVICE_DATABASE_URL = getTestDatabaseUrl();
  const { inngest } = await import("@/lib/inngest/client");
  vi.spyOn(inngest, "send").mockImplementation(async (payload: unknown) => {
    for (const e of Array.isArray(payload) ? payload : [payload]) outbox.push(e as SentEvent);
    return { ids: ["x"] };
  });
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  for (const [name, set] of [
    ["Wattle Creek Plumbing", (f: ReportFixture) => (a = f)],
    ["Ironbark Electrical", (f: ReportFixture) => (b = f)],
  ] as const) {
    const fx = await seedReportFixture(sql, {
      brandName: name,
      agencyName: "Splice Marketing",
      tier: "agency",
      audits: [{ number: 52, completedAt: "2026-11-20T03:00:00.000Z", mentions: {} }],
    });
    set(fx);
    await sql`INSERT INTO org_feature_flags (organization_id, flag_key, is_enabled) VALUES (${fx.orgId}, 'report_v2', true)`;
  }
  // What the site runner writes when it finishes: what the technical audit runner writes, now.
  runners.write = async (brandId, orgId) => {
    await sql`INSERT INTO technical_audits (brand_id, organization_id, score_composite, findings)
      VALUES (${brandId}, ${orgId}, '41.00', ${sql.json({ robots: ROBOTS })})`;
    await sql`INSERT INTO brand_entity_scores (brand_id, abn_verified, abn_number, abn_entity_name, abn_status)
      VALUES (${brandId}, true, '51824753556', 'WATTLE CREEK PTY LTD', 'Active')`;
  };
}, 60_000);

afterAll(async () => {
  for (const fx of [a, b]) {
    for (const table of ["generated_reports", "technical_audits", "org_feature_flags"])
      await sql`DELETE FROM ${sql(table)} WHERE organization_id = ${fx.orgId}`;
    await sql`DELETE FROM brand_entity_scores WHERE brand_id = ${fx.brandId}`;
    await fx.cleanup();
  }
  vi.restoreAllMocks();
  await sql.end();
});

beforeEach(async () => {
  runners.calls.length = 0;
  runners.behaviour.clear();
  runners.release = null;
  for (const fx of [a, b]) {
    await sql`DELETE FROM generated_reports WHERE brand_id = ${fx.brandId}`;
    await sql`DELETE FROM technical_audits WHERE brand_id = ${fx.brandId}`;
    await sql`DELETE FROM brand_entity_scores WHERE brand_id = ${fx.brandId}`;
    // The checks as they were: 40 days old, so an Enhanced report runs the site checks again.
    await sql`INSERT INTO technical_audits (brand_id, organization_id, score_composite, findings, created_at)
      VALUES (${fx.brandId}, ${fx.orgId}, '38.00', ${sql.json({ robots: ROBOTS })}, now() - interval '40 days 1 hour')`;
    await sql`INSERT INTO brand_entity_scores (brand_id, abn_verified, abn_number, abn_entity_name, abn_status, checked_at)
      VALUES (${fx.brandId}, true, '51824753556', 'WATTLE CREEK PTY LTD', 'Active', now() - interval '40 days 1 hour')`;
  }
});

const eventData = (fx: ReportFixture) => ({
  brandId: fx.brandId,
  organizationId: fx.orgId,
  periodLabel: "2026-W47",
  periodType: "weekly",
  manual: true,
  tier: "enhanced",
});

/** Every event sent in this file, in order: one spy for the whole file, because refreshes overlap in one test. */
const outbox: SentEvent[] = [];
const sentFor = (reportId: string, except?: string) =>
  outbox.filter((e) => e.data.reportId === reportId && e.name !== except);

/** The generator alone (Inngest would deliver its request to the new function). */
async function generatorOnly(fx: ReportFixture, step?: (name: string) => StepRunner) {
  const { generateNarrativeReport } = await import("@/inngest/functions/generate-narrative-report");
  const steps: string[] = [];
  const out = (await (generateNarrativeReport as unknown as { fn: Handler }).fn({
    event: { id: `evt-${crypto.randomUUID()}`, data: eventData(fx) },
    step: {
      run: async (name, fn) => {
        steps.push(name);
        return step ? step(name).run(name, fn) : fn();
      },
    },
  })) as { reportId: string; enhancedChecks?: string };
  return { out, sent: sentFor(out.reportId), steps };
}

/** The new function for one request, as Inngest runs it; returns what it sent. */
async function runChecks(request: SentEvent) {
  const { refreshEnhancedChecksFn } = await import("@/inngest/functions/refresh-enhanced-checks");
  await (refreshEnhancedChecksFn as unknown as { fn: Handler }).fn({
    event: { id: request.id ?? "evt", data: request.data },
    step: { run: (_name, fn) => fn() },
  });
  return sentFor(String(request.data.reportId), request.name);
}

async function snapshotOf(reportId: string) {
  const [row] = await sql<
    { report_tier: string; contents_snapshot: Record<string, unknown> | null }[]
  >`
    SELECT report_tier, contents_snapshot FROM generated_reports WHERE id = ${reportId}`;
  return row;
}

describe("refresh-enhanced-checks", () => {
  it("the generator ends once the row is written: it asks for the checks and sends nothing else", async () => {
    const { out, sent, steps } = await generatorOnly(a);
    expect(steps).toEqual([
      "check-schedule-and-template",
      "generate-and-insert",
      "request-enhanced-checks",
    ]);
    expect(out.enhancedChecks).toBe("requested");
    expect(sent).toEqual([
      {
        id: `enhanced-checks-${out.reportId}`,
        name: "report/enhanced-checks-requested",
        data: expect.objectContaining({
          organizationId: a.orgId,
          brandId: a.brandId,
          reportId: out.reportId,
          auditId: a.audits[52],
          periodType: "weekly",
          periodLabel: "2026-W47",
          plan: "agency",
        }),
      },
    ]);
    expect(runners.calls).toEqual([]);
    expect(await snapshotOf(out.reportId)).toEqual({
      report_tier: "enhanced",
      contents_snapshot: null,
    });
  });

  it("two Enhanced reports for one brand still run one refresh", async () => {
    const first = await generatorOnly(a);
    const second = await generatorOnly(a);
    // The brand key runs them one after another: the first refresh, then the second.
    const sentFirst = await runChecks(first.sent[0]);
    const sentSecond = await runChecks(second.sent[0]);
    expect(runners.calls).toEqual([a.brandId]);
    const one = (await snapshotOf(first.out.reportId)).contents_snapshot?.beyondAi as {
      refreshed: unknown[];
    };
    const two = (await snapshotOf(second.out.reportId)).contents_snapshot?.beyondAi as {
      refreshed: unknown[];
    };
    expect(one.refreshed).toHaveLength(3);
    expect(two.refreshed).toEqual([]);
    expect(sentFirst.map((e) => [e.name, e.data.reportId])).toEqual([
      ["report/generated", first.out.reportId],
    ]);
    expect(sentSecond.map((e) => [e.name, e.data.reportId])).toEqual([
      ["report/generated", second.out.reportId],
    ]);
  });

  it("brand A's report doesn't wait for brand B's refresh, and a post-audit job runs while B's is held", async () => {
    runners.behaviour.set(b.brandId, "hold");
    const forB = await generatorOnly(b);
    const heldB = runChecks(forB.sent[0]);
    await vi.waitFor(() => expect(runners.release).not.toBeNull());

    // While B's refresh is held: the generator (a POST_AUDIT_POOL job) runs for A, then A's own refresh.
    const forA = await generatorOnly(a);
    expect(forA.out.enhancedChecks).toBe("requested");
    await runChecks(forA.sent[0]);
    expect((await snapshotOf(forA.out.reportId)).contents_snapshot).not.toBeNull();
    expect((await snapshotOf(forB.out.reportId)).contents_snapshot).toBeNull();

    runners.release?.();
    const sentB = await heldB;
    expect((await snapshotOf(forB.out.reportId)).contents_snapshot).not.toBeNull();
    expect(sentB.map((e) => e.name)).toEqual(["report/generated"]);
    expect(runners.calls).toEqual([b.brandId, a.brandId]);
  });

  it("a check that fails prints its failure line, every tile still prints, and the PDF is started", async () => {
    runners.behaviour.set(a.brandId, "throw");
    {
      const generated = await generatorOnly(a);
      await runChecks(generated.sent[0]);
      const row = await snapshotOf(generated.out.reportId);
      const beyond = row.contents_snapshot?.beyondAi as Record<
        string,
        { status: string; failure?: string }
      >;
      for (const check of ["identity", "crawlers", "technical"])
        expect(beyond[check]).toMatchObject({
          status: "failed",
          failure: "the check didn't complete",
        });
      expect(sentFor(generated.out.reportId).map((e) => e.name)).toEqual([
        "report/enhanced-checks-requested",
        "report/generated",
      ]);

      const { serviceDb } = await import("@/db/client");
      const { loadReportRenderData } = await import("@/lib/reports/report-render-input");
      const { data } = await loadReportRenderData(serviceDb, {
        organizationId: a.orgId,
        brandId: a.brandId,
        auditId: a.audits[52],
        periodType: "weekly",
        periodLabel: "2026-W47",
        sections: null,
        contentsSnapshot: row.contents_snapshot,
      });
      const text = collectPdfPages(<ReportDocument data={data!} />)
        .flat()
        .join("\n");
      for (const tile of [
        "Business identity",
        "YouTube",
        "AI crawlers",
        "Website technical",
        "Your directory profiles",
      ])
        expect(text).toContain(tile);
      expect(
        text.match(/Couldn.t check on [^\n]*: the check didn.t complete/g)?.length,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it("a run in flight from before S01B (its first step's result has no checksIn) finishes under the old step ids", async () => {
    const { out, sent, steps } = await generatorOnly(a, (name) => ({
      run: async (_n, fn) => {
        const result = await fn();
        // What the code before S01B returned from this step, as Inngest replays it for a run already in flight.
        if (name === "generate-and-insert" && result && typeof result === "object") {
          const { checksIn: _dropped, ...before } = result as Record<string, unknown>;
          return before as typeof result;
        }
        return result;
      },
    }));
    expect(steps).toEqual([
      "check-schedule-and-template",
      "generate-and-insert",
      "refresh-enhanced-checks",
      "write-report-snapshot",
      "emit-report-generated",
    ]);
    expect(sent.map((e) => e.name)).toEqual(["report/generated"]);
    expect(runners.calls).toEqual([a.brandId]);
    expect((await snapshotOf(out.reportId)).contents_snapshot).not.toBeNull();
  });
});
