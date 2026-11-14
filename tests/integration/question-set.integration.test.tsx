/**
 * 15 Nov, part 2 (Sri's review of audit #50, Hero Home Services): the PDF's "Over time" joined #48 (25%, 11
 * everyday questions, generator v3, including the off-topic "What Australian tech companies…" question 0bd1221
 * removed) and #50 (33%, 10 everyday questions, generator v4) with one line -- a rise that is really a change of
 * questions. Both had the same prompt_pack_version: it's stamped when the audit row is created, before
 * lib/audit/get-audit-prompts.ts regenerates a stale pack. Each audit now stores the hash of the everyday questions
 * it asked (migration 0150, lib/audit/question-set-sql.ts), and audits with different questions are never
 * compared.
 *
 * Real DB, Hero's shape: #47 and #48 asked the v3 questions (11), #50 the v4 ones (10), all under pack version 1.
 * Same set -> compared; changed set -> not compared, with the note, on the PDF, the compare page, the brand page's
 * history chart, "vs previous audit" in the export and the PDF builder, and the weekly trend.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { collectPdfText } from "@/tests/helpers/pdf-text";
import {
  EVERYDAY_QUESTIONS,
  type ReportFixture,
  seedReportFixture,
} from "@/tests/helpers/report-fixture";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const { session, pdfInputs } = vi.hoisted(() => ({
  session: { organizationId: "" },
  pdfInputs: [] as unknown[],
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: vi.fn(async () => ({
    id: "00000000-0000-4000-8000-00000000f150",
    organizationId: session.organizationId,
    role: "owner",
    organization: { id: session.organizationId, name: "Hero Org", region: "au", metadata: {} },
  })),
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("notFound");
  }),
  usePathname: () => "/brands",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
// The export route's PDF: what it hands the renderer (the prior audit's figure and the note).
vi.mock("@/lib/pdf/render", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/pdf/render")>();
  return {
    ...actual,
    renderAuditPdf: vi.fn(async (...args: Parameters<typeof actual.renderAuditPdf>) => {
      pdfInputs.push(args[0]);
      return Buffer.from("%PDF-1.4 test");
    }),
  };
});

const OFF_TOPIC = "What Australian tech companies are leading in their space in 2025?";
const V3 = [...EVERYDAY_QUESTIONS, OFF_TOPIC];
const V4 = [...EVERYDAY_QUESTIONS];
const NOTE =
  "Questions changed between #48 and #50 (one question removed), so these aren't compared.";

let client: ReturnType<typeof postgres>;
let fx: ReportFixture;

const sha256 = (questions: readonly string[]) =>
  createHash("sha256")
    .update([...new Set(questions)].sort().join("\n"), "utf8")
    .digest("hex");

async function hashes(): Promise<Record<number, string | null>> {
  const rows = await client<{ audit_number: number; question_set_hash: string | null }[]>`
    SELECT audit_number, question_set_hash FROM audits WHERE brand_id = ${fx.brandId}
  `;
  return Object.fromEntries(rows.map((r) => [r.audit_number, r.question_set_hash]));
}

/** What both audit runners do when they mark an audit complete (lib/audit/question-set-sql.ts). */
async function recordQuestionSets(): Promise<void> {
  const { serviceDb } = await import("@/db/client");
  const { audits } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const { questionSetHashSql } = await import("@/lib/audit/question-set-sql");
  for (const id of Object.values(fx.audits)) {
    await serviceDb
      .update(audits)
      .set({ questionSetHash: questionSetHashSql(id) })
      .where(eq(audits.id, id));
  }
}

