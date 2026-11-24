/**
 * S01 part 9 (LLD 8.1.7 "Enhanced checks before rendering", D-RT4; contract P08.checks, P17 statuses): the refresh step
 * -- since S01B part 1 in its own function, refresh-enhanced-checks, which the generator asks for -- on a real database
 * with a fixed set of check dates and recorded runners (no live provider calls).
 * - Enhanced: the row is written first with no snapshot ("Running checks..." on P17), the stale checks run once, then
 *   the snapshot is written (the tiles' new dates, `refreshed`) and the PDF can render.
 * - Only stale checks run (technical and identity 40 days old: the site checks; YouTube 2 days old: not).
 * - A second Enhanced report for the brand right after runs nothing (the first one's results are fresh).
 * - A check that runs out of time prints "Couldn't check on {date}: the check took too long" and the report renders.
 * - Basic and Standard never refresh.
 * - The panel's list says the same as the refresh: "will run again" for the stale ones, "will reuse" for the rest.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ReportDocument } from "@/lib/communication/pdf-builder";
import { collectPdfPages } from "@/tests/helpers/pdf-text";
import { type ReportFixture, seedReportFixture } from "@/tests/helpers/report-fixture";
import { runReportGeneration } from "@/tests/helpers/report-generation";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const runners = vi.hoisted(() => ({
  site: [] as string[],
  youtube: [] as string[],
  hangSite: false,
  sql: null as null | ((brandId: string, orgId: string) => Promise<void>),
}));
vi.mock("@/lib/reports/enhanced-check-runners", () => ({
  enhancedRunners: (organizationId: string) => ({
    site: async (brand: { id: string }) => {
      runners.site.push(brand.id);
      if (runners.hangSite) return new Promise<void>(() => undefined);
      await runners.sql?.(brand.id, organizationId);
    },
    youtube: async (brand: { id: string }) => {
      runners.youtube.push(brand.id);
    },
  }),
}));
vi.mock("@/lib/reports/enhanced-checks", async (orig) => ({
  ...(await orig<typeof import("@/lib/reports/enhanced-checks")>()),
  // The real step waits five minutes; this one gives up quickly so the timeout path can run in a test.
  ENHANCED_REFRESH_TIMEOUT_MS: 300,
}));

const sql = postgres(getTestDatabaseUrl(), { max: 1 });
let fx: ReportFixture;

const ROBOTS = {
  fetchStatus: "ok",
  aiBotsAllowed: ["OAI-SearchBot", "Claude-SearchBot"],
  aiBotsBlocked: [],
};

beforeAll(async () => {
  process.env.DATABASE_URL = getTestDatabaseUrl();
  process.env.SERVICE_DATABASE_URL = getTestDatabaseUrl();
  fx = await seedReportFixture(sql, {
    brandName: "TechCore IT",
    agencyName: "Splice Marketing",
    tier: "agency",
    audits: [{ number: 52, completedAt: "2026-11-20T03:00:00.000Z", mentions: {} }],
  });
  await sql`UPDATE brands SET abn = '17701710947', youtube_channel_url = 'https://www.youtube.com/@techcoreit' WHERE id = ${fx.brandId}`;
  await sql`INSERT INTO org_feature_flags (organization_id, flag_key, is_enabled) VALUES (${fx.orgId}, 'report_v2', true)`;
  // What the recorded site runner writes: what the technical audit runner writes, now.
  runners.sql = async (brandId, orgId) => {
    await sql`INSERT INTO technical_audits (brand_id, organization_id, score_composite, findings)
      VALUES (${brandId}, ${orgId}, '41.00', ${sql.json({ robots: ROBOTS })})`;
    await sql`INSERT INTO brand_entity_scores (brand_id, abn_verified, abn_number, abn_entity_name, abn_status)
      VALUES (${brandId}, true, '17701710947', 'ASTORIO GROUP PTY LTD', 'Active')`;
  };
}, 60_000);

afterAll(async () => {
  for (const table of ["technical_audits", "youtube_presence_audits", "org_feature_flags"])
    await sql`DELETE FROM ${sql(table)} WHERE organization_id = ${fx.orgId}`;
  await sql`DELETE FROM brand_entity_scores WHERE brand_id = ${fx.brandId}`;
  await fx.cleanup();
  await sql.end();
});

/** The checks as they were: technical and identity 40 days old, YouTube 2 days old. */
async function seedOldChecks() {
  await sql`DELETE FROM technical_audits WHERE brand_id = ${fx.brandId}`;
  await sql`DELETE FROM brand_entity_scores WHERE brand_id = ${fx.brandId}`;
  await sql`DELETE FROM youtube_presence_audits WHERE brand_id = ${fx.brandId}`;
  await sql`INSERT INTO technical_audits (brand_id, organization_id, score_composite, findings, created_at)
    VALUES (${fx.brandId}, ${fx.orgId}, '38.00', ${sql.json({ robots: ROBOTS })}, now() - interval '40 days 1 hour')`;
  await sql`INSERT INTO brand_entity_scores (brand_id, abn_verified, abn_number, abn_entity_name, abn_status, checked_at)
    VALUES (${fx.brandId}, true, '17701710947', 'ASTORIO GROUP PTY LTD', 'Active', now() - interval '40 days 1 hour')`;
  await sql`INSERT INTO youtube_presence_audits (brand_id, organization_id, channel_url, channel_title, channel_exists,
      channel_total_videos, match_confidence, check_status, cited_video_urls, presence_score, gaps, audited_at)
    VALUES (${fx.brandId}, ${fx.orgId}, 'https://www.youtube.com/@techcoreit', 'TechCore IT', true, 4, 0.950,
      'confirmed', '[]', 40, '[]', now() - interval '2 days 1 hour')`;
}

