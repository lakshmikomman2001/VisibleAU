/**
 * DEMO-BLOCKER (1 Nov), part 3 -- the report's "picture, in plain English"
 * is built from the measured figures, and only those:
 * - for reports based on #37 (Claude failed) and #39, every number in the
 *   paragraphs is one the audit page's resolvers produce (counted
 *   independently here, not from the narrative's own fact list);
 * - generate-narrative-report stores that grounded narrative and headline,
 *   not the weekly trend row's "Brand archetype: recognised authority.
 *   Mention rate: 60.0%" or "Early signal: trending up" (diag-0111).
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  AUDIT_37,
  AUDIT_38,
  AUDIT_39,
  type ReportFixture,
  seedReportFixture,
} from "@/tests/helpers/report-fixture";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

// No LLM writes the report: generation must never select a model or call one.
const llm = vi.hoisted(() => ({
  selectModel: vi.fn(),
  generateText: vi.fn(),
  streamText: vi.fn(),
}));
vi.mock("@/lib/llm/model-selector", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm/model-selector")>();
  llm.selectModel.mockImplementation(actual.selectModel);
  return { ...actual, selectModel: llm.selectModel };
});
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  llm.generateText.mockRejectedValue(new Error("no LLM call in report generation"));
  llm.streamText.mockImplementation(() => {
    throw new Error("no LLM call in report generation");
  });
  return { ...actual, generateText: llm.generateText, streamText: llm.streamText };
});

let sql: ReturnType<typeof postgres>;
let fx: ReportFixture;

type Handler = (ctx: {
  event: { id: string; data: Record<string, unknown> };
  step: { run: (name: string, fn: () => unknown) => unknown };
}) => Promise<unknown>;

beforeAll(async () => {
  sql = postgres(getTestDatabaseUrl(), { max: 1 });
  fx = await seedReportFixture(sql, { audits: [AUDIT_37, AUDIT_38, AUDIT_39] });
  await sql`
    INSERT INTO visibility_trends (brand_id, organization_id, period_label, period_type, score_composite_avg,
                                   audit_count, sample_quality, mention_rate, citation_rate,
                                   mention_source_ratio, brand_archetype)
    VALUES (${fx.brandId}, ${fx.orgId}, '2026-W40', 'weekly', 15, 1, 'Hypothesis', 50, 30, 0.6,
            'recognised_authority'),
           (${fx.brandId}, ${fx.orgId}, '2026-W44', 'weekly', 20.25, 2, 'Hypothesis', 60, 40, 0.6667,
            'recognised_authority')
  `;
}, 180_000);

afterAll(async () => {
  await fx?.cleanup();
  await sql?.end();
});

/** Every number the resolvers give for one audit: counts, per-engine counts, directory counts. */
async function measuredNumbers(auditId: string): Promise<Set<string>> {
  const { serviceDb } = await import("@/db/client");
  const { resolveAuditDimensionsAndHeadline } = await import(
    "@/lib/scoring/resolve-audit-dimensions"
  );
  const { getDirectoryCitationsForAudit } = await import("@/lib/directories/citation-counts");
  const r = await resolveAuditDimensionsAndHeadline(serviceDb, auditId);
  const out = new Set<string>();
  const add = (...ns: number[]) => {
    for (const n of ns) out.add(String(n));
  };
  add(r.mentionedCount, r.sampleCount, r.rankedCount, r.sourcedCount);
  // "about 1 in N": N is the sample over the mentions, rounded.
  add(1, Math.round(r.sampleCount / r.mentionedCount));
  for (const e of r.perEngine) add(e.mentionedCount, e.sampleCount);
  const dirs = await getDirectoryCitationsForAudit(serviceDb, auditId, {
    id: fx.brandId,
    region: "au",
    categories: ["trades_general"],
  });
  const cited = dirs.results.filter((d) => d.citedCount > 0);
  add(
    cited.length,
    cited.reduce((s, d) => s + d.citedCount, 0),
  );
  return out;
}

const WORDS: Record<string, string> = {
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
};