beforeAll(async () => {
  const url = getTestDatabaseUrl();
  process.env.DATABASE_URL = url;
  process.env.SERVICE_DATABASE_URL = url;
  client = postgres(url, { max: 1 });
  fx = await seedReportFixture(client, {
    brandName: "Hero Home Services",
    tier: "agency",
    audits: [
      {
        number: 47,
        completedAt: "2026-11-10T00:00:00.000Z",
        everydayQuestions: V3,
        mentions: { chatgpt: [1, 2, 3], claude: [1, 2], gemini: [1], perplexity: [1, 2] },
      },
      {
        number: 48,
        completedAt: "2026-11-11T00:00:00.000Z",
        everydayQuestions: V3,
        mentions: { chatgpt: [1, 2, 3, 4], claude: [1, 2, 3], gemini: [1, 2], perplexity: [1, 2] },
      },
      {
        number: 50,
        completedAt: "2026-11-13T00:00:00.000Z",
        everydayQuestions: V4,
        mentions: {
          chatgpt: [1, 2, 3, 4],
          claude: [1, 2, 3, 4],
          gemini: [1, 2, 3],
          perplexity: [1, 2],
        },
      },
    ],
  });
  session.organizationId = fx.orgId;
  await recordQuestionSets();
}, 120_000);

afterAll(async () => {
  await client`DELETE FROM audit_exports WHERE audit_id = ANY(${Object.values(fx.audits)})`;
  await fx.cleanup();
  await client.end();
});

async function report(basisNumber: number) {
  const { serviceDb } = await import("@/db/client");
  const { buildReportData } = await import("@/lib/reports/report-data");
  const data = await buildReportData(serviceDb, {
    organizationId: fx.orgId,
    brandId: fx.brandId,
    periodType: "weekly",
    periodLabel: "2026-W46",
    auditId: fx.audits[basisNumber],
    now: new Date("2026-11-14T00:00:00.000Z"),
  });
  if (!data) throw new Error("no report data");
  return data;
}

describe("the stored question set", () => {
  it("the SHA-256 of the sorted everyday questions: #47 and #48 share one, #50 has another", async () => {
    const h = await hashes();
    expect(h[47]).toBe(sha256(V3));
    expect(h[48]).toBe(sha256(V3));
    expect(h[50]).toBe(sha256(V4));
    expect(h[48]).not.toBe(h[50]);
  });

  it("migration 0150's backfill writes exactly what the runners write", async () => {
    const written = await hashes();
    await client`UPDATE audits SET question_set_hash = NULL WHERE brand_id = ${fx.brandId}`;
    const migration = readFileSync(
      join(process.cwd(), "db/migrations/0150_audits_question_set_hash.sql"),
      "utf8",
    );
    const update = migration.slice(migration.indexOf("UPDATE audits a"));
    const scoped = update.replace(
      "WHERE a.status = 'complete' AND a.question_set_hash IS NULL;",
      "WHERE a.status = 'complete' AND a.question_set_hash IS NULL AND a.brand_id = $1;",
    );
    expect(scoped).not.toBe(update);
    await client.unsafe(scoped, [fx.brandId]);
    expect(await hashes()).toEqual(written);
  });
});

describe("the report PDF's Over time", () => {
  it("changed questions: #48 and #50 aren't joined or compared, and the caption says why", async () => {
    const data = await report(50);
    const points = data.trend.points;
    expect(points.map((p) => p.auditNumber)).toEqual([47, 48, 50]);
    expect(points.map((p) => p.otherQuestions)).toEqual([true, true, false]);
    expect(points.map((p) => p.questionsChange)).toEqual([null, null, NOTE]);
    expect(points.filter((p) => p.comparable).map((p) => p.auditNumber)).toEqual([50]);
    expect(data.trend.change).toBeNull();

    const { ReportDocument, trendSegments } = await import("@/lib/reports/pdf/report-document");
    const plotted = points.map((p, i) => ({ p, i })).filter(({ p }) => p.value !== null);
    // 15 Nov (rebrand), part 2: no line at all -- #47 (other questions) and #48 (other questions) aren't compared,
    // so neither is joined to anything, each other included (this run expected [47, 48] joined: Sri's bug).
    expect(trendSegments(plotted).map((s) => s.map(({ p }) => p.auditNumber))).toEqual([
      [47],
      [48],
      [50],
    ]);
    const pdf = collectPdfText(<ReportDocument data={data} />).join("\n");
    expect(pdf).toContain(NOTE);
    const { trendLines } = await import("@/lib/reports/report-format");
    expect(trendLines(data)).toContain(NOTE);
  }, 60_000);

  it("the same questions: #47 and #48 are compared", async () => {
    const data = await report(48);
    const byNumber = new Map(data.trend.points.map((p) => [p.auditNumber, p]));
    expect(byNumber.get(47)?.comparable).toBe(true);
    expect(byNumber.get(47)?.otherQuestions).toBe(false);
    expect(byNumber.get(48)?.questionsChange).toBeNull();
    // #50 is in the week too: asked other questions than #48, so apart.
    expect(byNumber.get(50)?.otherQuestions).toBe(true);
    expect(byNumber.get(50)?.questionsChange).toBe(NOTE);
  }, 60_000);
});

