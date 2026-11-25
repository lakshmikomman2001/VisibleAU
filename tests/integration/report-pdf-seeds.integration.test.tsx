/**
 * S01B part 4 (LLD amendments 51-53, 55; contract v1.4 P09): the report PDFs of three invented businesses, each seeded
 * as real audits (tests/helpers/report-seeds.ts) and turned into reports by the real path -- the audit's own
 * recommendation step, then the generator (buildReportData -> buildReportV2 -> snapshot, Enhanced through
 * refresh-enhanced-checks) and the renderer (loadReportRenderData -> buildReportPdf) -- never hand-composed input.
 * - N15: a Basic report is today's report (report_v2 off) apart from the allowed differences (the cover's report name
 *   on Agency plans, the question mix line, findings g-j within today's limit).
 * - N14: in Enhanced, the cover, summary, engines and directories pages are today's apart from the page count.
 * - b. Every figure printed on more than one page is the same everywhere: each directory's cited count and whether
 *   the owner's profile is linked, the Visibility figure, each engine's figure.
 * - c. Each finding appears once; its card carries its action's pills and the agency's note; OTHER ACTIONS FROM THIS
 *   AUDIT lists only measured items not shown as a finding.
 * - d. At most 3 problem findings and 1 strength, in every tier.
 * - e. From "Why, and what to do next" onwards Standard and Enhanced flow: fewer pages, every group heading held with
 *   its first item.
 * - f. Every character the PDF prints has a glyph in the font it's printed in.
 * - g. The crawlers tile says "Visits: not measured" and its next step once.
 * S01B part 6 (amendments 52, 56; contract v1.5): Method and notes kept whole, strengths without a status pill, rule j
 * by cause, the evidence lines' formatting, rule h's repeated sentence quoted once (the last describe block).
 * With REPORT_PDF_OUT set, the PDFs are also written there (the sprint report's images) with their page counts.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ReportDataV2 } from "@/lib/reports/report-snapshot";
import { missingGlyphs, printedRuns } from "@/tests/helpers/pdf-fonts";
import { markPages } from "@/tests/helpers/pdf-page-markers";
import { collectPdfPages } from "@/tests/helpers/pdf-text";
import { runReportGeneration } from "@/tests/helpers/report-generation";
import {
  REPORT_SEEDS,
  type SeededReportBrand,
  type SeedSpec,
  seedReportBrand,
} from "@/tests/helpers/report-seeds";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

const runnerCalls = vi.hoisted(() => [] as string[]);
vi.mock("@/lib/reports/enhanced-check-runners", () => ({
  // The seeded checks are all within their windows, so an Enhanced report re-runs nothing; recorded in case it does.
  enhancedRunners: () => ({
    site: async (b: { id: string }) => {
      runnerCalls.push(`site:${b.id}`);
    },
    youtube: async (b: { id: string }) => {
      runnerCalls.push(`youtube:${b.id}`);
    },
  }),
}));

const TIERS = ["basic", "standard", "enhanced"] as const;
type Tier = (typeof TIERS)[number];
type Version = "today" | Tier;

interface Rendered {
  data: ReportDataV2;
  doc: ReactElement;
  pages: string[][];
  text: string;
  pageCount: number;
}

const sql = postgres(getTestDatabaseUrl(), { max: 1 });
const seeded: SeededReportBrand[] = [];
const reports = new Map<string, Record<Version, Rendered>>();
const OUT = process.env.REPORT_PDF_OUT;

/** Pages in a PDF react-pdf wrote (each page object is "/Type /Page", the tree "/Type /Pages"). */
const pdfPageCount = (pdf: Buffer) =>
  (pdf.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? []).length;