beforeEach(async () => {
  runners.site.length = 0;
  runners.youtube.length = 0;
  runners.hangSite = false;
  await sql`DELETE FROM generated_reports WHERE brand_id = ${fx.brandId}`;
  await seedOldChecks();
});

async function generate(tier: string) {
  const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  // S01B part 1 (LLD amendment 49): the generator writes the row and asks for the checks; refresh-enhanced-checks runs
  // them, writes the snapshot and sends report/generated. Both run here, as Inngest would run them; each step is
  // recorded as "{function}: {step}".
  const steps: string[] = [];
  const rowAfter: Record<string, { report_tier: string; has_snapshot: boolean } | undefined> = {};
  try {
    const { generator: out, sent } = await runReportGeneration({
      eventId: `evt-${randomUUID()}`,
      data: {
        brandId: fx.brandId,
        organizationId: fx.orgId,
        periodLabel: "2026-W47",
        periodType: "weekly",
        manual: true,
        tier,
      },
      step: (fnId) => ({
        run: async (name, fn) => {
          const key = `${fnId}: ${name}`;
          steps.push(key);
          const result = await fn();
          const [r] = await sql<{ report_tier: string; has_snapshot: boolean }[]>`
            SELECT report_tier, contents_snapshot IS NOT NULL AS has_snapshot FROM generated_reports
            WHERE brand_id = ${fx.brandId} ORDER BY created_at DESC LIMIT 1`;
          rowAfter[key] = r;
          return result;
        },
      }),
    });
    if (!out.reportId) throw new Error(`no report: ${JSON.stringify(out)}`);
    const [row] = await sql<
      { id: string; report_tier: string; contents_snapshot: Record<string, unknown> | null }[]
    >`
      SELECT id, report_tier, contents_snapshot FROM generated_reports WHERE id = ${out.reportId}`;
    return {
      row,
      steps,
      rowAfter,
      events: sent.map((e) => e.name),
    };
  } finally {
    info.mockRestore();
  }
}

async function pdfText(reportId: string): Promise<string> {
  const { serviceDb } = await import("@/db/client");
  const { loadReportRenderData } = await import("@/lib/reports/report-render-input");
  const [r] = await sql<{ audit_id: string; contents_snapshot: unknown }[]>`
    SELECT audit_id, contents_snapshot FROM generated_reports WHERE id = ${reportId}`;
  const { data } = await loadReportRenderData(serviceDb, {
    organizationId: fx.orgId,
    brandId: fx.brandId,
    auditId: r.audit_id,
    periodType: "weekly",
    periodLabel: "2026-W47",
    sections: null,
    contentsSnapshot: r.contents_snapshot,
  });
  return collectPdfPages(<ReportDocument data={data!} />)
    .flat()
    .join("\n");
}