function numbersIn(text: string): string[] {
  const digits = text.match(/\d+/g) ?? [];
  const words = (text.toLowerCase().match(/\b[a-z]+\b/g) ?? []).flatMap((w) =>
    WORDS[w] ? [WORDS[w]] : [],
  );
  return [...digits, ...words];
}

describe("the plain-English paragraphs state only measured numbers", () => {
  for (const n of [37, 39]) {
    it(`a report based on #${n}: every number is the resolvers'`, async () => {
      const { serviceDb } = await import("@/db/client");
      const { buildReportData } = await import("@/lib/reports/report-data");
      const { reportNarrative } = await import("@/lib/reports/report-narrative");
      const data = await buildReportData(serviceDb, {
        organizationId: fx.orgId,
        brandId: fx.brandId,
        periodType: "weekly",
        periodLabel: "2026-W44",
        auditId: fx.audits[n],
      });
      if (!data) throw new Error("no report data");
      const narrative = reportNarrative(data);
      expect(narrative.dropped).toBe(0);
      expect(narrative.paragraphs.length).toBe(3);
      const measured = await measuredNumbers(fx.audits[n]);
      for (const token of numbersIn([narrative.headline, ...narrative.paragraphs].join(" "))) {
        expect(measured, `${token} in #${n}'s narrative`).toContain(token);
      }
    });
  }

  it("reads like the approved prototype for #37", async () => {
    const { serviceDb } = await import("@/db/client");
    const { buildReportData } = await import("@/lib/reports/report-data");
    const { reportNarrative } = await import("@/lib/reports/report-narrative");
    const data = await buildReportData(serviceDb, {
      organizationId: fx.orgId,
      brandId: fx.brandId,
      periodType: "weekly",
      periodLabel: "2026-W44",
      auditId: fx.audits[37],
    });
    if (!data) throw new Error("no report data");
    const narrative = reportNarrative(data, { diagnosisSection: "04" });
    expect(narrative.headline).toBe("AI mentions Omega Services in about 1 in 6 everyday answers");
    expect(narrative.paragraphs).toEqual([
      "When local customers ask AI for help with the kind of work Omega Services does, Omega Services comes up in about 1 in 6 answers: 5 of the 30 we counted. When it does appear, it's typically listed first, and every mention linked a source.",
      "The engines don't agree. Perplexity mentioned Omega Services in 3 of 10 answers and ChatGPT in 2 of 10, while Gemini didn't mention it at all. Claude couldn't be measured this time.",
      "AI leans heavily on directories, citing seven of them 36 times, but none of those citations linked Omega Services' own listings. That is the clearest, most fixable gap in this report (see section 04).",
    ]);
  });
});

describe("generate-narrative-report stores the grounded narrative", () => {
  it("not the weekly trend row's archetype, 60% / 40% or 'trending up'", async () => {
    const { inngest } = await import("@/lib/inngest/client");
    const send = vi.spyOn(inngest, "send").mockResolvedValue({ ids: ["x"] });
    const { generateNarrativeReport } = await import(
      "@/inngest/functions/generate-narrative-report"
    );
    const result = (await (generateNarrativeReport as unknown as { fn: Handler }).fn({
      event: {
        id: "evt-narrative",
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
    send.mockRestore();
    const [row] = await sql<
      { headline: string; narrative_text: string; mention_source_summary: unknown }[]
    >`
      SELECT headline, narrative_text, mention_source_summary FROM generated_reports WHERE id = ${result.reportId}
    `;
    expect(row.headline).toBe("AI mentions Omega Services in about 1 in 6 everyday answers");
    expect(row.narrative_text).toContain("7 of the 40 we counted");
    for (const claim of [/archetype/i, /recognised authority/i, /trending/i, /60\.0%/, /40\.0%/]) {
      expect(row.narrative_text).not.toMatch(claim);
    }
    expect(row.mention_source_summary).toBeNull();
  });

  it("selects no model and calls no LLM", () => {
    // The previous generator picked a model (selectModel) and threw it away.
    expect(llm.selectModel).not.toHaveBeenCalled();
    expect(llm.generateText).not.toHaveBeenCalled();
    expect(llm.streamText).not.toHaveBeenCalled();
  });
});