async function generateAndRender(seed: SeededReportBrand, version: Version): Promise<Rendered> {
  const { generator } = await runReportGeneration({
    data: {
      brandId: seed.brandId,
      organizationId: seed.orgId,
      periodLabel: "2026-W47",
      periodType: "weekly",
      manual: true,
      ...(version === "today" ? {} : { tier: version }),
    },
  });
  const reportId = String(generator.reportId);
  const [row] = await sql<
    { audit_id: string; report_tier: string; contents_snapshot: unknown; period_label: string }[]
  >`SELECT audit_id, report_tier, contents_snapshot, period_label FROM generated_reports WHERE id = ${reportId}`;
  if (version === "today") expect(row.contents_snapshot).toBeNull();
  else expect(row.report_tier).toBe(version);
  const { serviceDb } = await import("@/db/client");
  const { loadReportRenderData } = await import("@/lib/reports/report-render-input");
  const { buildReportPdf, ReportDocument } = await import("@/lib/communication/pdf-builder");
  const { data } = await loadReportRenderData(serviceDb, {
    organizationId: seed.orgId,
    brandId: seed.brandId,
    auditId: row.audit_id,
    periodType: "weekly",
    periodLabel: row.period_label,
    sections: null,
    contentsSnapshot: row.contents_snapshot,
  });
  if (!data) throw new Error(`${seed.spec.key} ${version}: no render data`);
  const pdf = await buildReportPdf(data);
  if (OUT) {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, `${seed.spec.key}-${version}.pdf`), pdf);
  }
  // Each report is rendered as soon as it's made, then removed, so the next one's "done since the last report" is
  // measured from the same earlier report (the seed's, a week before).
  await sql`DELETE FROM generated_reports WHERE id = ${reportId}`;
  const doc = <ReportDocument data={data} />;
  const pages = collectPdfPages(doc);
  return { data, doc, pages, text: pages.flat().join("\n"), pageCount: pdfPageCount(pdf) };
}

async function setReportV2(seed: SeededReportBrand, on: boolean) {
  await sql`UPDATE org_feature_flags SET is_enabled = ${on} WHERE organization_id = ${seed.orgId} AND flag_key = 'report_v2'`;
}

beforeAll(async () => {
  process.env.DATABASE_URL = getTestDatabaseUrl();
  process.env.SERVICE_DATABASE_URL = getTestDatabaseUrl();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  for (const spec of REPORT_SEEDS) {
    const seed = await seedReportBrand(sql, spec);
    seeded.push(seed);
    await setReportV2(seed, false);
    const today = await generateAndRender(seed, "today");
    await setReportV2(seed, true);
    const byTier: Partial<Record<Version, Rendered>> = { today };
    for (const tier of TIERS) byTier[tier] = await generateAndRender(seed, tier);
    reports.set(spec.key, byTier as Record<Version, Rendered>);
  }
  if (OUT) {
    const counts = Object.fromEntries(
      [...reports].map(([key, r]) => [
        key,
        Object.fromEntries(Object.entries(r).map(([v, x]) => [v, x.pageCount])),
      ]),
    );
    writeFileSync(join(OUT, "page-counts.json"), `${JSON.stringify(counts, null, 2)}\n`);
  }
}, 600_000);

afterAll(async () => {
  for (const seed of seeded) await seed.cleanup();
  await sql.end();
});

const get = (spec: SeedSpec, v: Version) => {
  const r = reports.get(spec.key)?.[v];
  if (!r) throw new Error(`${spec.key} ${v} wasn't rendered`);
  return r;
};

/** The page whose section eyebrow is `name` ("Diagnosis", "Why, and what to do next" ...), by index. */
const pageWith = (r: Rendered, eyebrow: string) =>
  r.pages.findIndex((p) => p.some((t) => new RegExp(`^\\d{2} · ${eyebrow}$`).test(t)));

/** The page count in the footer, and the clock time "Generated ..." prints (reports made a minute apart). */
const normalise = (page: string[]) =>
  page.map((t) =>
    /^Page \d+ of \d+$/.test(t) ? "Page n of N" : t.replace(/\b\d{1,2}:\d{2} ?[ap]m\b/g, "<time>"),
  );

const describeEach = describe.each(REPORT_SEEDS.map((spec) => [spec.brandName, spec] as const));

