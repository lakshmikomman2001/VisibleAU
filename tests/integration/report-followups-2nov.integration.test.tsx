/**
 * Report follow-ups from the first live PDF (2 Nov), against the real
 * generate route, Inngest functions and renderer, on a database seeded like
 * production's Omega Services: Audits #30-#39, #37 partial (Claude: spend
 * limit), #39 on Sunday 1 Nov.
 * 1. "Generate report" on Monday 2 Nov, 7:13 pm AEDT, with no week chosen:
 *    Week 44 (26 Oct – 1 Nov), the week of the audit it's based on -- not
 *    Week 45 (2 – 8 Nov), which has barely started. A chosen week, and a
 *    scheduled report's week, are kept; a week with no audit still says the
 *    report uses the latest audit before it.
 * 2. The trend draws #37 hollow at its measured value and says why it isn't
 *    compared; the comparison uses only like-for-like audits. With more
 *    than 8 audits it keeps the latest 8 and says how many are left out.
 * With REPORT_PDF_OUT_DIR set, the rendered PDFs are written there for the
 * render check (`pdftoppm -r 70`).
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import type { ReactNode } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { C } from "@/lib/reports/pdf/tokens";
import { collectPdfPages, findPdfElements } from "@/tests/helpers/pdf-text";
import {
  AUDIT_37,
  AUDIT_38,
  AUDIT_39,
  type FixtureAuditSpec,
  type ReportFixture,
  seedReportFixture,
} from "@/tests/helpers/report-fixture";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const rendered = vi.hoisted(() => ({ elements: [] as unknown[], pdfs: [] as Buffer[] }));
vi.mock("@react-pdf/renderer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@react-pdf/renderer")>();
  return {
    ...actual,
    renderToBuffer: vi.fn(async (element: Parameters<typeof actual.renderToBuffer>[0]) => {
      rendered.elements.push(element);
      const pdf = await actual.renderToBuffer(element);
      rendered.pdfs.push(pdf);
      return pdf;
    }),
  };
});
vi.mock("@/lib/storage", () => ({
  getStorage: () => ({ upload: vi.fn(async () => undefined) }),
}));
vi.mock("@/lib/storage/config-check", () => ({ storageConfigProblem: () => null }));
const currentUser = vi.hoisted(() => ({ value: null as Record<string, unknown> | null }));
vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => currentUser.value),
}));

type Handler = (ctx: {
  event: { id: string; data: Record<string, unknown> };
  step: { run: (name: string, fn: () => unknown) => unknown };
}) => Promise<unknown>;

/** Mon 2 Nov 2026, 7:13 pm AEDT -- when Sri clicked "Generate report". */
const MONDAY_EVENING = new Date("2026-11-02T08:13:00Z");
const SPEND_LIMIT = "Provider spend limit reached (a monthly limit set in the provider's console)";

/** Earlier full audits, same question pack and methodology: #30-#32 in Week 43, #33-#36 in Week 44. */
const EARLIER: FixtureAuditSpec[] = [
  {
    number: 30,
    completedAt: "2026-10-18T23:00:00.000Z",
    mentions: { chatgpt: [1, 2], claude: [1], perplexity: [1, 2, 3] },
  },
  {
    number: 31,
    completedAt: "2026-10-20T23:00:00.000Z",
    mentions: { chatgpt: [1, 2, 3], claude: [1], perplexity: [1, 2, 3, 4] },
  },
  {
    number: 32,
    completedAt: "2026-10-22T23:00:00.000Z",
    mentions: { chatgpt: [1, 2, 3], claude: [1, 2], perplexity: [1, 2, 3, 4] },
  },
  {
    number: 33,
    completedAt: "2026-10-25T23:00:00.000Z",
    mentions: { chatgpt: [1, 2], claude: [1], perplexity: [1, 2, 3] },
  },
  {
    number: 34,
    completedAt: "2026-10-26T23:00:00.000Z",
    mentions: { chatgpt: [1, 2, 3, 4], claude: [1], perplexity: [1, 2, 3] },
  },
  {
    number: 35,
    completedAt: "2026-10-27T23:00:00.000Z",
    mentions: { chatgpt: [1, 2, 3], perplexity: [1, 2, 3, 4] },
  },
  {
    number: 36,
    completedAt: "2026-10-28T23:00:00.000Z",
    mentions: { chatgpt: [1, 2, 3, 4], claude: [1, 2], perplexity: [1, 2, 3, 4] },
  },
];

let sql: ReturnType<typeof postgres>;
let fx: ReportFixture;

