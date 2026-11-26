/**
 * S02 part 0 (LLD amendments 51, 57): the report PDF's design, Google section and cover-name checks, moved from
 * hand-composed report data (tests/unit/reports/report-pdf-design.test.tsx, pdf-google-section.test.tsx and
 * report-cover-tier.test.tsx, retired; S03 part 0 moved the fixture's other users to the seeds and deleted it, LLD
 * amendment 77) onto invented businesses seeded as real audits (tests/helpers/report-seeds.ts) and rendered by the real
 * path (the generator, then loadReportRenderData -> buildReportPdf). Every check those three files made is here, on the
 * seeds:
 * - Bluegum (every engine answered, like the old #39 fixture) and Ironstone (Claude failed every question, like #37);
 * - "plain": Bluegum with no suburb, city, state, business type or agency name (and, for the cover, on Growth);
 * - "long": Bluegum with 13 everyday questions (16 rows, so the matrix continues) and 11 weekly audits (a trend with
 *   earlier audits left out, and enough comparable audits for a measured change);
 * - Waratah's Google variants: one where AI Mode gave no answer for a question, one where Google answered nothing.
 * Rule boundaries (a)-(e) change one field of a seeded report's own data and re-run the rules, as before; every PDF
 * checked here is a rendered seed. The Google section's text is compared with
 * tests/integration/__golden__/pdf-google-section-seeded.txt (UPDATE_GOLDEN=1 writes it; say why in the commit).
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  GOOGLE_CUSTOMER_OWN_REASONS,
  GOOGLE_STORED_REASON,
} from "@/lib/audit/google-surfaces/reasons";
import type { ReportData } from "@/lib/reports/report-data";
import { reportFindings } from "@/lib/reports/report-findings";
import {
  BLUEGUM,
  IRONSTONE,
  type SeededReportBrand,
  type SeedSpec,
  seedReportBrand,
  WARATAH,
} from "@/tests/helpers/report-seeds";
import { withCompetitors } from "@/tests/helpers/seeded-report-data";
import { type RenderedReport, renderSeededReport } from "@/tests/helpers/seeded-report-render";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

vi.mock("@/lib/reports/enhanced-check-runners", () => ({
  enhancedRunners: () => ({ site: async () => undefined, youtube: async () => undefined }),
}));

const GOLDEN = join(__dirname, "__golden__", "pdf-google-section-seeded.txt");
const sql = postgres(getTestDatabaseUrl(), { max: 1 });
const seeded: SeededReportBrand[] = [];

/** Bluegum with six more everyday questions (the matrix lists everyday ones: 16 rows) and 11 weekly audits #44-#54. */
const LONG: SeedSpec = (() => {
  const basis = BLUEGUM.audits[BLUEGUM.audits.length - 1];
  const at = (weeksBefore: number) =>
    new Date(Date.parse(basis.completedAt) - weeksBefore * 7 * 86_400_000).toISOString();
  return {
    ...BLUEGUM,
    everyday: [
      ...BLUEGUM.everyday,
      "Who installs rainwater tanks near Chatswood?",
      "Which plumber in Roseville can fix a burst pipe today?",
      "Best gas fitter on the lower north shore",
      "Who can unblock a toilet in Lindfield tonight?",
      "Recommend a roof plumber near Gordon NSW",
      "Which plumbers in Chatswood offer fixed-price quotes?",
    ],
    audits: Array.from({ length: 11 }, (_, k) => ({
      ...basis,
      number: 44 + k,
      completedAt: at(10 - k),
    })),
  };
})();

/** Waratah, with AI Mode giving no answer for its second question. */
const GOOGLE: SeedSpec = {
  ...WARATAH,
  google: { ...(WARATAH.google as NonNullable<SeedSpec["google"]>), aiModeNotShown: [2] },
};
/** Waratah, with Google skipped for every question by today's spend limit. */
const GOOGLE_SKIPPED: SeedSpec = {
  ...WARATAH,
  google: {
    ...(WARATAH.google as NonNullable<SeedSpec["google"]>),
    skippedReason: GOOGLE_STORED_REASON.dailyCap,
  },
};

const r = {} as Record<
  | "bluegum"
  | "ironstone"
  | "ironstoneNoDiagnosis"
  | "plain"
  | "plainGrowthBasic"
  | "long"
  | "google"
  | "googleSkipped"
  | "named"
  | "namedXss"
  | "bluegumToday",
  RenderedReport
>;