describeEach("%s", (_name, spec) => {
  it("N15: Basic is today's report, apart from the allowed differences", () => {
    const today = get(spec, "today");
    const basic = get(spec, "basic");
    expect(basic.pages.length).toBe(today.pages.length);
    const coverName = basic.data.v2?.coverTierName?.toUpperCase() ?? null;
    const diagnosis = pageWith(today, "Diagnosis");
    expect(pageWith(basic, "Diagnosis")).toBe(diagnosis);
    basic.pages.forEach((page, i) => {
      // A report with no finding today gains findings g-j, so its "Recommended next" list appears too (N15: they
      // replace "No finding rule matched") and the sections after it move up one number.
      const renumber = (p: string[]) => p.map((t) => t.replace(/^\d{2} · /, "nn · "));
      let mine = renumber(normalise(page));
      const theirs = renumber(normalise(today.pages[i]));
      if (i === 0 && coverName) mine = mine.filter((t) => t !== coverName);
      // The question mix line (Method page): its label and value.
      const mix = mine.indexOf("Questions asked");
      if (mix >= 0) mine = [...mine.slice(0, mix), ...mine.slice(mix + 2)];
      if (i === diagnosis || mine.includes("Prioritised by impact")) {
        // Findings g-j may take their place among the cards (and the prioritised list), within today's limit.
        expect(mine.slice(0, 6)).toEqual(theirs.slice(0, 6));
        return;
      }
      expect(mine, `page ${i + 1}`).toEqual(theirs);
    });
  });

  it("N14: Enhanced keeps today's cover, summary, engines and directories pages", () => {
    const today = get(spec, "today");
    const enhanced = get(spec, "enhanced");
    const before = pageWith(today, "Diagnosis");
    expect(before).toBeGreaterThan(0);
    const coverName = enhanced.data.v2?.coverTierName?.toUpperCase() ?? null;
    for (let i = 0; i < before; i++) {
      const mine = normalise(enhanced.pages[i]).filter((t) => !(i === 0 && t === coverName));
      expect(mine, `page ${i + 1}`).toEqual(normalise(today.pages[i]));
    }
  });

  it.each(TIERS)("b. every figure on more than one page is the same everywhere (%s)", (tier) => {
    const r = get(spec, tier);
    const rows = r.data.directories.rows.filter((d) => d.citedCount > 0);
    expect(rows.length).toBeGreaterThan(0);
    const lines = r.pages.flat();
    for (const d of rows) {
      const name = d.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const counts: number[] = [];
      lines.forEach((t, i) => {
        if (/directory citations/.test(t)) return;
        if (t === d.name) {
          // The directories table: the name, then "{n} of {m}".
          const cell = lines.slice(i + 1, i + 3).find((x) => /^\d+ of \d+$/.test(x));
          if (cell) counts.push(Number(cell.split(" ")[0]));
          return;
        }
        for (const m of t.matchAll(
          new RegExp(`${name}\\b[^0-9]{0,40}?(\\d+)(?: of \\d+)? answers`, "g"),
        ))
          counts.push(Number(m[1]));
      });
      expect(counts.length, `${d.name} is printed with a count`).toBeGreaterThan(0);
      expect(new Set(counts), `${d.name}'s cited count`).toEqual(new Set([d.citedCount]));
      // Linked or not, the same everywhere: the Beyond tile and the findings/actions say what the table says.
      const linkedWords = lines.filter((t) => t.startsWith(`${d.name}: `));
      for (const t of linkedWords)
        expect(t.startsWith(`${d.name}: linked`), t).toBe(d.ownerProfileLinked);
      if (d.ownerProfileLinked)
        expect(lines.some((t) => t.includes(`${d.name}`) && /Not linked yet/.test(t))).toBe(false);
    }
    // The summary's profile tile never says "Not checked" while a cited directory is linked.
    if (rows.some((d) => d.ownerProfileLinked)) expect(r.pages[1]).not.toContain("Not checked");
    // Visibility: the cover's figure is the summary's, and the method glossary's.
    const percent = r.pages[1].find((t) => /^\d+%$/.test(t));
    if (percent) {
      expect(r.pages[0]).toContain(percent);
      for (const t of lines.filter((x) =>
        /^The share of everyday answers that mention you\./.test(x),
      ))
        expect(t).toContain(`${percent} = `);
    }
    // Each engine's figure: wherever "{engine} ... {k} of {n}" is printed, the same k of n.
    for (const e of r.data.engines.filter((x) => !x.fullyFailed)) {
      const figures = new Set(
        lines.flatMap((t) =>
          t.startsWith(e.name)
            ? [...t.matchAll(/(\d+) of (\d+) (?:answers|everyday)/g)].map((m) => `${m[1]}/${m[2]}`)
            : [],
        ),
      );
      expect(figures.size, `${e.name}'s figure`).toBeLessThanOrEqual(1);
    }
  });

  it.each([
    "standard",
    "enhanced",
  ] as const)("c. each finding appears once, carrying its action; other actions follow (%s)", (tier) => {
    const r = get(spec, tier);
    const next = r.data.v2?.whatToDoNext;
    expect(r.text).not.toContain("MEASURED ACTIONS");
    const lines = r.pages.flat();
    const shown = reportFindingsShown(r);
    expect(shown.length).toBeGreaterThan(0);
    for (const f of shown) {
      // The card's title once; its action never again as a card of its own (the action's title is the
      // finding's recommendation, which only the card's own fix line may print).
      expect(
        lines.filter((x) => x === f.title),
        f.title,
      ).toHaveLength(1);
      const printedAsIs = f.fix === f.recommendation.title || f.title === f.recommendation.title;
      expect(lines.filter((x) => x === f.recommendation.title).length, f.recommendation.title).toBe(
        printedAsIs ? 1 : 0,
      );
    }
    const shownRules = new Set(shown.map((f) => f.rule));
    const others = (next?.measured ?? []).filter(
      (m) => m.included && !(m.findingRule && shownRules.has(m.findingRule)),
    );
    if (others.length > 0) {
      expect(r.text).toContain("OTHER ACTIONS FROM THIS AUDIT");
      for (const m of others) expect(lines, m.title).toContain(m.title);
    } else expect(r.text).not.toContain("OTHER ACTIONS FROM THIS AUDIT");
  });

  it.each(TIERS)("d. at most 3 problem findings and 1 strength (%s)", (tier) => {
    const r = get(spec, tier);
    const cards = reportCards(r);
    expect(cards.filter((c) => c !== "strength").length).toBeLessThanOrEqual(3);
    expect(cards.filter((c) => c === "strength").length).toBeLessThanOrEqual(1);
  });

  it.each(TIERS)("f. every character printed has a glyph in its font (%s)", async (tier) => {
    const r = get(spec, tier);
    const runs = printedRuns(r.doc as ReactNode, { fontFamily: "Inter", fontWeight: 400 });
    expect(runs.length).toBeGreaterThan(100);
    expect(await missingGlyphs(runs)).toEqual([]);
  });
});