describe("the compare page", () => {
  async function comparePage(a: number, b: number): Promise<string> {
    const { default: Page } = await import("@/app/(auth)/audits/compare/page");
    const element = await Page({
      searchParams: Promise.resolve({ ids: `${fx.audits[a]},${fx.audits[b]}` }),
    });
    return renderToStaticMarkup(element as ReactElement).replace(/&#x27;/g, "'");
  }

  it("#48 and #50: the note, and no change figure", async () => {
    const html = await comparePage(48, 50);
    expect(html).toContain(NOTE);
    expect(html).not.toMatch(/pts/);
  }, 60_000);

  it("#47 and #48: compared, no note", async () => {
    const html = await comparePage(47, 48);
    expect(html).not.toContain("Questions changed");
    expect(html).toMatch(/[+-]?\d+ pts/);
  }, 60_000);
});

describe("vs previous audit", () => {
  it("the PDF builder's latest-audit API: no prior figure for #50, and the note", async () => {
    const { GET } = await import("@/app/api/brands/[brandId]/latest-audit/route");
    const res = await GET(new Request("http://localhost/api"), {
      params: Promise.resolve({ brandId: fx.brandId }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      audit: { auditNumber: number };
      priorAudit: { scoreComposite: string | null; questionsChanged: string | null };
    };
    expect(body.audit.auditNumber).toBe(50);
    expect(body.priorAudit.scoreComposite).toBeNull();
    expect(body.priorAudit.questionsChanged).toBe(NOTE);
  }, 60_000);

  it("the export's PDF: #50 isn't compared with #48, and its summary says so; #48 is compared with #47", async () => {
    const { GET } = await import("@/app/api/audits/[auditId]/export/route");
    const { buildExecSummary } = await import("@/lib/pdf/render");
    type Input = Parameters<typeof buildExecSummary>[0];
    for (const n of [50, 48]) {
      const res = await GET(new Request(`http://localhost/api?format=pdf`), {
        params: Promise.resolve({ auditId: fx.audits[n] }),
      });
      expect(res.status).toBe(200);
    }
    const [for50, for48] = pdfInputs.slice(-2) as Input[];
    expect(for50.priorComposite).toBeNull();
    expect(for50.priorQuestionsChanged).toBe(NOTE);
    expect(buildExecSummary(for50)).toContain(NOTE);
    expect(for48.priorComposite).not.toBeNull();
    expect(for48.priorQuestionsChanged ?? null).toBeNull();
    expect(buildExecSummary(for48)).toMatch(/(up|down|unchanged).* from /);
  }, 60_000);
});

describe("the brand page's audit history", () => {
  it("marks #50 and says what changed", async () => {
    const { default: Page } = await import("@/app/(auth)/brands/[brandId]/page");
    const element = await Page({ params: Promise.resolve({ brandId: fx.brandId }) } as never);
    const html = renderToStaticMarkup(element as ReactElement).replace(/&#x27;/g, "'");
    expect(html).toContain(NOTE);
    // One marker: between #48 and #50, never between #47 and #48.
    expect(html.match(/title="Questions changed between/g)?.length).toBe(1);
  }, 60_000);
});

describe("the weekly visibility trend", () => {
  it("a week's figures come from one question set: the newest audit's", async () => {
    const { serviceDb } = await import("@/db/client");
    const { periodComparableAudits } = await import("@/lib/visibility/visibility-trend-aggregator");
    const group = await periodComparableAudits(
      serviceDb,
      fx.brandId,
      new Date("2026-11-09T00:00:00.000Z"),
      new Date("2026-11-15T23:59:59.000Z"),
    );
    expect(group.auditIds).toEqual([fx.audits[50]]);
  }, 60_000);
});