beforeAll(async () => {
  sql = postgres(getTestDatabaseUrl(), { max: 1 });
  fx = await seedReportFixture(sql, {
    agencyName: "Splice Marketing",
    audits: [...EARLIER, AUDIT_37, AUDIT_38, AUDIT_39],
  });
  await sql`
    INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, billing_interval, status)
    VALUES (${fx.orgId}, ${`cus_${fx.orgId}`}, ${`sub_${fx.orgId}`}, 'price_test', 'growth', 'monthly', 'active')
  `;
  currentUser.value = {
    id: randomUUID(),
    organizationId: fx.orgId,
    role: "owner",
    email: "sri@example.com.au",
    organization: { id: fx.orgId, name: "Splice Marketing (test)" },
  };
}, 180_000);

afterAll(async () => {
  await sql`DELETE FROM subscriptions WHERE organization_id = ${fx.orgId}`;
  await fx?.cleanup();
  await sql?.end();
});

async function postGenerate(body: Record<string, unknown>) {
  const { inngest } = await import("@/lib/inngest/client");
  const send = vi.spyOn(inngest, "send").mockResolvedValue({ ids: ["x"] });
  const { POST } = await import("@/app/api/brands/[brandId]/reports/generate/route");
  try {
    const res = await POST(
      new Request("http://t/x", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ brandId: fx.brandId }) },
    );
    const json = (await res.json()) as { periodLabel?: string };
    const events = send.mock.calls.flatMap((c) => (Array.isArray(c[0]) ? c[0] : [c[0]]));
    const event = events.find((e) => e.name === "trend/aggregated");
    return {
      status: res.status,
      periodLabel: json.periodLabel,
      event: (event?.data ?? {}) as Record<string, unknown>,
    };
  } finally {
    send.mockRestore();
  }
}

async function generate(data: Record<string, unknown>): Promise<string> {
  const { inngest } = await import("@/lib/inngest/client");
  const send = vi.spyOn(inngest, "send").mockResolvedValue({ ids: ["x"] });
  const { generateNarrativeReport } = await import("@/inngest/functions/generate-narrative-report");
  try {
    const out = (await (generateNarrativeReport as unknown as { fn: Handler }).fn({
      event: { id: `evt-gen-${randomUUID()}`, data },
      step: { run: (_name, fn) => fn() },
    })) as { reportId?: string };
    if (!out.reportId) throw new Error(`no report: ${JSON.stringify(out)}`);
    return out.reportId;
  } finally {
    send.mockRestore();
  }
}

/** Renders the stored report for real; its pages' text, and the PDF written out when asked. */
async function render(
  reportId: string,
  name: string,
): Promise<{ pages: string[][]; root: ReactNode }> {
  const { renderReportPdf } = await import("@/inngest/functions/render-report-pdf");
  rendered.elements.length = 0;
  rendered.pdfs.length = 0;
  await (renderReportPdf as unknown as { fn: Handler }).fn({
    event: {
      id: `evt-render-${reportId}`,
      data: { reportId, organizationId: fx.orgId, brandId: fx.brandId },
    },
    step: { run: (_name, fn) => fn() },
  });
  const out = process.env.REPORT_PDF_OUT_DIR;
  if (out && rendered.pdfs[0]) {
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, `${name}.pdf`), rendered.pdfs[0]);
  }
  const root = rendered.elements[0] as ReactNode;
  return { pages: collectPdfPages(root), root };
}

async function storedReport(reportId: string) {
  const [row] = await sql<{ period_label: string; audit_id: string }[]>`
    SELECT period_label, audit_id FROM generated_reports WHERE id = ${reportId}
  `;
  return row;
}

/** The trend page: the one whose eyebrow says "Over time". */
function trendPage(pages: string[][]): string {
  const page = pages.find((p) => p.some((t) => t.endsWith("· Over time")));
  if (!page) throw new Error("no trend page");
  return page.join("\n");
}

/** The trend chart's points, in order: true for a hollow one. */
function trendChartHollow(root: ReactNode): boolean[] {
  const chart = findPdfElements(root, "SVG").find((el) => el.props.viewBox === "0 0 682 190");
  if (!chart) throw new Error("no trend chart");
  return findPdfElements(chart, "CIRCLE").map((c) => c.props.fill === C.white);
}