/** The kind of each finding card the PDF draws ("risk", "watch", "strength"). */
function reportCards(r: Rendered): string[] {
  return reportFindingsShown(r).map((f) => f.kind);
}
function reportFindingsShown(r: Rendered) {
  // The document's own context: exactly the findings it draws as cards.
  const { reportContext } = requireDocument();
  return reportContext(r.data).findings;
}
let documentModule: typeof import("@/lib/reports/pdf/report-document") | null = null;
function requireDocument() {
  if (!documentModule) throw new Error("the document module isn't loaded");
  return documentModule;
}
beforeAll(async () => {
  documentModule = await import("@/lib/reports/pdf/report-document");
});

describe("the TechCore-like report (Kurrajong IT Solutions, 0 of 40)", () => {
  const spec = REPORT_SEEDS[2];
  it("d. Basic shows 3 problem cards, and the findings beyond them are actions in Standard", () => {
    const basic = get(spec, "basic");
    const standard = get(spec, "standard");
    const shown = reportFindingsShown(basic);
    expect(shown.filter((f) => f.kind !== "strength")).toHaveLength(3);
    const { reportFindings } = requireReportFindings();
    const all = reportFindings(standard.data);
    expect(all.filter((f) => f.kind !== "strength").length).toBeGreaterThan(3);
    const beyond = all.filter((f) => !shown.some((s) => s.rule === f.rule));
    expect(standard.text).toContain("OTHER ACTIONS FROM THIS AUDIT");
    for (const f of beyond) expect(standard.pages.flat()).toContain(f.recommendation.title);
  });
});
let findingsModule: typeof import("@/lib/reports/report-findings") | null = null;
function requireReportFindings() {
  if (!findingsModule) throw new Error("report-findings isn't loaded");
  return findingsModule;
}
beforeAll(async () => {
  findingsModule = await import("@/lib/reports/report-findings");
});