describe("the Enhanced refresh step", () => {
  it("writes the row first (Running checks), runs only the stale checks once, then the snapshot", async () => {
    const { row, steps, rowAfter, events } = await generate("enhanced");
    // S01B part 1 (LLD amendment 49: "S01B moves it into its own function, one per brand and at most 2
    // account-wide"): the same steps, the checks and snapshot now in refresh-enhanced-checks.
    expect(steps).toEqual([
      "generate-narrative-report: check-schedule-and-template",
      "generate-narrative-report: generate-and-insert",
      "generate-narrative-report: request-enhanced-checks",
      "refresh-enhanced-checks: refresh-enhanced-checks",
      "refresh-enhanced-checks: write-report-snapshot",
      "refresh-enhanced-checks: emit-report-generated",
    ]);
    expect(rowAfter["generate-narrative-report: generate-and-insert"]).toEqual({
      report_tier: "enhanced",
      has_snapshot: false,
    });
    expect(rowAfter["refresh-enhanced-checks: write-report-snapshot"]).toEqual({
      report_tier: "enhanced",
      has_snapshot: true,
    });
    expect(events).toContain("report/generated");
    expect(runners.site).toEqual([fx.brandId]);
    expect(runners.youtube).toEqual([]);
    const beyond = row.contents_snapshot?.beyondAi as {
      refreshed: Array<{ check: string; result: string }>;
      technical: { score: number; checkedAt: string };
    };
    expect(beyond.refreshed.map((r) => [r.check, r.result])).toEqual([
      ["identity", "measured"],
      ["crawlers", "measured"],
      ["technical", "measured"],
    ]);
    expect(beyond.technical.score).toBe(41);
  });

  it("a second Enhanced report right after runs nothing: the first one's results are fresh", async () => {
    await generate("enhanced");
    runners.site.length = 0;
    await sql`DELETE FROM generated_reports WHERE brand_id = ${fx.brandId}`;
    const { row } = await generate("enhanced");
    expect(runners.site).toEqual([]);
    expect(runners.youtube).toEqual([]);
    expect((row.contents_snapshot?.beyondAi as { refreshed: unknown[] }).refreshed).toEqual([]);
  });

  it("a check that runs out of time prints its failure line, and the report still renders", async () => {
    runners.hangSite = true;
    const { row } = await generate("enhanced");
    const beyond = row.contents_snapshot?.beyondAi as {
      technical: { status: string; failure: string };
    };
    expect(beyond.technical).toMatchObject({
      status: "failed",
      failure: "the check took too long",
    });
    const text = await pdfText(row.id);
    expect(text).toContain("Beyond AI answers");
    expect(text).toMatch(/Couldn.t check on .*: the check took too long/);
  });

  it.each(["basic", "standard"])("a %s report never refreshes", async (tier) => {
    const { row, steps } = await generate(tier);
    expect(runners.site).toEqual([]);
    // Neither the generator's request nor the refresh function ran (S01B part 1: steps are "{function}: {step}").
    expect(steps.filter((s) => s.includes("enhanced-checks"))).toEqual([]);
    expect(row.report_tier).toBe(tier);
    expect(row.contents_snapshot).not.toBeNull();
  });

  it("the panel's list says what the refresh will do", async () => {
    const { withRlsContext } = await import("@/db/client");
    const { buildReportContentsView } = await import("@/lib/reports/report-contents-view");
    const view = await withRlsContext(fx.orgId, (tx) =>
      buildReportContentsView(tx, { organizationId: fx.orgId, brandId: fx.brandId }),
    );
    if (!view.enabled) throw new Error("report_v2 is on");
    expect(view.checks.map((c) => [c.label, c.status])).toEqual([
      ["Business identity (ABN)", "Checked 40 days ago · will run again (about 1 minute)"],
      ["YouTube", "Checked 2 days ago · will reuse"],
      ["AI crawler access", "Checked 40 days ago · will run again (about 1 minute)"],
      ["Website technical", "Checked 40 days ago · will run again (about 1 minute)"],
      ["Your directory profiles", "From audit #52"],
    ]);
  });
});