async function seed(spec: SeedSpec): Promise<SeededReportBrand> {
  const s = await seedReportBrand(sql, spec);
  seeded.push(s);
  return s;
}

async function setTierNames(s: SeededReportBrand, names: Record<string, string> | null) {
  await sql`
    UPDATE agency_brand_assets SET report_tier_names = ${names ? sql.json(names) : null}
    WHERE organization_id = ${s.orgId} AND brand_id IS NULL`;
}

beforeAll(async () => {
  process.env.DATABASE_URL = getTestDatabaseUrl();
  process.env.SERVICE_DATABASE_URL = getTestDatabaseUrl();
  vi.spyOn(console, "info").mockImplementation(() => undefined);

  const bluegum = await seed(BLUEGUM);
  r.bluegum = await renderSeededReport(sql, bluegum, "today");
  r.bluegumToday = r.bluegum;
  await setTierNames(bluegum, { basic: "Growth Plan" });
  r.named = await renderSeededReport(sql, bluegum, "basic");
  // Laid out since S03 part 0: the code font is JetBrains Mono NL, so the cover's "</" no longer crashes react-pdf
  // (LLD amendment 76; S02 collected this one as text only).
  await setTierNames(bluegum, { basic: "<b>Gold</b>" });
  r.namedXss = await renderSeededReport(sql, bluegum, "basic");

  const ironstone = await seed(IRONSTONE);
  r.ironstone = await renderSeededReport(sql, ironstone, "today");
  r.ironstoneNoDiagnosis = await renderSeededReport(sql, ironstone, "today", {
    sections: [{ type: "diagnosis", include: false }],
  });

  const plain = await seed(BLUEGUM);
  await sql`
    UPDATE brands SET suburb = NULL, city = NULL, state = NULL, categories = '{}'::text[]
    WHERE id = ${plain.brandId}`;
  await sql`UPDATE agency_brand_assets SET agency_name = NULL WHERE organization_id = ${plain.orgId}`;
  r.plain = await renderSeededReport(sql, plain, "today");
  await sql`UPDATE subscriptions SET tier = 'growth' WHERE organization_id = ${plain.orgId}`;
  r.plainGrowthBasic = await renderSeededReport(sql, plain, "basic");

  r.long = await renderSeededReport(sql, await seed(LONG), "today");
  r.google = await renderSeededReport(sql, await seed(GOOGLE), "today");
  r.googleSkipped = await renderSeededReport(sql, await seed(GOOGLE_SKIPPED), "today");
}, 600_000);

afterAll(async () => {
  for (const s of seeded) await s.cleanup();
  await sql.end();
});

/** Every number the report's data holds -- what any printed count must come from. */
function dataNumbers(data: ReportData): Set<string> {
  const out = new Set<string>();
  const add = (...ns: Array<number | null | undefined>) => {
    for (const n of ns) if (n !== null && n !== undefined) out.add(String(n));
  };
  add(data.mentionedCount, data.sampleCount, data.rankedCount, data.sourcedCount);
  add(data.medianPosition, data.basis.auditNumber, data.directories.totalAnswers);
  add(data.questions.perEngine, data.coverage.enginesPlanned, data.coverage.enginesAnswered);
  for (const e of data.engines) add(e.mentionedCount, e.sampleCount, e.failedCount);
  const cited = data.directories.rows.filter((row) => row.citedCount > 0);
  for (const row of cited) add(row.citedCount, row.ownerProfileCitedCount);
  for (const row of cited) for (const n of Object.values(row.citedByEngine ?? {})) add(n);
  const counts = cited.map((row) => row.citedCount).sort((a, b) => b - a);
  add(
    cited.length,
    counts.reduce((s, c) => s + c, 0),
    counts.slice(0, 3).reduce((s, c) => s + c, 0),
  );
  for (const c of data.competitors.rows) add(c.mentions);
  return out;
}

const copy = (x: RenderedReport): ReportData => structuredClone(x.data);
const rules = (data: ReportData) => reportFindings(data).map((f) => f.rule);
const pageWith = (x: RenderedReport, line: string | RegExp) =>
  x.pages.find((p) => p.some((t) => (typeof line === "string" ? t === line : line.test(t)))) ?? [];
const header = (x: RenderedReport) => `AI Visibility Report · ${x.data.brand.name} · Week 47, 2026`;