describe("the Hero-like report (Bluegum Home Services)", () => {
  const spec = REPORT_SEEDS[0];
  it("c. the directory finding's card carries its item's IN PROGRESS and the agency's note, once", () => {
    for (const tier of ["standard", "enhanced"] as const) {
      const r = get(spec, tier);
      const lines = r.pages.flat();
      expect(
        lines.filter((t) => t.startsWith("Note from Splice Marketing: We are updating")),
      ).toHaveLength(1);
      expect(lines).toContain("IN PROGRESS");
      expect(r.text).toContain("RECOMMENDED BY SPLICE MARKETING");
      expect(r.text).toContain("DONE SINCE THE LAST REPORT");
    }
  });

  it("e. Standard and Enhanced flow: fewer pages than one per section, Enhanced about 7", () => {
    const enhanced = get(spec, "enhanced");
    const standard = get(spec, "standard");
    const basic = get(spec, "basic");
    expect(enhanced.pageCount).toBeLessThanOrEqual(8);
    expect(standard.pageCount).toBeLessThanOrEqual(basic.pageCount);
  });

  it("e. every group heading is held with its first item; a section start makes room for a third of a page", () => {
    const enhanced = get(spec, "enhanced");
    const labels = [
      "OTHER ACTIONS FROM THIS AUDIT",
      "RECOMMENDED BY SPLICE MARKETING",
      "DONE SINCE THE LAST REPORT",
    ];
    const held = groupsHeldWithFirstItem(enhanced.doc as ReactNode);
    for (const label of labels.filter((l) => enhanced.text.includes(l)))
      expect(held, label).toContain(label);
  });

  it("f. the identity tile says .au domain in words, never a tick", () => {
    const text = get(spec, "enhanced").text;
    expect(text).toMatch(/\.au domain: (yes|no) · Wikipedia/);
    expect(text).not.toContain("✓ · Wikipedia");
  });

  it("g. the crawlers tile says Visits: not measured, and its next step once", () => {
    const text = get(spec, "enhanced").text;
    expect(text).toContain("Visits: not measured");
    expect(text.match(/upload server logs/gi) ?? []).toHaveLength(1);
    expect(text).toContain("Next step: Upload server logs");
  });

  it("c. an action the agency hid is left out of Standard and Enhanced", () => {
    const hidden = seeded.find((s) => s.spec.key === spec.key)?.hiddenActionTitle ?? null;
    expect(hidden, "the seed hides one Action Center item").not.toBeNull();
    for (const tier of ["standard", "enhanced"] as const) {
      // A measured action the report would print, kept in its contents as not included (the panel lists it).
      expect(get(spec, tier).data.v2?.whatToDoNext?.measured).toContainEqual(
        expect.objectContaining({ title: hidden, included: false }),
      );
    }
    for (const tier of ["standard", "enhanced"] as const)
      expect(get(spec, tier).pages.flat(), `${tier}: ${hidden}`).not.toContain(hidden);
  });

  it("the refresh re-ran nothing (every seeded check is within its window)", () => {
    expect(runnerCalls).toEqual([]);
  });
});

/**
 * S01 Part 7's render checks (tests/unit/reports/report-v2-pdf.test.tsx, hand-composed input with real client names),
 * here on the seeded reports (LLD amendment 51).
 */
