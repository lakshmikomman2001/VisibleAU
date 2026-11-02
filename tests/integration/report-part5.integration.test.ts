/**
 * DEMO-BLOCKER (1 Nov), part 5 -- Sri's decisions on the part 1 findings,
 * against the real functions and a database seeded like Omega Services:
 * 3. "your profile" is only stated for a linked listing: Not linked yet /
 *    0 cited / k cited, counted per answer;
 * 4. a brand row without an agency name doesn't hide the workspace's;
 * 5. the report template's include flags leave sections out;
 * 6. the trend job hands reports the audit's ISO week in Sydney time;
 * 7. a schedule for brand A doesn't make reports for brand B; a
 *    workspace-wide one does;
 * 8. the evidence archive keeps what the method page says it keeps.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import type { ReactNode } from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { collectPdfText } from "@/tests/helpers/pdf-text";
import {
  AUDIT_37,
  AUDIT_38,
  AUDIT_39,
  EVERYDAY_QUESTIONS,
  type ReportFixture,
  seedReportFixture,
} from "@/tests/helpers/report-fixture";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const rendered = vi.hoisted(() => ({ elements: [] as unknown[] }));
vi.mock("@react-pdf/renderer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@react-pdf/renderer")>();
  return {
    ...actual,
    renderToBuffer: vi.fn(async (element: unknown) => {
      rendered.elements.push(element);
      return Buffer.from("%PDF-1.4 test report");
    }),
  };
});
vi.mock("@/lib/storage", () => ({
  getStorage: () => ({ upload: vi.fn(async () => undefined) }),
}));
vi.mock("@/lib/storage/config-check", () => ({ storageConfigProblem: () => null }));

type Handler = (ctx: {
  event: { id: string; data: Record<string, unknown> };
  step: { run: (name: string, fn: () => unknown) => unknown };
}) => Promise<unknown>;

let sql: ReturnType<typeof postgres>;
let fx: ReportFixture;
const BRAND_B = randomUUID();
const AUDIT_B = randomUUID();
const TEMPLATE_NO_TREND = randomUUID();
const REPORT_WITH_TEMPLATE = randomUUID();
const REPORT_NO_TEMPLATE = randomUUID();
const OWN_HIPAGES = "https://hipages.com.au/listing/another-business-0";

async function renderReport(reportId: string): Promise<string> {
  const { renderReportPdf } = await import("@/inngest/functions/render-report-pdf");
  rendered.elements.length = 0;
  await (renderReportPdf as unknown as { fn: Handler }).fn({
    event: {
      id: `evt-${reportId}`,
      data: { reportId, organizationId: fx.orgId, brandId: fx.brandId },
    },
    step: { run: (_name, fn) => fn() },
  });
  return collectPdfText(rendered.elements[0] as ReactNode).join("\n");
}

async function generate(
  brandId: string,
  periodLabel: string,
): Promise<{ skipped?: boolean; reportId?: string }> {
  const { inngest } = await import("@/lib/inngest/client");
  const send = vi.spyOn(inngest, "send").mockResolvedValue({ ids: ["x"] });
  const { generateNarrativeReport } = await import("@/inngest/functions/generate-narrative-report");
  try {
    return (await (generateNarrativeReport as unknown as { fn: Handler }).fn({
      event: {
        id: `evt-gen-${brandId}`,
        data: { brandId, organizationId: fx.orgId, periodLabel, periodType: "weekly" },
      },
      step: { run: (_name, fn) => fn() },
    })) as { skipped?: boolean; reportId?: string };
  } finally {
    send.mockRestore();
  }
}

beforeAll(async () => {
  sql = postgres(getTestDatabaseUrl(), { max: 1 });
  fx = await seedReportFixture(sql, { tier: "agency", audits: [AUDIT_37, AUDIT_38, AUDIT_39] });

  // Point 3: hipages linked, and its profile is the page answer 0 cites;
  // Word of Mouth linked but never cited; Localsearch not linked.
  await sql`
    INSERT INTO brand_directory_listings (organization_id, brand_id, directory_key, status, profile_url, confirmed_at)
    VALUES (${fx.orgId}, ${fx.brandId}, 'hipages', 'listed', ${OWN_HIPAGES}, now()),
           (${fx.orgId}, ${fx.brandId}, 'word_of_mouth', 'listed', 'https://www.wordofmouth.com.au/reviews/omega-own', now()),
           (${fx.orgId}, ${fx.brandId}, 'localsearch', 'unsure', NULL, now())
  `;
  // Point 4: the brand's own row has no agency name; the workspace's does.
  await sql`
    INSERT INTO agency_brand_assets (organization_id, brand_id, agency_name)
    VALUES (${fx.orgId}, ${fx.brandId}, NULL), (${fx.orgId}, NULL, 'Splice Marketing')
  `;
  // Point 5: a template that leaves out the trend and the method page.
  await sql`
    INSERT INTO report_templates (id, organization_id, name, template_type, sections, is_default)
    VALUES (${TEMPLATE_NO_TREND}, ${fx.orgId}, 'No trend', 'standard',
            ${sql.json([
              { type: "trend", include: false },
              { type: "method", include: false },
            ])}, false)
  `;
  for (const [id, templateId] of [
    [REPORT_WITH_TEMPLATE, TEMPLATE_NO_TREND],
    [REPORT_NO_TEMPLATE, null],
  ] as const) {
    await sql`
      INSERT INTO generated_reports (id, brand_id, organization_id, audit_id, template_id, report_type,
                                     period_label, headline, narrative_text)
      VALUES (${id}, ${fx.brandId}, ${fx.orgId}, ${fx.audits[39]}, ${templateId}, 'weekly', '2026-W44',
              'AI Visibility Report', '')
    `;
  }
  // Points 6 and 7: a second brand in the same workspace, with one audit
  // finished at 7 am AEDT on Monday 2 Nov (20:00 UTC Sunday).
  await sql`
    INSERT INTO brands (id, organization_id, name, domain, vertical, region, primary_regions)
    VALUES (${BRAND_B}, ${fx.orgId}, 'Brand B', ${`b-${BRAND_B.slice(0, 8)}.example.com.au`}, 'tradies', 'au', ARRAY[]::text[])
  `;
  await sql`
    INSERT INTO audits (id, brand_id, organization_id, audit_number, status, engines, prompts_count,
                        runs_per_prompt, metadata, started_at, completed_at, methodology_version)
    VALUES (${AUDIT_B}, ${BRAND_B}, ${fx.orgId}, 40, 'complete', ${["chatgpt"]}, 10, 1, ${sql.json({})},
            '2026-11-01T19:57:00Z', '2026-11-01T20:00:00Z', 2)
  `;
  await sql`INSERT INTO citations ${sql(
    EVERYDAY_QUESTIONS.map((prompt, i) => ({
      audit_id: AUDIT_B,
      engine: "chatgpt",
      prompt,
      prompt_index: i,
      run_number: 1,
      brand_mentioned: false,
      is_branded_prompt: false,
      response_snippet: "No mention.",
    })),
  )}`;
}, 180_000);

afterAll(async () => {
  await sql`DELETE FROM report_delivery_schedules WHERE organization_id = ${fx.orgId}`;
  await sql`DELETE FROM generated_reports WHERE organization_id = ${fx.orgId}`;
  await sql`DELETE FROM visibility_trends WHERE brand_id = ${BRAND_B}`;
  await sql`DELETE FROM evidence_snapshots WHERE organization_id = ${fx.orgId}`;
  await sql`DELETE FROM citations WHERE audit_id = ${AUDIT_B}`;
  await sql`DELETE FROM audits WHERE id = ${AUDIT_B}`;
  await sql`DELETE FROM brands WHERE id = ${BRAND_B}`;
  await fx?.cleanup();
  await sql?.end();
});

describe("point 3: 'your profile' only where a listing is linked", () => {
  it("counts the answers that cited the owner's own profile, per directory", async () => {
    const { serviceDb } = await import("@/db/client");
    const { getDirectoryCitationsForAudit } = await import("@/lib/directories/citation-counts");
    const dirs = await getDirectoryCitationsForAudit(serviceDb, fx.audits[39], {
      id: fx.brandId,
      region: "au",
      categories: ["trades_general"],
    });
    const pick = (key: string) => {
      const r = dirs.results.find((d) => d.directory.key === key);
      return r && [r.citedCount, r.ownerProfileLinked, r.ownerProfileCitedCount];
    };
    expect(pick("hipages")).toEqual([8, true, 1]);
    expect(pick("word_of_mouth")).toEqual([6, true, 0]);
    expect(pick("localsearch")).toEqual([5, false, 0]);
  });

  it("the PDF says 1 cited / 0 cited / Not linked yet, never 'none were your profile'", async () => {
    const text = await renderReport(REPORT_WITH_TEMPLATE);
    // The directory table's row: name, count, "Your profile" pill.
    expect(text).toContain("hipages\n8 of 40\n1 cited");
    expect(text).toContain("Word of Mouth\n6 of 40\n0 cited");
    expect(text).toContain("Localsearch\n5 of 40\nNot linked yet");
    expect(text).not.toContain("none were your profile");
  });
});

describe("point 4: the agency name falls back field by field", () => {
  it("a brand row with no agency name doesn't hide the workspace's 'Splice Marketing'", async () => {
    const text = await renderReport(REPORT_WITH_TEMPLATE);
    expect(text).toContain("Splice Marketing");
  });
});

describe("point 5: the template's include flags", () => {
  it("a template without the trend and method sections leaves them out", async () => {
    const text = await renderReport(REPORT_WITH_TEMPLATE);
    expect(text).not.toContain("Over time");
    expect(text).not.toContain("Method and notes");
  });

  it("a report with no template has every section (point 8: and the evidence line on the method page)", async () => {
    const { EVIDENCE_ARCHIVE_SENTENCE } = await import("@/lib/trust/evidence-archiver");
    const text = await renderReport(REPORT_NO_TEMPLATE);
    expect(text).toContain("Over time");
    expect(text).toContain("Method and notes");
    expect(text).toContain(EVIDENCE_ARCHIVE_SENTENCE);
  });
});

describe("point 6: the trend job hands reports the audit's week in Sydney time", () => {
  it("an audit finished at 7 am AEDT on Monday 2 Nov is in 2026-W45", async () => {
    const { inngest } = await import("@/lib/inngest/client");
    const send = vi.spyOn(inngest, "send").mockResolvedValue({ ids: ["x"] });
    const { aggregateVisibilityTrendFn } = await import(
      "@/inngest/functions/aggregate-visibility-trend"
    );
    await (aggregateVisibilityTrendFn as unknown as { fn: Handler }).fn({
      event: {
        id: "evt-agg",
        data: { auditId: AUDIT_B, brandId: BRAND_B, organizationId: fx.orgId },
      },
      step: { run: (_name, fn) => fn() },
    });
    const events = send.mock.calls.flatMap((c) => (Array.isArray(c[0]) ? c[0] : [c[0]]));
    const aggregated = events.find((e) => e.name === "trend/aggregated");
    expect(aggregated?.data).toMatchObject({ brandId: BRAND_B, reportPeriodLabel: "2026-W45" });
    send.mockRestore();
  });
});

describe("point 7: weekly reports per brand", () => {
  it("a schedule for brand A makes A's report, not brand B's; a workspace-wide one makes B's", async () => {
    await sql`
      INSERT INTO report_delivery_schedules (organization_id, brand_id, frequency, day_of_week, recipient_emails, is_active)
      VALUES (${fx.orgId}, ${fx.brandId}, 'weekly', 1, ${sql.json(["a@example.com.au"])}, true)
    `;
    expect(await generate(BRAND_B, "2026-W45")).toEqual({
      skipped: true,
      reason: "no_active_delivery_schedule",
    });
    expect((await generate(fx.brandId, "2026-W44")).reportId).toBeTruthy();

    await sql`
      INSERT INTO report_delivery_schedules (organization_id, brand_id, frequency, day_of_week, recipient_emails, is_active)
      VALUES (${fx.orgId}, NULL, 'weekly', 1, ${sql.json(["all@example.com.au"])}, true)
    `;
    expect((await generate(BRAND_B, "2026-W45")).reportId).toBeTruthy();
  });
});

describe("point 8: what the evidence archive keeps", () => {
  it("every first-run answer's engine, question and first 500 characters, with a capture time -- no replays", async () => {
    // A replayed run (run 2) of one answer: never archived.
    await sql`
      INSERT INTO citations (audit_id, engine, prompt, prompt_index, run_number, brand_mentioned, is_branded_prompt, response_snippet)
      VALUES (${fx.audits[39]}, 'chatgpt', ${EVERYDAY_QUESTIONS[0]}, NULL, 2, false, false, 'replay')
    `;
    const { serviceDb } = await import("@/db/client");
    const { captureEvidenceSnapshots } = await import("@/lib/trust/evidence-archiver");
    const { snapshotCount } = await captureEvidenceSnapshots(
      serviceDb,
      fx.audits[39],
      fx.brandId,
      fx.orgId,
    );
    const [firstRun] = await sql<{ n: string }[]>`
      SELECT count(*) AS n FROM citations WHERE audit_id = ${fx.audits[39]} AND run_number = 1
    `;
    expect(snapshotCount).toBe(Number(firstRun.n));
    const rows = await sql<
      { engine: string; prompt: string; raw: string; snippet: string; captured: Date }[]
    >`
      SELECT es.engine, es.prompt, es.raw_response AS raw, c.response_snippet AS snippet, es.captured_at AS captured
      FROM evidence_snapshots es
      JOIN citations c ON c.audit_id = es.audit_id AND c.engine = es.engine AND c.prompt = es.prompt AND c.run_number = 1
      WHERE es.audit_id = ${fx.audits[39]}
    `;
    expect(rows.length).toBe(snapshotCount);
    for (const r of rows) {
      expect(r.raw).toBe(r.snippet);
      expect(r.raw.length).toBeLessThanOrEqual(500);
      expect(r.engine).toBeTruthy();
      expect(r.prompt).toBeTruthy();
      expect(r.captured).toBeInstanceOf(Date);
    }
    expect(rows.some((r) => r.raw === "replay")).toBe(false);
  });
});