describe("seven pages, as the prototype (Bluegum, report_v2 off)", () => {
  it("the PDF has seven A4 pages and embeds Fraunces, Inter and JetBrains Mono NL", () => {
    expect(r.bluegum.pageCount).toBe(7);
    const pdf = r.bluegum.pdf.toString("latin1");
    for (const font of [
      "Inter-Regular",
      "Inter-SemiBold",
      "Inter-Bold",
      "Fraunces-Bold",
      "Fraunces-SemiBold",
      "Fraunces-Regular",
      "JetBrainsMonoNL-Regular",
    ]) {
      expect(pdf, font).toMatch(new RegExp(`/BaseFont /[A-Z]{6}\\+${font}\\b`));
    }
    expect(pdf).not.toMatch(/\/BaseFont \/Helvetica/);
  });

  it("in order: cover, summary, engines, where AI looks, diagnosis, over time + next, method", () => {
    const p = r.bluegum.pages;
    expect(p).toHaveLength(7);
    expect(p[0]).toContain("AI Visibility Report");
    expect(p[0]).toContain("Bluegum Home Services");
    expect(p[1]).toContain("01 · Executive summary");
    expect(p[2]).toContain("02 · Engine by engine");
    expect(p[3]).toContain("03 · Where AI looks");
    expect(p[4]).toContain("04 · Diagnosis");
    expect(p[5]).toContain("05 · Over time");
    expect(p[5]).toContain("06 · Recommended next");
    expect(p[6]).toContain("07 · Method and notes");
  });

  it("pages 2-7 carry the running header and footer and 'Page n of 7'; the cover doesn't", () => {
    const p = r.bluegum.pages;
    expect(p[0].join(" ")).not.toContain("Page 1 of 7");
    expect(p[0]).not.toContain(header(r.bluegum));
    for (let i = 1; i < 7; i++) {
      expect(p[i], `page ${i + 1}`).toContain(header(r.bluegum));
      expect(p[i], `page ${i + 1}`).toContain("Vunnara");
      expect(p[i], `page ${i + 1}`).toContain(
        "Confidential · Prepared for Bluegum Home Services by Possum Marketing",
      );
      expect(p[i], `page ${i + 1}`).toContain(`Page ${i + 1} of 7`);
    }
  });
});

describe("valid details, never placeholders", () => {
  it("no braces, undefined, null, N/A, NaN or 'DESIGN PROTOTYPE'; no 'VisibleAU'", () => {
    for (const key of [
      "bluegum",
      "ironstone",
      "plain",
      "long",
      "google",
      "googleSkipped",
    ] as const) {
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
        expect(r[key].text, `${key}: ${bad}`).not.toMatch(bad);
      }
    }
  });

  it("names the brand, the period, the basis audit and the generation time (AEDT)", () => {
    const text = r.bluegum.text;
    expect(text).toContain(
      `Chatswood, NSW · ${r.bluegum.data.brand.vertical} · Week 47, 2026 (16 – 22 Nov)`,
    );
    expect(text).toContain("Based on Audit #54 · 20 Nov 2026");
    expect(text).toMatch(
      /Generated \d{1,2} [A-Z][a-z]{2} \d{4}, \d{1,2}:\d{2} [ap]m AE[DS]T · Confidential/,
    );
    expect(text).toContain(
      "The latest complete audit in Week 47, 2026 in which every engine answered.",
    );
  });

  it("a brand with no suburb, state or business type omits them cleanly", () => {
    const p = r.plain.pages;
    expect(r.plain.data.brand.locality).toBeNull();
    expect(r.plain.data.brand.state).toBeNull();
    expect(r.plain.data.brand.vertical).toBeNull();
    expect(p[0]).toContain("Week 47, 2026 (16 – 22 Nov)");
    expect(p[0].join("\n")).not.toMatch(/(^|\n)\s*·|· ·|·\s*(\n|$)/);
    expect(p[6]).not.toContain("Location");
  });

  it("with no agency name: no 'by', no initials tile, and the footer still reads cleanly", () => {
    expect(r.plain.data.agency.name).toBeNull();
    expect(r.plain.pages[1]).toContain("Confidential · Prepared for Bluegum Home Services");
    expect(r.plain.text).not.toContain(" by Possum");
  });
});

describe("the partial-engine audit (Ironstone: Claude failed every question)", () => {
  // S01C part 1, LLD amendment 58: "The real reports printed 'Claude: provider spend limit reached' under the
  // over-time chart; it now reads 'Claude didn't answer: a problem on our side'" -- and so does every other place
  // the PDF gives the reason.
  it("says 3 of 4 engines, with the plain reason, next to the headline", () => {
    const p = r.ironstone.pages;
    const answered = r.ironstone.data.sampleCount;
    expect(p[0]).toContain("3 of 4 engines answered");
    expect(p[1]).toContain(
      `This audit is based on 3 of 4 engines. Claude returned an error for all ${r.ironstone.data.questions.perEngine} questions (a problem on our side), so its answers aren't counted. Visibility uses the ${answered} answers from ChatGPT, Gemini and Perplexity.`,
    );
    expect(p[2]).toContain("Didn't answer: a problem on our side");
  });
});