describe("the tiers' pages (S01 part 7's render checks, on seeded audits)", () => {
  const [bluegum, , kurrajong] = REPORT_SEEDS;
  const mix = (r: Rendered) => {
    const q = r.data.questions;
    return `${q.everyday + q.branded} questions: ${q.everyday} everyday (${q.everyday} AI-suggested) and ${q.branded} that name the business.`;
  };

  it("Standard: 'Why, and what to do next' replaces Diagnosis, with the agency's groups", () => {
    const r = get(bluegum, "standard");
    expect(r.text).not.toContain("· Diagnosis");
    expect(r.text).toContain("Why, and what to do next");
    expect(r.text).toContain("What we found, and what to do next");
    expect(r.text).toContain(
      "Each action shows the evidence from this audit. Notes and actions from Splice Marketing are labelled.",
    );
    expect(r.text).toContain("Ask five recent customers for a Yellow Pages review");
    expect(r.text).toContain("Claim your Google Business Profile");
    expect(r.text).not.toContain("No finding rule matched");
  });

  it("the Over time page loses the prioritised list in Standard and Enhanced; Basic keeps it", () => {
    expect(get(bluegum, "today").text).toContain("Prioritised by impact");
    expect(get(bluegum, "basic").text).toContain("Prioritised by impact");
    expect(get(bluegum, "standard").text).not.toContain("Prioritised by impact");
    expect(get(bluegum, "enhanced").text).not.toContain("Prioritised by impact");
  });

  it("Enhanced adds Beyond AI answers: five tiles, their dates and the footer sentence; Standard doesn't", () => {
    const enhanced = get(bluegum, "enhanced").text;
    for (const label of [
      "Business identity",
      "YouTube",
      "AI crawlers",
      "Website technical",
      "Your directory profiles",
    ])
      expect(enhanced).toContain(label);
    expect(enhanced).toContain(
      "These checks are separate from the Visibility score and don't change it.",
    );
    expect(enhanced).toMatch(/Linked 1 of \d+ directories AI cites for your questions\./);
    expect(enhanced).toMatch(/checked \d{1,2} [A-Z][a-z]{2} \d{4} · v\d scoring/);
    expect(get(bluegum, "standard").text).not.toContain("What AI can read about you elsewhere");
  });

  it("the method page: the question mix in every tier; the checks row only in Enhanced", () => {
    for (const tier of TIERS) expect(get(bluegum, tier).text).toContain(mix(get(bluegum, tier)));
    expect(get(bluegum, "standard").text).not.toContain("Checks outside AI answers");
    expect(get(bluegum, "enhanced").text).toContain("Checks outside AI answers");
    expect(get(bluegum, "enhanced").text).toMatch(
      /identity [^·]+ · YouTube not linked · crawlers [^·]+ · technical /,
    );
  });

  it("sections are numbered in order", () => {
    for (const tier of TIERS) {
      const eyebrows = [...get(bluegum, tier).text.matchAll(/^(\d\d) · /gm)].map((m) => m[1]);
      expect(eyebrows).toEqual([...eyebrows].sort());
      expect(new Set(eyebrows).size).toBe(eyebrows.length);
    }
  });

  it("the TechCore-like report: findings g and h on cards, i and j as actions, a non-empty What to do next", () => {
    const r = get(kurrajong, "enhanced");
    expect(r.text).toContain("wattle-it.test (27 answers)");
    expect(r.text).toContain(
      "I was unable to find any verified information about a company specifically called Kurrajong IT Solutions",
    );
    expect(r.text).toContain("Local Business Guide");
    expect(r.text).toContain("OTHER ACTIONS FROM THIS AUDIT");
    expect(r.text).not.toContain("No finding rule matched");
  });

  it.each([
    "basic",
    "standard",
  ] as const)("a %s PDF never names another tier, upgrade, a price or a plan", (tier) => {
    for (const spec of REPORT_SEEDS) {
      const all = get(spec, tier).text;
      const others = TIERS.filter((t) => t !== tier).map((t) => t[0].toUpperCase() + t.slice(1));
      for (const word of [
        ...others,
        "Upgrade",
        "upgrade",
        "Growth plan",
        "Agency plan",
        "Agency Pro",
        "Enterprise",
        "$",
      ])
        expect(all, `${spec.key}: ${word}`).not.toContain(word);
    }
  });
});

