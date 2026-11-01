/**
 * DEMO-BLOCKER (1 Nov), part 4 -- the report PDF implements the approved
 * seven-page prototype, on fixtures shaped like production's Audit #37
 * (Claude failed every question) and #39 (every engine answered):
 * - seven pages in order, a running header and "Page n of N" on pages 2-7,
 *   and Fraunces, Inter and JetBrains Mono embedded (read from the PDF);
 * - no placeholders, no "VisibleAU", no unsupported claims or projections;
 * - each diagnosis rule (a)-(e) fires for its fixture and not otherwise,
 *   with evidence lines that are the data's own numbers;
 * - the matrix's cells are the answers, and its totals the engine bars';
 * - the trend says "not enough" below the minimum and shows the measured
 *   change above it; the template's flags leave pages out; more than 15
 *   questions continue on a second engine page.
 */
import { describe, expect, it } from "vitest";
import { buildReportPdf, ReportDocument } from "@/lib/communication/pdf-builder";
import type { ReportData } from "@/lib/reports/report-data";
import { reportFindings } from "@/lib/reports/report-findings";
import { wilsonCI } from "@/lib/scoring/wilson";
import { collectPdfPages } from "@/tests/helpers/pdf-text";
import { reportDataFixture } from "@/tests/helpers/report-data-fixture";

function pages(data: ReportData): string[][] {
  return collectPdfPages(<ReportDocument data={data} />);
}
function allText(data: ReportData): string {
  return pages(data).flat().join("\n");
}

/** Every number the fixture's data holds -- what any printed count must come from. */
function dataNumbers(data: ReportData): Set<string> {
  const out = new Set<string>();
  const add = (...ns: Array<number | null | undefined>) => {
    for (const n of ns) if (n !== null && n !== undefined) out.add(String(n));
  };
  add(
    data.mentionedCount,
    data.sampleCount,
    data.rankedCount,
    data.sourcedCount,
    data.medianPosition,
  );
  add(data.basis.auditNumber, data.directories.totalAnswers, data.questions.perEngine);
  add(data.coverage.enginesPlanned, data.coverage.enginesAnswered);
  for (const e of data.engines) add(e.mentionedCount, e.sampleCount, e.failedCount);
  const cited = data.directories.rows.filter((r) => r.citedCount > 0);
  for (const r of cited) add(r.citedCount, r.ownerProfileCitedCount);
  const counts = cited.map((r) => r.citedCount).sort((a, b) => b - a);
  add(
    cited.length,
    counts.reduce((s, c) => s + c, 0),
    counts.slice(0, 3).reduce((s, c) => s + c, 0),
  );
  for (const c of data.competitors.rows) add(c.mentions);
  return out;
}

describe("seven pages, as the prototype", () => {
  it("the PDF has seven A4 pages and embeds Fraunces, Inter and JetBrains Mono", async () => {
    const pdf = (await buildReportPdf(reportDataFixture("39"))).toString("latin1");
    expect(pdf.match(/\/Type \/Page\b(?!s)/g)?.length).toBe(7);
    for (const font of [
      "Inter-Regular",
      "Inter-SemiBold",
      "Inter-Bold",
      "Fraunces-Bold",
      "Fraunces-SemiBold",
      "Fraunces-Regular",
      "JetBrainsMono-Regular",
    ]) {
      expect(pdf, font).toMatch(new RegExp(`/BaseFont /[A-Z]{6}\\+${font}\\b`));
    }
    expect(pdf).not.toMatch(/\/BaseFont \/Helvetica/);
  }, 60_000);

  it("in order: cover, summary, engines, where AI looks, diagnosis, over time + next, method", () => {
    const p = pages(reportDataFixture("39"));
    expect(p).toHaveLength(7);
    expect(p[0]).toContain("AI Visibility Report");
    expect(p[0]).toContain("Omega Services");
    expect(p[1]).toContain("01 · Executive summary");
    expect(p[2]).toContain("02 · Engine by engine");
    expect(p[3]).toContain("03 · Where AI looks");
    expect(p[4]).toContain("04 · Diagnosis");
    expect(p[5]).toContain("05 · Over time");
    expect(p[5]).toContain("06 · Recommended next");
    expect(p[6]).toContain("07 · Method and notes");
  });

  it("pages 2-7 carry the running header and footer and 'Page n of 7'; the cover doesn't", () => {
    const p = pages(reportDataFixture("39"));
    expect(p[0].join(" ")).not.toContain("Page 1 of 7");
    expect(p[0]).not.toContain("AI Visibility Report · Omega Services · Week 44, 2026");
    for (let i = 1; i < 7; i++) {
      expect(p[i], `page ${i + 1}`).toContain(
        "AI Visibility Report · Omega Services · Week 44, 2026",
      );
      expect(p[i], `page ${i + 1}`).toContain("Vunnara");
      expect(p[i], `page ${i + 1}`).toContain(
        "Confidential · Prepared for Omega Services by Splice Marketing",
      );
      expect(p[i], `page ${i + 1}`).toContain(`Page ${i + 1} of 7`);
    }
  });
});