describe("no unsupported claims, no projections", () => {
  it("no archetype, trend verdict, 'immutable', '0 critical gaps', projected lift, '+N pts' or '/ 100'", () => {
    for (const key of ["bluegum", "ironstone", "long", "google"] as const) {
      for (const claim of [
        /recognised authority/i,
        /trending (up|down)/i,
        /immutable/i,
        /0 critical gaps/i,
        /projected/i,
        /\+\s?\d+(\.\d+)?\s?pts/i,
        /\/\s?100\b/,
      ]) {
        expect(r[key].text, `${key}: ${claim}`).not.toMatch(claim);
      }
    }
  });
});

describe("diagnosis rules (a)-(e), on the seeds' own data", () => {
  it("(a) directories cited twice or more without the owner's profile", () => {
    expect(rules(copy(r.ironstone))).toContain("a");
    const none = copy(r.ironstone);
    none.directories.rows = [];
    expect(rules(none)).not.toContain("a");
    const cited = copy(r.ironstone);
    cited.directories.rows = cited.directories.rows.map((row) => ({
      ...row,
      ownerProfileLinked: true,
      ownerProfileCitedCount: 1,
    }));
    expect(rules(cited)).not.toContain("a");
  });

  it("(b) an engine with 0 of 10+ while another has mentions", () => {
    expect(rules(copy(r.ironstone))).toContain("b"); // Gemini 0 of 10
    const allMention = copy(r.bluegum);
    allMention.engines = allMention.engines.map((e) => ({
      ...e,
      mentionedCount: Math.max(1, e.mentionedCount),
    }));
    expect(rules(allMention)).not.toContain("b");
    const noneMention = copy(r.bluegum);
    noneMention.engines = noneMention.engines.map((e) => ({ ...e, mentionedCount: 0 }));
    expect(rules(noneMention)).not.toContain("b");
  });

  it("(c) an engine that failed every question", () => {
    expect(rules(copy(r.ironstone))).toContain("c");
    expect(rules(copy(r.bluegum))).not.toContain("c");
  });

  it("(d) the strength: typically #1-#3 and at least half the mentions sourced", () => {
    const strong = copy(r.bluegum);
    strong.medianPosition = 1;
    strong.sourcedCount = strong.mentionedCount;
    expect(rules(strong)).toContain("d");
    const low = structuredClone(strong);
    low.medianPosition = 4;
    expect(rules(low)).not.toContain("d");
    const unsourced = structuredClone(strong);
    unsourced.sourcedCount = Math.floor((strong.mentionedCount - 1) / 2);
    expect(rules(unsourced)).not.toContain("d");
  });

  it("(e) a competitor named more often on the same answers", () => {
    const ahead = copy(r.bluegum);
    ahead.competitors = withCompetitors(ahead, [
      { name: "Rival Co", mentions: ahead.mentionedCount * 2 },
    ]);
    expect(rules(ahead)).toContain("e");
    const behind = copy(r.bluegum);
    behind.competitors = withCompetitors(behind, [{ name: "Rival Co", mentions: 1 }]);
    expect(rules(behind)).not.toContain("e");
    expect(rules(copy(r.bluegum))).not.toContain("e");
  });

  it("keeps the first three problems in rule order, then the strength", () => {
    const data = copy(r.ironstone);
    data.competitors = withCompetitors(data, [
      { name: "Rival Co", mentions: data.mentionedCount * 2 },
    ]);
    data.medianPosition = 1;
    data.sourcedCount = data.mentionedCount;
    expect(rules(data)).toEqual(["a", "b", "c", "d"]);
  });

  it("every evidence line's numbers, and every action's, are the data's own", () => {
    for (const key of ["bluegum", "ironstone"] as const) {
      const data = copy(r[key]);
      const numbers = dataNumbers(data);
      for (const f of reportFindings(data)) {
        expect(f.evidence.length, f.title).toBeGreaterThan(0);
        const text = [
          ...f.evidence.map((line) => line.map((p) => p.text).join("")),
          f.recommendation.detail,
        ].join(" ");
        for (const n of text.match(/\d+/g) ?? []) {
          expect(numbers, `${key} ${f.rule}: ${n} in "${text}"`).toContain(n);
        }
      }
    }
  });

  it("the recommended actions link each to its finding", () => {
    const p = r.ironstone.pages;
    const findings = reportFindings(copy(r.ironstone));
    findings.forEach((f, i) => {
      expect(p[4]).toContain(f.title);
      // S01C part 2b, LLD amendment 60: a finding with no action (an engine that cited no directory) is left out of
      // Recommended next; the others keep their own finding's number.
      if (f.noAction) {
        expect(p[5]).not.toContain(f.recommendation.title);
        return;
      }
      expect(p[5]).toContain(f.recommendation.title);
      expect(p[5]).toContain(`Finding ${i + 1} · ${f.severity.short}`);
    });
  });
});