/** The group labels whose parent block can't break and also holds the group's first item. */
function groupsHeldWithFirstItem(root: ReactNode): string[] {
  const held: string[] = [];
  const textOf = (n: unknown): string => {
    if (typeof n === "string" || typeof n === "number") return String(n);
    if (Array.isArray(n)) return n.map(textOf).join("");
    if (!isValidElement(n)) return "";
    const el = n as ReactElement<{ children?: ReactNode }>;
    if (typeof el.type === "function")
      return textOf((el.type as (p: unknown) => ReactNode)(el.props));
    return textOf(el.props.children);
  };
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) {
      for (const child of n) walk(child);
      return;
    }
    if (!isValidElement(n)) return;
    const el = n as ReactElement<{ children?: ReactNode; wrap?: boolean }>;
    if (typeof el.type === "function") {
      walk((el.type as (p: unknown) => ReactNode)(el.props));
      return;
    }
    if (el.props.wrap === false) {
      const kids = ([] as unknown[]).concat(el.props.children ?? []).filter(isValidElement);
      const first = kids[0] ? textOf(kids[0]) : "";
      if (/^[A-Z ,]+$/.test(first) && kids.length >= 2) held.push(first);
    }
    walk(el.props.children);
  };
  walk(root);
  return held;
}

/**
 * S01B part 6 (LLD amendments 52 and 56; contract v1.5 P09), on the seeds: Method and notes kept whole (b), a strength
 * card without a status pill (c), rule j by cause on the PDF, the audit page and the Action Center item (d), the
 * evidence lines' formatting (e) and rule h quoting a repeated sentence once (f). RED on the parent.
 */
