/**
 * DEMO-BLOCKER (1 Nov), part 2 -- production's W44 report PDF for Omega
 * Services printed "Mention rate: 60.0%, citation rate: 40.0%",
 * "recognised authority", "trending up", "20 source types analysed, 0
 * critical gaps" and "immutable evidence snapshots" under a "VisibleAU"
 * header, with no brand, period or audit -- while the audit pages said 17%,
 * 23% and 18% (diag-0111). Seeded like production (#37 with Claude failed,
 * #38, #39, the W44 trend row and the stored report), this runs the real
 * render-report-pdf function and reads the PDF it draws:
 * - the brand, the period, the basis audit (#39: the latest audit in the
 *   week in which every engine answered) and the generation time in AEDT;
 * - every percentage and every "k of n" is the audit page's own
 *   (resolveAuditDimensionsAndHeadline, getDirectoryCitationsForAudit);
 * - none of the unsupported claims, and no "VisibleAU";
 * - and generate-narrative-report records the basis audit on the report.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import type { ReactNode } from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { collectPdfPages } from "@/tests/helpers/pdf-text";
import {
  AUDIT_37,
  AUDIT_38,
  AUDIT_39,
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

let sql: ReturnType<typeof postgres>;
let fx: ReportFixture;
const REPORT_W44 = randomUUID();
const REPORT_ON_37 = randomUUID();

type Handler = (ctx: {
  event: { id: string; data: Record<string, unknown> };
  step: { run: (name: string, fn: () => unknown) => unknown };
}) => Promise<unknown>;

interface Rendered {
  /** Everything the PDF draws, charts included. */
  text: string;
  /** Without the charts' labels (axis ticks like "40%" aren't measured figures). */
  plain: string;
}

async function renderReport(reportId: string): Promise<Rendered> {
  const { renderReportPdf } = await import("@/inngest/functions/render-report-pdf");
  rendered.elements.length = 0;
  await (renderReportPdf as unknown as { fn: Handler }).fn({
    event: {
      id: `evt-${reportId}`,
      data: { reportId, organizationId: fx.orgId, brandId: fx.brandId },
    },
    step: { run: (_name, fn) => fn() },
  });
  expect(rendered.elements).toHaveLength(1);
  const root = rendered.elements[0] as ReactNode;
  return {
    text: collectPdfPages(root).flat().join("\n"),
    plain: collectPdfPages(root, { skipSvg: true }).flat().join("\n"),
  };
}

let w44: Rendered = { text: "", plain: "" };

beforeAll(async () => {
  sql = postgres(getTestDatabaseUrl(), { max: 1 });
  fx = await seedReportFixture(sql, { audits: [AUDIT_37, AUDIT_38, AUDIT_39] });
  // Production's W44 trend row and stored report (diag-0111 query 1 / 2).
  await sql`
    INSERT INTO visibility_trends (brand_id, organization_id, period_label, period_type, score_composite_avg,
                                   audit_count, sample_quality, mention_rate, citation_rate,
                                   mention_source_ratio, brand_archetype)
    VALUES (${fx.brandId}, ${fx.orgId}, '2026-W44', 'weekly', 20.25, 2, 'Hypothesis', 60, 40, 0.6667,
            'recognised_authority')
  `;
  const storedSummary = {
    mentionRate: 60,
    citationRate: 40,
    ratio: 0.6667,
    archetype: "recognised_authority",
  };
  const storedNarrative =
    "Early signal: visibility trending up, not yet enough data to quantify.\n\nBrand archetype: recognised authority. Mention rate: 60.0%, citation rate: 40.0%.";
  for (const [id, auditId] of [
    [REPORT_W44, null],
    [REPORT_ON_37, fx.audits[37]],
  ] as const) {
    await sql`
      INSERT INTO generated_reports (id, brand_id, organization_id, audit_id, report_type, period_label,
                                     headline, narrative_text, mention_source_summary)
      VALUES (${id}, ${fx.brandId}, ${fx.orgId}, ${auditId}, 'weekly', '2026-W44', 'AI Visibility Report',
              ${storedNarrative}, ${sql.json(storedSummary)})
    `;
  }
  await sql`
    INSERT INTO evidence_snapshots (brand_id, organization_id, audit_id, engine, prompt, raw_response)
    VALUES (${fx.brandId}, ${fx.orgId}, ${fx.audits[39]}, 'chatgpt', 'q', 'a')
  `;
  w44 = await renderReport(REPORT_W44);
}, 180_000);

afterAll(async () => {
  await fx?.cleanup();
  await sql?.end();
});