describe("the question-by-engine matrix", () => {
  it("each cell is one answer, and per-engine totals equal the bars", () => {
    for (const key of ["bluegum", "ironstone"] as const) {
      const data = r[key].data;
      for (const e of data.engines) {
        const cells = data.matrix.map((row) => row.cells[e.engine]);
        expect(cells.filter((c) => c === "mentioned").length).toBe(e.mentionedCount);
        expect(cells.filter((c) => c !== "error").length).toBe(e.sampleCount);
      }
      const p = r[key].pages;
      // One tick per mention, plus the legend's.
      expect(p[2].filter((t) => t === "✓").length).toBe(data.mentionedCount + 1);
      expect(p[2]).toContain("Q1");
      expect(p[2]).toContain(data.matrix[0].question);
    }
  });

  it("more than 15 questions continue on a second engine page (the long seed: 16 rows)", () => {
    const p = r.long.pages;
    expect(r.long.data.matrix).toHaveLength(16);
    expect(p).toHaveLength(8);
    expect(p[2]).toContain("Q15");
    expect(p[2]).not.toContain("Q16");
    expect(p[3]).toContain("Question by question (continued)");
    expect(p[3]).toContain("Q16");
  });
});

describe("over time", () => {
  it("below the minimum: the measured figures and 'not enough comparable audits', no verdict", () => {
    const text = pageWith(r.bluegum, "05 · Over time").join("\n");
    expect(text).toContain(
      "Not enough comparable audits for a trend yet (minimum 3); figures are shown as measured, without a trend claim.",
    );
  });

  it("an audit that used 3 of 4 engines is shown but not compared, with the plain reason (Waratah's #47)", () => {
    // S01C part 1, LLD amendment 58 (quoted above): the plain reason.
    const text = pageWith(r.google, /^\d\d · Over time$/).join("\n");
    expect(text).toContain(
      "Audit #47 used 3 of 4 engines (Claude didn't answer: a problem on our side), so it's shown but not compared.",
    );
  });

  it("with no partial audits and none left out, the caption is unchanged", () => {
    expect(r.bluegum.data.trend.points.some((p) => p.partial)).toBe(false);
    expect(r.bluegum.data.trend.leftOut).toBe(0);
    const text = pageWith(r.bluegum, "05 · Over time").join("\n");
    expect(text).not.toContain("shown but not compared");
    expect(text).not.toContain("left out");
    expect(text).not.toContain("Hollow points");
  });

  it("more than 8 audits: the caption says how many earlier ones are left out", () => {
    expect(r.long.data.trend.leftOut).toBe(3);
    expect(pageWith(r.long, /^\d\d · Over time$/).join("\n")).toContain(
      "The chart shows the latest 8 audits; 3 earlier audits are left out.",
    );
  });

  it("with enough comparable audits: the measured change, judged by the drift rule", () => {
    const change = r.long.data.trend.change;
    expect(change).toMatchObject({ toAuditNumber: 54, severity: "within_noise" });
    const text = pageWith(r.long, /^\d\d · Over time$/).join("\n");
    expect(text).not.toContain("Not enough comparable audits");
    expect(text).toContain(
      `From Audit #${change?.fromAuditNumber} to #54 the change is within the margin of error: their 95% confidence intervals overlap.`,
    );
  });
});

describe("the report template's optional sections", () => {
  it("leaving out the diagnosis drops its page and the 'Finding n' links", () => {
    const p = r.ironstoneNoDiagnosis.pages;
    expect(p).toHaveLength(6);
    const text = p.flat().join("\n");
    expect(text).not.toContain("Diagnosis");
    expect(text).not.toMatch(/Finding \d/);
    expect(text).toContain("04 · Over time");
  });
});