describe("S01B part 6: the review's follow-ups, on the seeds", () => {
  const [bluegum, , kurrajong] = REPORT_SEEDS;
  const seedOf = (spec: SeedSpec) => {
    const s = seeded.find((x) => x.spec.key === spec.key);
    if (!s) throw new Error(`${spec.key} wasn't seeded`);
    return s;
  };
  const auditPage = async (spec: SeedSpec) => {
    const s = seedOf(spec);
    const { serviceDb } = await import("@/db/client");
    const { auditEvidenceActions } = await import("@/lib/reports/audit-findings");
    return auditEvidenceActions(serviceDb, {
      organizationId: s.orgId,
      brandId: s.brandId,
      auditId: s.basisAuditId,
    });
  };
  const actionCenter = async (spec: SeedSpec) => {
    const s = seedOf(spec);
    const { serviceDb } = await import("@/db/client");
    const { findingRecommendations } = await import("@/lib/reports/finding-recommendations");
    return findingRecommendations(serviceDb, {
      organizationId: s.orgId,
      brandId: s.brandId,
      auditId: s.basisAuditId,
    });
  };
  const evidenceText = (f: { evidence: Array<Array<{ text: string }>> }) =>
    f.evidence.map((line) => line.map((p) => p.text).join(""));

  it.each(
    REPORT_SEEDS.flatMap((spec) =>
      (["standard", "enhanced"] as const).map((t) => [spec.key, t, spec] as const),
    ),
  )(
    "b. Method and notes is kept whole, on the last page (%s %s)",
    async (_key, tier, spec) => {
      const r = get(spec, tier);
      const pages = await markPages(r.doc, {
        heading: (t) => t === "How these numbers were measured",
        closing: (t) =>
          t.startsWith("Generated ") && t.includes("Figures come from the audit records"),
      });
      expect(pages.heading).toHaveLength(1);
      expect(pages.closing).toEqual(pages.heading);
      expect(pages.closing).toEqual([r.pageCount]);
    },
    120_000,
  );

  it.each(
    REPORT_SEEDS.map((spec) => [spec.key, spec] as const),
  )("c. a strength card shows its STRENGTH label and no status pill (%s)", (_key, spec) => {
    for (const tier of ["standard", "enhanced"] as const) {
      const lines = get(spec, tier).pages.flat();
      lines.forEach((t, i) => {
        if (t === "STRENGTH")
          expect(["OPEN", "IN PROGRESS", "DONE"], tier).not.toContain(lines[i + 1]);
      });
    }
  });

  it("c. Bluegum's strength card is drawn with its item's STRENGTH pill (the item exists)", () => {
    expect(get(bluegum, "standard").pages.flat()).toContain("STRENGTH");
  });

  it("d. Bluegum (ABN verified, no Google Business Profile): the profile, on the PDF, the audit page and the Action Center", async () => {
    const sentence =
      "Your ABN is active on the Australian Business Register, but no Google Business Profile is linked in brand settings.";
    for (const tier of ["standard", "enhanced"] as const) {
      const text = get(bluegum, tier).text;
      expect(text, tier).toContain("Your Google Business Profile isn't linked yet");
      expect(text, tier).not.toContain("Your business identity isn't verified yet");
      expect(text, tier).toContain(sentence);
    }
    const j = (await auditPage(bluegum)).find((f) => f.rule === "j");
    expect(j?.title).toBe("Your Google Business Profile isn't linked yet");
    expect(j?.explanation).toBe(sentence);
    const item = (await actionCenter(bluegum)).find(
      (r) => r.recommendationKey === "finding-identity-not-verified",
    );
    expect(item?.title).toBe("Link your Google Business Profile");
    expect(item?.action).toBe(`${sentence} Link your Google Business Profile in brand settings.`);
  });

  it("d. Kurrajong (ABN cancelled): its identity, with the ABR's result, and no claim about what AI engines read", async () => {
    const j = (await auditPage(kurrajong)).find((f) => f.rule === "j");
    expect(j?.title).toBe("Your business identity isn't verified yet");
    expect(j?.explanation).toBe(
      "The Australian Business Register lists your ABN as Cancelled, so it isn't verified, and no Google Business Profile is linked in brand settings.",
    );
    const item = (await actionCenter(kurrajong)).find(
      (r) => r.recommendationKey === "finding-identity-not-verified",
    );
    expect(item?.title).toBe("Verify your ABN");
    for (const tier of TIERS)
      expect(get(kurrajong, tier).text, tier).not.toMatch(/AI engines read/i);
    expect(item?.action).not.toMatch(/AI engines read/i);
  });

  it("e. evidence: the ABN in groups, the check's date in words, 'your profile: not linked yet' in lower case", async () => {
    const j = (await auditPage(bluegum)).find((f) => f.rule === "j");
    const lines = j ? evidenceText(j) : [];
    expect(lines[0]).toMatch(
      /^ABN → 51 824 753 557: Active on the ABR · checked \d{1,2} [A-Z][a-z]{2} \d{4}$/,
    );
    expect(lines[1]).toBe("Google Business Profile → not linked yet");
    const text = get(bluegum, "enhanced").text;
    expect(text).not.toContain("ABN → ABN");
    expect(text).not.toMatch(/checked \d{4}-\d{2}-\d{2}/);
    const i = (await auditPage(kurrajong)).find((f) => f.rule === "i");
    expect(i ? evidenceText(i) : []).not.toHaveLength(0);
    for (const line of i ? evidenceText(i) : [])
      expect(line).toMatch(/· your profile: not linked yet$/);
    expect(i?.recommendation.detail).toMatch(/; your profile: not linked yet\.$/);
    for (const spec of REPORT_SEEDS)
      for (const tier of TIERS)
        expect(get(spec, tier).text, `${spec.key} ${tier}`).not.toContain(
          "your profile: Not linked yet",
        );
  });

  it("f. rule h quotes Claude's repeated sentence once, followed by the questions it answered", async () => {
    const quote =
      "I was unable to find any verified information about a company specifically called Kurrajong IT Solutions in Penrith.";
    const h = (await auditPage(kurrajong)).find((f) => f.rule === "h");
    expect(h ? evidenceText(h) : []).toEqual([
      `Claude → “${quote}” · asked “Is Kurrajong IT Solutions reputable?”, “What do customers say about Kurrajong IT Solutions?” and “Does Kurrajong IT Solutions support businesses in Penrith?”`,
    ]);
    // The evidence line quotes it once (on the parent: once per question). Basic's Recommended next and every
    // tier's card sentence quote it too, as before.
    for (const tier of TIERS) {
      const text = get(kurrajong, tier).text;
      expect(text.split(`Claude → “${quote}”`).length - 1, tier).toBe(1);
    }
  });
});