const ENGINE_NAMES: Record<string, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  perplexity: "Perplexity",
};

describe("the W44 report PDF says what the audit pages say", () => {
  it("names the brand, the period, the audit it's based on and why, and when it was generated (AEDT)", () => {
    expect(w44.text).toContain("Omega Services");
    expect(w44.text).toContain("Week 44, 2026 (26 Oct – 1 Nov)");
    expect(w44.text).toContain("Based on Audit #39 · 1 Nov 2026");
    expect(w44.text).toContain(
      "The latest complete audit in Week 44, 2026 in which every engine answered.",
    );
    expect(w44.text).toMatch(/Generated \d{1,2} \w{3} 20\d\d, \d{1,2}:\d\d (am|pm) AE[DS]T/);
  });

  it("shows #39's headline, CI, engine coverage and per-engine counts from the audit page's resolver", async () => {
    const { serviceDb } = await import("@/db/client");
    const { resolveAuditDimensionsAndHeadline } = await import(
      "@/lib/scoring/resolve-audit-dimensions"
    );
    const r = await resolveAuditDimensionsAndHeadline(serviceDb, fx.audits[39]);
    if (r.headline.status !== "scored") throw new Error("expected a scored headline");
    const pct = `${r.headline.value.toFixed(0)}%`;
    const ci = `${r.headline.ci.lower.toFixed(0)}–${r.headline.ci.upper.toFixed(0)}%`;
    expect([pct, r.mentionedCount, r.sampleCount, ci]).toEqual(["18%", 7, 40, "9–32%"]);
    expect(w44.text).toContain(pct);
    expect(w44.text).toContain(
      `Visibility. Mentioned in ${r.mentionedCount} of ${r.sampleCount} answers to everyday customer questions across ChatGPT, Claude, Gemini and Perplexity.`,
    );
    expect(w44.text).toContain(`95% CI ${ci}`);
    expect(w44.text).toContain("4 of 4 engines answered");
    expect(r.perEngine.map((e) => `${e.engine} ${e.mentionedCount}/${e.sampleCount}`)).toEqual([
      "chatgpt 4/10",
      "claude 0/10",
      "gemini 0/10",
      "perplexity 3/10",
    ]);
    // Each engine's row: name, rate, "k of n".
    for (const e of r.perEngine) {
      const rate = `${Math.round((e.mentionedCount / e.sampleCount) * 100)}%`;
      expect(w44.text).toContain(
        `${ENGINE_NAMES[e.engine]}\n${rate}\n${e.mentionedCount} of ${e.sampleCount}`,
      );
    }
    expect(w44.text).toContain("7 of 7 mentions were in a ranked list");
    expect(w44.text).toContain("7 of 7");
    expect(w44.text).toContain("mentions linked a source");
  });

  it("every percentage and every 'k of n' in it is one the resolvers produce", async () => {
    const { serviceDb } = await import("@/db/client");
    const { resolveAuditDimensionsAndHeadline } = await import(
      "@/lib/scoring/resolve-audit-dimensions"
    );
    const { getDirectoryCitationsForAudit } = await import("@/lib/directories/citation-counts");
    const percents = new Set<string>();
    const kOfN = new Set<string>(["4 of 4", "3 of 4"]); // engine coverage of #37-#39
    for (const n of [37, 38, 39]) {
      const r = await resolveAuditDimensionsAndHeadline(serviceDb, fx.audits[n]);
      if (r.headline.status === "scored") {
        percents.add(`${r.headline.value.toFixed(0)}%`);
        percents.add(`${r.headline.ci.upper.toFixed(0)}%`);
      }
    }
    const basis = await resolveAuditDimensionsAndHeadline(serviceDb, fx.audits[39]);
    kOfN.add(`${basis.mentionedCount} of ${basis.sampleCount}`);
    kOfN.add(`${basis.rankedCount} of ${basis.mentionedCount}`);
    kOfN.add(`${basis.sourcedCount} of ${basis.mentionedCount}`);
    for (const e of basis.perEngine) {
      kOfN.add(`${e.mentionedCount} of ${e.sampleCount}`);
      percents.add(`${Math.round((e.mentionedCount / e.sampleCount) * 100)}%`);
    }
    const dirs = await getDirectoryCitationsForAudit(serviceDb, fx.audits[39], {
      id: fx.brandId,
      region: "au",
      categories: ["trades_general"],
    });
    const cited = dirs.results.filter((d) => d.citedCount > 0).map((d) => d.citedCount);
    const total = cited.reduce((sum, c) => sum + c, 0);
    const top3 = [...cited]
      .sort((a, b) => b - a)
      .slice(0, 3)
      .reduce((sum, c) => sum + c, 0);
    for (const c of cited) kOfN.add(`${c} of ${dirs.totalAnswers}`);
    kOfN.add(`${top3} of ${total}`);

    // Not measured figures: the interval's name, the colour bands' labels
    // and page numbers. (Chart labels are excluded: `plain`.)
    const shown = w44.plain
      .replace(/95% (CI|confidence)/g, "")
      .replace(/Low <\d+%|Developing \d+–\d+%|Strong ≥\d+%/g, "")
      .replace(/Page \d+ of \d+/g, "");
    const shownPercents = shown.match(/\d+(\.\d+)?%/g) ?? [];
    expect(shownPercents.length).toBeGreaterThan(0);
    for (const p of shownPercents) expect(percents, p).toContain(p);
    const shownKOfN = shown.match(/\d+ of \d+/g) ?? [];
    expect(shownKOfN.length).toBeGreaterThan(0);
    for (const k of shownKOfN) expect(kOfN, k).toContain(k);
  });

  it("has none of the unsupported claims, and never says VisibleAU", () => {
    for (const claim of [
      /VisibleAU/,
      /recognised authority/i,
      /trending (up|down)/i,
      /immutable/i,
      /compliance/i,
      /critical gap/i,
      /source types analysed/i,
      /Mention-to-citation/i,
      /Professional Report/,
      /60\.0%|40\.0%/,
      /maintain and defend/i,
    ]) {
      expect(w44.text).not.toMatch(claim);
    }
  });

  it("shows the trend as measured, marks #37 as not comparable, and makes no trend claim below the minimum", () => {
    // The chart's point labels, and each audit's label under it.
    for (const label of ["17%", "23%", "18%"]) expect(w44.text).toContain(label);
    expect(w44.text).toContain("Audit #37 · 31 Oct\n○ 3 of 4 engines");
    expect(w44.text).toContain("Audit #38 · 1 Nov\n4 of 4 engines");
    expect(w44.text).toContain("Audit #39 · 1 Nov\n4 of 4 engines");
    expect(w44.text).toContain(
      "Hollow points used fewer engines and aren't compared with full audits. Not enough comparable audits for a trend yet (minimum 3); figures are shown as measured, without a trend claim.",
    );
  });

  it("a report based on #37 says 3 of 4 engines and why, next to its own headline", async () => {
    const { text } = await renderReport(REPORT_ON_37);
    expect(text).toContain("Based on Audit #37 · 31 Oct 2026");
    // #38 and #39 finished later in the week with every engine: the report
    // doesn't claim #37 is the latest, or that no audit had every engine.
    expect(text).toContain(
      "The audit this report was made from. Later audits in Week 44, 2026 appear only in the trend.",
    );
    expect(text).not.toContain("No audit in this period had every engine answer.");
    expect(text).toContain(
      "Visibility. Mentioned in 5 of 30 answers to everyday customer questions across ChatGPT, Gemini and Perplexity.",
    );
    expect(text).toContain("95% CI 7–34%");
    expect(text).toContain("3 of 4 engines answered");
    expect(text).toContain(
      "This audit is based on 3 of 4 engines. Claude returned an error for all 13 questions (provider spend limit reached), so its answers aren't counted. Visibility uses the 30 answers from ChatGPT, Gemini and Perplexity.",
    );
    expect(text).toContain("Claude\nNot counted\n13 errors");
    expect(text).toContain(
      "3 of 4 engines · Claude: Provider spend limit reached (a monthly limit set in the provider's console)",
    );
  });
});

describe("generate-narrative-report records the audit a report is based on", () => {
  it("bases a W44 report on #39 and stores it on generated_reports.audit_id", async () => {
    const { inngest } = await import("@/lib/inngest/client");
    const send = vi.spyOn(inngest, "send").mockResolvedValue({ ids: ["x"] });
    const { generateNarrativeReport } = await import(
      "@/inngest/functions/generate-narrative-report"
    );
    const result = (await (generateNarrativeReport as unknown as { fn: Handler }).fn({
      event: {
        id: "evt-generate",
        data: {
          brandId: fx.brandId,
          organizationId: fx.orgId,
          periodLabel: "2026-W44",
          periodType: "weekly",
          manual: true,
        },
      },
      step: { run: (_name, fn) => fn() },
    })) as { reportId: string };
    const [row] = await sql<{ audit_id: string | null }[]>`
      SELECT audit_id FROM generated_reports WHERE id = ${result.reportId}
    `;
    expect(row.audit_id).toBe(fx.audits[39]);
    send.mockRestore();
  });
});