/** The lines from "NN · Google Search AI" up to the next section's eyebrow. */
function googleSectionText(x: RenderedReport): string[] {
  const page = pageWith(x, / · Google Search AI$/);
  const start = page.findIndex((line) => / · Google Search AI$/.test(line));
  const end = page.findIndex((line, i) => i > start && / · Where AI looks$/.test(line));
  return start < 0 ? [] : page.slice(start, end < 0 ? undefined : end);
}

const eyebrows = (x: RenderedReport) =>
  x.pages
    .flat()
    .filter((line) => /^\d\d · [A-Z]/.test(line))
    .filter((line, i, all) => all.indexOf(line) === i);

describe("the report PDF's Google section (Waratah's Google questions)", () => {
  it("matches the golden: each surface, the questions naming you, the directories, each question", () => {
    const text = `${googleSectionText(r.google).join("\n")}\n`;
    if (process.env.UPDATE_GOLDEN === "1") {
      mkdirSync(dirname(GOLDEN), { recursive: true });
      writeFileSync(GOLDEN, text);
    }
    expect(existsSync(GOLDEN), "golden missing: run once with UPDATE_GOLDEN=1").toBe(true);
    expect(text).toBe(readFileSync(GOLDEN, "utf8"));
    expect(text).toContain("questions naming you: mentioned in 3 of 3");
    expect(text).toContain("Directories cited: Yellow Pages");
    expect(text).toContain("Shown · mentioned");
    expect(text).toContain("No answer");
  });

  it("numbered in order, the sections after it moved up one", () => {
    expect(eyebrows(r.google).slice(0, 4)).toEqual([
      "01 · Executive summary",
      "02 · Engine by engine",
      "03 · Google Search AI",
      "04 · Where AI looks",
    ]);
  });

  it("never a page of its own: it starts the directories page and flows into it", () => {
    expect(pageWith(r.google, "03 · Google Search AI")).toContain("04 · Where AI looks");
  });

  it("when Google answered nothing (today's spend limit): each surface not checked, the one line saying why, no table", () => {
    const text = googleSectionText(r.googleSkipped);
    expect(text).toContain("AI Overviews: couldn't be checked this time");
    expect(text).toContain("AI Mode: couldn't be checked this time");
    const why = GOOGLE_CUSTOMER_OWN_REASONS.dailyCap;
    expect(text.filter((line) => line === why)).toHaveLength(1);
    expect(text.join("\n")).not.toMatch(/Shown|No answer|Question/);
  });

  it("a report without Google: no Google section, the old numbering", () => {
    expect(googleSectionText(r.bluegum)).toEqual([]);
    expect(eyebrows(r.bluegum).slice(0, 3)).toEqual([
      "01 · Executive summary",
      "02 · Engine by engine",
      "03 · Where AI looks",
    ]);
  });
});

/**
 * S01 part 10 (contract P09.cover; LLD 8.1.7 D-RT3): the report type's name on the PDF cover -- on its own line directly
 * above the cover's title, in the eyebrow style, uppercase -- only on Agency and up (coverTierName, set from the
 * workspace's names when the report was made and kept in its snapshot). Growth and every report before tiers show no
 * name; the rest of the cover is unchanged.
 */
describe("the cover's report name (P09.cover)", () => {
  it("Agency and up: the workspace's name in capitals, directly above the cover's title", () => {
    const page = r.named.pages[0];
    const at = page.indexOf("GROWTH PLAN");
    expect(at).toBeGreaterThanOrEqual(0);
    expect(page[at + 1]).toBe("AI Visibility Report");
  });

  it("the name is the only addition; Growth, and a report from before tiers, have no line", () => {
    expect(r.named.pages[0].filter((t) => t !== "GROWTH PLAN")).toEqual(r.bluegumToday.pages[0]);
    expect(r.bluegumToday.pages[0].join(" ")).not.toMatch(/GROWTH PLAN|BASIC|STANDARD|ENHANCED/);
    expect(r.plainGrowthBasic.data.v2?.coverTierName).toBeNull();
    expect(r.plainGrowthBasic.pages[0].join(" ")).not.toMatch(
      /GROWTH PLAN|BASIC|STANDARD|ENHANCED/,
    );
  });

  it("an agency's name is printed as text (an XSS payload stays text)", () => {
    expect(r.namedXss.pages[0]).toContain("<B>GOLD</B>");
    expect(r.namedXss.pageCount).toBe(7);
  });
});