describe("valid details, never placeholders", () => {
  it("no braces, undefined, null, N/A, NaN or 'DESIGN PROTOTYPE'; no 'VisibleAU'", () => {
    for (const kind of ["37", "39"] as const) {
      const text = allText(reportDataFixture(kind));
      for (const bad of [
        /[{}]/,
        /undefined/,
        /\bnull\b/,
        /N\/A/,
        /NaN/,
        /DESIGN PROTOTYPE/,
        /\[object/,
        /VisibleAU/,
      ]) {
        expect(text, `${kind}: ${bad}`).not.toMatch(bad);
      }
    }
  });

  it("names the brand, the period, the basis audit and the generation time (AEDT)", () => {
    const text = allText(reportDataFixture("39"));
    expect(text).toContain("Castle Hill, NSW · General trades · Week 44, 2026 (26 Oct – 1 Nov)");
    expect(text).toContain("Based on Audit #39 · 1 Nov 2026");
    expect(text).toContain("Generated 1 Nov 2026, 6:59 pm AEDT · Confidential");
    expect(text).toContain(
      "The latest complete audit in Week 44, 2026 in which every engine answered.",
    );
  });

  it("a brand with no suburb, state or vertical omits them cleanly", () => {
    const data = reportDataFixture("39");
    data.brand.locality = null;
    data.brand.state = null;
    data.brand.vertical = null;
    const p = pages(data);
    expect(p[0]).toContain("Week 44, 2026 (26 Oct – 1 Nov)");
    expect(p[0].join("\n")).not.toMatch(/(^|\n)\s*·|· ·|·\s*(\n|$)/);
    expect(p[6]).not.toContain("Location");
  });

  it("with no agency name: no 'by', no initials tile, and the footer still reads cleanly", () => {
    const data = reportDataFixture("39");
    data.agency.name = null;
    const p = pages(data);
    expect(p[1]).toContain("Confidential · Prepared for Omega Services");
    expect(p.flat().join(" ")).not.toContain(" by Splice");
  });
});

describe("the partial-engine audit (#37)", () => {
  it("says 3 of 4 engines, with the plain reason, next to the headline", () => {
    const p = pages(reportDataFixture("37"));
    expect(p[0]).toContain("3 of 4 engines answered");
    expect(p[1]).toContain(
      "This audit is based on 3 of 4 engines. Claude returned an error for all 13 questions (provider spend limit reached), so its answers aren't counted. Visibility uses the 30 answers from ChatGPT, Gemini and Perplexity.",
    );
    expect(p[2]).toContain(
      "Provider spend limit reached (a monthly limit set in the provider's console)",
    );
  });
});

describe("no unsupported claims, no projections", () => {
  it("no archetype, trend verdict, 'immutable', '0 critical gaps', projected lift, '+N pts' or '/ 100'", () => {
    for (const kind of ["37", "39"] as const) {
      const text = allText(reportDataFixture(kind));
      for (const claim of [
        /recognised authority/i,
        /trending (up|down)/i,
        /immutable/i,
        /0 critical gaps/i,
        /projected/i,
        /\+\s?\d+(\.\d+)?\s?pts/i,
        /\/\s?100\b/,
      ]) {
        expect(text, `${kind}: ${claim}`).not.toMatch(claim);
      }
    }
  });
});

describe("diagnosis rules (a)-(e)", () => {
  const rules = (data: ReportData) => reportFindings(data).map((f) => f.rule);

  it("(a) directories cited twice or more without the owner's profile", () => {
    expect(rules(reportDataFixture("37"))).toContain("a");
    const none = reportDataFixture("37");
    none.directories.rows = [];
    expect(rules(none)).not.toContain("a");
    const cited = reportDataFixture("37");
    cited.directories.rows = cited.directories.rows.map((r) => ({
      ...r,
      ownerProfileLinked: true,
      ownerProfileCitedCount: 1,
    }));
    expect(rules(cited)).not.toContain("a");
  });

  it("(b) an engine with 0 of 10+ while another has mentions", () => {
    expect(rules(reportDataFixture("37"))).toContain("b"); // Gemini 0 of 10
    const allMention = reportDataFixture("39");
    allMention.engines = allMention.engines.map((e) => ({
      ...e,
      mentionedCount: Math.max(1, e.mentionedCount),
    }));
    expect(rules(allMention)).not.toContain("b");
    const noneMention = reportDataFixture("39");
    noneMention.engines = noneMention.engines.map((e) => ({ ...e, mentionedCount: 0 }));
    expect(rules(noneMention)).not.toContain("b");
  });

  it("(c) an engine that failed every question", () => {
    expect(rules(reportDataFixture("37"))).toContain("c");
    expect(rules(reportDataFixture("39"))).not.toContain("c");
  });

  it("(d) the strength: typically #1-#3 and at least half the mentions sourced", () => {
    expect(rules(reportDataFixture("39"))).toContain("d");
    const low = reportDataFixture("39");
    low.medianPosition = 4;
    expect(rules(low)).not.toContain("d");
    const unsourced = reportDataFixture("39");
    unsourced.sourcedCount = 3;
    expect(rules(unsourced)).not.toContain("d");
  });

  it("(e) a competitor named more often on the same answers", () => {
    const ahead = reportDataFixture("39");
    ahead.competitors = { configured: true, rows: [{ name: "Rival Co", mentions: 12 }] };
    expect(rules(ahead)).toContain("e");
    const behind = reportDataFixture("39");
    behind.competitors = { configured: true, rows: [{ name: "Rival Co", mentions: 3 }] };
    expect(rules(behind)).not.toContain("e");
    expect(rules(reportDataFixture("39"))).not.toContain("e");
  });

  it("keeps the first three problems in rule order, then the strength", () => {
    const data = reportDataFixture("37");
    data.competitors = { configured: true, rows: [{ name: "Rival Co", mentions: 12 }] };
    expect(rules(data)).toEqual(["a", "b", "c", "d"]);
  });

  it("every evidence line's numbers, and every action's, are the data's own", () => {
    for (const kind of ["37", "39"] as const) {
      const data = reportDataFixture(kind);
      const numbers = dataNumbers(data);
      for (const f of reportFindings(data)) {
        expect(f.evidence.length, f.title).toBeGreaterThan(0);
        const text = [
          ...f.evidence.map((line) => line.map((p) => p.text).join("")),
          f.recommendation.detail,
        ].join(" ");
        for (const n of text.match(/\d+/g) ?? []) {
          expect(numbers, `${kind} ${f.rule}: ${n} in "${text}"`).toContain(n);
        }
      }
    }
  });

  it("the recommended actions link each to its finding", () => {
    const p = pages(reportDataFixture("37"));
    const findings = reportFindings(reportDataFixture("37"));
    findings.forEach((f, i) => {
      expect(p[4]).toContain(f.title);
      expect(p[5]).toContain(f.recommendation.title);
      expect(p[5]).toContain(`Finding ${i + 1} · ${f.severity.short}`);
    });
  });
});

describe("the question-by-engine matrix", () => {
  it("each cell is one answer, and per-engine totals equal the bars", () => {
    for (const kind of ["37", "39"] as const) {
      const data = reportDataFixture(kind);
      for (const e of data.engines) {
        const cells = data.matrix.map((row) => row.cells[e.engine]);
        expect(cells.filter((c) => c === "mentioned").length).toBe(e.mentionedCount);
        expect(cells.filter((c) => c !== "error").length).toBe(e.sampleCount);
      }
      const p = pages(data);
      // One tick per mention, plus the legend's.
      expect(p[2].filter((t) => t === "✓").length).toBe(data.mentionedCount + 1);
      expect(p[2]).toContain("Q1");
      expect(p[2]).toContain(data.matrix[0].question);
    }
  });

  it("more than 15 questions continue on a second engine page", () => {
    const data = reportDataFixture("39");
    const extra = Array.from({ length: 3 }, (_, i) => ({
      ...data.matrix[0],
      index: 11 + i,
      question: `Extra everyday question ${i + 1}`,
    }));
    data.matrix = [...data.matrix, ...extra, ...extra.map((r, i) => ({ ...r, index: 14 + i }))];
    const p = pages(data);
    expect(p).toHaveLength(8);
    expect(p[2]).toContain("Q15");
    expect(p[2]).not.toContain("Q16");
    expect(p[3]).toContain("Question by question (continued)");
    expect(p[3]).toContain("Q16");
  });
});

describe("over time", () => {
  it("below the minimum: the measured figures and 'not enough comparable audits', no verdict", () => {
    const p = pages(reportDataFixture("39"));
    expect(p[5]).toContain(
      "Hollow points used fewer engines and aren't compared with full audits. Not enough comparable audits for a trend yet (minimum 3); figures are shown as measured, without a trend claim.",
    );
  });

  it("with enough comparable audits: the measured change, judged by the drift rule", () => {
    const data = reportDataFixture("39");
    data.trend.points = [
      ...data.trend.points,
      {
        ...data.trend.points[2],
        auditId: "a40",
        auditNumber: 40,
        completedAt: "2026-11-01T09:00:00.000Z",
        value: 25,
        ci: wilsonCI(10, 40),
        mentionedCount: 10,
        isBasis: false,
      },
    ];
    data.trend.comparableCount = 3;
    data.trend.change = { fromAuditNumber: 38, toAuditNumber: 40, severity: "within_noise" };
    const text = pages(data)[5].join("\n");
    expect(text).not.toContain("Not enough comparable audits");
    expect(text).toContain(
      "From Audit #38 to #40 the change is within the margin of error: their 95% confidence intervals overlap.",
    );
  });
});

describe("the report template's optional sections", () => {
  it("leaving out the diagnosis drops its page and the 'Finding n' links", () => {
    const data = reportDataFixture("37");
    data.sections.diagnosis = false;
    const p = pages(data);
    expect(p).toHaveLength(6);
    const text = p.flat().join("\n");
    expect(text).not.toContain("Diagnosis");
    expect(text).not.toMatch(/Finding \d/);
    expect(text).toContain("04 · Over time");
  });
});