describe("1. the report's week", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(MONDAY_EVENING);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("Generate report on Monday 2 Nov, 7:13 pm AEDT: Week 44, the week of Sunday's Audit #39 -- not Week 45", async () => {
    const posted = await postGenerate({ periodType: "weekly" });
    expect(posted.status).toBe(202);
    expect(posted.periodLabel).toBe("2026-W44");
    expect(posted.event).toMatchObject({
      brandId: fx.brandId,
      periodLabel: "2026-W44",
      periodType: "weekly",
      manual: true,
    });

    const reportId = await generate(posted.event);
    expect(await storedReport(reportId)).toEqual({
      period_label: "2026-W44",
      audit_id: fx.audits[39],
    });
    const { pages } = await render(reportId, "followup-manual-w44");
    const cover = pages[0].join("\n");
    expect(cover).toContain("Week 44, 2026 (26 Oct – 1 Nov)");
    expect(cover).toContain("Based on Audit #39 · 1 Nov 2026");
    expect(cover).toContain("Generated 2 Nov 2026, 7:13 pm AEDT");
    const text = pages.flat().join("\n");
    expect(text).toContain(
      "The latest complete audit in Week 44, 2026 in which every engine answered.",
    );
    expect(text).not.toContain("Week 45");
    expect(text).not.toContain("No audit finished in");
  }, 180_000);

  it("a week chosen in the request is kept", async () => {
    const posted = await postGenerate({ periodType: "weekly", periodLabel: "2026-W45" });
    expect(posted.periodLabel).toBe("2026-W45");
    expect(posted.event).toMatchObject({ periodLabel: "2026-W45", manual: true });
  });

  it("a scheduled report keeps its week; with no audit in it, it says it uses the latest audit before it -- and #37 is on its chart", async () => {
    await sql`
      INSERT INTO report_delivery_schedules (organization_id, brand_id, frequency, day_of_week, recipient_emails, is_active)
      VALUES (${fx.orgId}, ${fx.brandId}, 'weekly', 1, ${sql.json(["sri@example.com.au"])}, true)
    `;
    const reportId = await generate({
      brandId: fx.brandId,
      organizationId: fx.orgId,
      periodLabel: "2026-W45",
      reportPeriodLabel: "2026-W45",
      periodType: "weekly",
    });
    expect(await storedReport(reportId)).toEqual({
      period_label: "2026-W45",
      audit_id: fx.audits[39],
    });
    const { pages, root } = await render(reportId, "followup-scheduled-w45");
    expect(pages[0].join("\n")).toContain("Week 45, 2026 (2 – 8 Nov)");
    expect(pages.flat().join("\n")).toContain(
      "No audit finished in Week 45, 2026, so this report uses the latest audit before it.",
    );
    // Production's Week 45 PDF: #33-#36, #38, #39 -- #37 left out without a word.
    const trend = trendPage(pages);
    expect(trend).toContain("Audit #37\n31 Oct\n○ 3 of 4 engines");
    expect(trend).toContain(
      "Audit #37 used 3 of 4 engines (Claude: provider spend limit reached), so it's shown but not compared.",
    );
    expect(trendChartHollow(root)).toEqual([false, false, false, false, false, true, false, false]);
  }, 180_000);
});

describe("2. partial audits in the trend", () => {
  async function weekReport() {
    const { serviceDb } = await import("@/db/client");
    const { buildReportData } = await import("@/lib/reports/report-data");
    const data = await buildReportData(serviceDb, {
      organizationId: fx.orgId,
      brandId: fx.brandId,
      periodType: "weekly",
      periodLabel: "2026-W44",
      auditId: fx.audits[39],
      now: MONDAY_EVENING,
    });
    if (!data) throw new Error("no report data");
    return data;
  }

  it("#37 is a point at its measured value, partial, with why -- and never compared", async () => {
    const data = await weekReport();
    const p37 = data.trend.points.find((p) => p.auditNumber === 37);
    expect(p37).toMatchObject({
      value: (5 / 30) * 100,
      enginesAnswered: 3,
      enginesPlanned: 4,
      partial: true,
      comparable: false,
      failedEngines: [{ name: "Claude", reason: SPEND_LIMIT }],
    });
    // The comparison: like-for-like audits only (#32-#36, #38, #39).
    expect(data.trend.comparableCount).toBe(7);
    expect(data.trend.change).toMatchObject({
      fromAuditNumber: 32,
      toAuditNumber: 39,
      severity: "within_noise",
    });
  });

  it("ten audits: the chart keeps the latest 8 and says 2 earlier ones are left out", async () => {
    const data = await weekReport();
    expect(data.trend.points.map((p) => p.auditNumber)).toEqual([32, 33, 34, 35, 36, 37, 38, 39]);
    expect(data.trend.leftOut).toBe(2);
  });

  it("the PDF: a hollow point for #37, its line in the caption, the comparison without it", async () => {
    const { ReportDocument } = await import("@/lib/communication/pdf-builder");
    const data = await weekReport();
    const root = <ReportDocument data={data} />;
    expect(trendChartHollow(root)).toEqual([false, false, false, false, false, true, false, false]);
    const trend = trendPage(collectPdfPages(root));
    expect(trend).toContain("Audit #37\n31 Oct\n○ 3 of 4 engines");
    expect(trend).toContain(
      "Audit #37 used 3 of 4 engines (Claude: provider spend limit reached), so it's shown but not compared. The chart shows the latest 8 audits; 2 earlier audits are left out. From Audit #32 to #39 the change is within the margin of error: their 95% confidence intervals overlap.",
    );
  });
});
