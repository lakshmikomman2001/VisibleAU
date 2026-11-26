/**
 * S01C part 3 (LLD amendments 61, 62, 64; contract v1.6 P08, P09): the PDF layout on the four seeded businesses
 * (tests/helpers/report-seeds.ts), every tier and report_v2 off, rendered by the real path. Waratah is shaped like the
 * real audit #54 report the review was about.
 * - b. OTHER ACTIONS FROM THIS AUDIT in Inter, only the "· audit #{n}" tag in mono; High, Medium, Low, then newest.
 * - c. Standard and Enhanced run Why, and what to do next; Over time; Beyond AI answers (Enhanced); Method and notes.
 *   Over time is section 06 in both tiers for Waratah. Beyond keeps its tiles together by row.
 * - d. Page counts: Waratah's Enhanced at most 8 pages, Standard and Basic no more than 8.
 * - e. The Google place line names the brand's own suburb and postcode; section 04's table repeats its header on a
 *   continued page and never wraps a name (a type suffix gets its own line); the over-time chart says why a point
 *   isn't compared.
 * The page maps (how full each page is) are measured from the rendered PDFs with scripts/qa/pdf-page-map.ts.
 *
 * (DEV/TEST DB ONLY -- never run against visibleau_prod.)
 */
import { Font } from "@react-pdf/renderer";
import postgres from "postgres";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DIRECTORY_REGISTRY } from "@/lib/directories/registry";
import { registerReportFonts } from "@/lib/reports/pdf/fonts";
import { DIRECTORY_NAME_COLUMN } from "@/lib/reports/pdf/report-document";
import { googlePlaceLine } from "@/lib/reports/report-format";
import { printedRuns } from "@/tests/helpers/pdf-fonts";
import { markPages } from "@/tests/helpers/pdf-page-markers";
import {
  REPORT_SEEDS,
  type SeededReportBrand,
  type SeedSpec,
  seedReportBrand,
  WARATAH,
} from "@/tests/helpers/report-seeds";
import {
  REPORT_VERSIONS,
  type RenderedReport,
  type ReportVersion,
  renderSeededReport,
} from "@/tests/helpers/seeded-report-render";
import { getTestDatabaseUrl } from "@/tests/helpers/test-db-url";

vi.mock("@/lib/reports/enhanced-check-runners", () => ({
  enhancedRunners: () => ({ site: async () => {}, youtube: async () => {} }),
}));

const sql = postgres(getTestDatabaseUrl(), { max: 1 });
const seeded: SeededReportBrand[] = [];
const reports = new Map<string, Record<ReportVersion, RenderedReport>>();

beforeAll(async () => {
  process.env.DATABASE_URL = getTestDatabaseUrl();
  process.env.SERVICE_DATABASE_URL = getTestDatabaseUrl();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  for (const spec of REPORT_SEEDS) {
    const seed = await seedReportBrand(sql, spec);
    seeded.push(seed);
    const byVersion: Partial<Record<ReportVersion, RenderedReport>> = {};
    for (const v of REPORT_VERSIONS) byVersion[v] = await renderSeededReport(sql, seed, v);
    reports.set(spec.key, byVersion as Record<ReportVersion, RenderedReport>);
  }
}, 600_000);

afterAll(async () => {
  for (const seed of seeded) await seed.cleanup();
  await sql.end();
});

const get = (spec: SeedSpec, v: ReportVersion) => {
  const r = reports.get(spec.key)?.[v];
  if (!r) throw new Error(`${spec.key} ${v} wasn't rendered`);
  return r;
};

/** Every element in the document tree, function components called with their props (as the PDF helpers read it). */
function elements(root: ReactNode): ReactElement<Record<string, unknown>>[] {
  const out: ReactElement<Record<string, unknown>>[] = [];
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) {
      for (const c of n) walk(c);
      return;
    }
    if (!isValidElement(n)) return;
    const el = n as ReactElement<Record<string, unknown>>;
    if (typeof el.type === "function") {
      walk((el.type as (p: unknown) => ReactNode)(el.props));
      return;
    }
    out.push(el);
    walk(el.props.children);
  };
  walk(root);
  return out;
}

describe.each(REPORT_SEEDS.map((s) => [s.brandName, s] as const))("%s", (_name, spec) => {
  it("c. Standard and Enhanced: Why, Over time, Beyond AI answers (Enhanced), then Method and notes", () => {
    for (const v of ["standard", "enhanced"] as const) {
      const { text } = get(spec, v);
      const at = (section: string) => text.search(new RegExp(`\\d{2} · ${section}\\n`));
      const why = at("Why, and what to do next");
      const trend = at("Over time");
      const method = at("Method and notes");
      expect(why, v).toBeGreaterThan(-1);
      expect(trend, v).toBeGreaterThan(why);
      expect(method, v).toBeGreaterThan(trend);
      if (v === "enhanced") {
        const beyond = at("Beyond AI answers");
        expect(beyond).toBeGreaterThan(trend);
        expect(method).toBeGreaterThan(beyond);
      }
    }
  });

  it("c. Beyond AI answers keeps its tiles together by row, the heading with the first row", async () => {
    const r = get(spec, "enhanced");
    const pages = await markPages(r.doc, {
      // The section's lede, held in one block with its eyebrow and heading (the eyebrow sits in a row).
      heading: (t) =>
        t === "These checks are separate from the Visibility score and don't change it.",
      identity: (t) => t === "Business identity",
      youtube: (t) => t === "YouTube",
      crawlers: (t) => t === "AI crawlers",
      technical: (t) => t === "Website technical",
    });
    expect(pages.identity).toEqual(pages.heading);
    expect(pages.youtube).toEqual(pages.identity);
    expect(pages.technical).toEqual(pages.crawlers);
  });

  it("b. OTHER ACTIONS: the sentence in Inter, only the audit tag in mono; High, Medium, Low, newest first", () => {
    for (const v of ["standard", "enhanced"] as const) {
      const r = get(spec, v);
      const runs = printedRuns(r.doc as ReactNode, { fontFamily: "Inter", fontWeight: 400 });
      const tags = runs.filter((run) => /^ · audit #\d+$/.test(run.text));
      // S03 part 0 (LLD amendment 76): the code font is JetBrains Mono NL, the build without ligatures.
      for (const tag of tags) expect(tag.fontFamily, `${v}: ${tag.text}`).toBe("JetBrains Mono NL");
      const next = r.data.v2?.whatToDoNext;
      const label = "OTHER ACTIONS FROM THIS AUDIT";
      const start = r.text.indexOf(label);
      if (start < 0) continue;
      const rank: Record<string, number> = { high: 0, medium: 1, low: 2, strength: 3 };
      const shown = (next?.measured ?? []).filter(
        (m) => m.included && r.text.indexOf(m.title, start) > start,
      );
      const order = [...shown].sort(
        (a, b) => r.text.indexOf(a.title, start) - r.text.indexOf(b.title, start),
      );
      const ranks = order.map((m) => rank[m.priority]);
      expect(ranks, v).toEqual([...ranks].sort((a, b) => a - b));
      for (const m of order) {
        const sentence = m.evidence.replace(/ · audit #\d+$/, "");
        const run = runs.find((x) => x.text === sentence);
        expect(run?.fontFamily, `${v}: "${sentence.slice(0, 40)}"`).toBe("Inter");
      }
    }
  });

  it("e. no directory name shares its line with a type suffix", () => {
    for (const v of REPORT_VERSIONS)
      expect(get(spec, v).text).not.toMatch(
        / · (general directory|maps|review site|trades marketplace)\n/,
      );
  });
});

describe("Waratah Home Services (shaped like the real audit #54)", () => {
  it("d. Enhanced fits 8 pages; Standard, Basic and today's no more than 8", () => {
    for (const v of REPORT_VERSIONS) expect(get(WARATAH, v).pageCount, v).toBeLessThanOrEqual(8);
  });

  it("c. Over time is section 06 in Standard and Enhanced, Beyond AI answers 07 in Enhanced", () => {
    expect(get(WARATAH, "standard").text).toContain("06 · Over time\n");
    expect(get(WARATAH, "enhanced").text).toContain("06 · Over time\n");
    expect(get(WARATAH, "enhanced").text).toContain("07 · Beyond AI answers\n");
  });

  it("b. its two other actions: rule j (Medium), then the Wikipedia check's item (Low)", () => {
    for (const v of ["standard", "enhanced"] as const) {
      const { text } = get(WARATAH, v);
      const start = text.indexOf("OTHER ACTIONS FROM THIS AUDIT");
      expect(start, v).toBeGreaterThan(-1);
      const j = text.indexOf("Add your ABN and link your Google Business Profile", start);
      const wiki = text.indexOf("Get covered in local press or on community sites", start);
      expect(j, v).toBeGreaterThan(start);
      expect(wiki, v).toBeGreaterThan(j);
    }
  });

  it("e. the Google section's place line names the brand's own suburb and postcode, every report", () => {
    for (const v of REPORT_VERSIONS)
      expect(get(WARATAH, v).text, v).toMatch(
        /\nLidcombe NSW 2141 · desktop · \d{1,2} [A-Z][a-z]{2} \d{4}\n/,
      );
  });

  it("e. section 04's table continues on the next page with its header row repeated", async () => {
    const r = get(WARATAH, "enhanced");
    const pages = await markPages(r.doc, {
      first: (t) => t === "Yellow Pages",
      last: (t) => t === "StartLocal",
    });
    // The table crosses a page...
    expect(pages.last[0]).toBeGreaterThan(pages.first[0]);
    // ...and its header row is a fixed child of the table's own View, which react-pdf copies into both halves of a
    // split View (@react-pdf/layout splitNodes), so the continued page starts with it.
    const table = elements(r.doc).find(
      (el) =>
        Array.isArray(el.props.children) &&
        (el.props.children as unknown[]).some(
          (c) => isValidElement(c) && (c.props as { fixed?: boolean }).fixed === true,
        ),
    );
    expect(table).toBeDefined();
  });

  it("e. a type suffix is its own muted line under the name", () => {
    const { text } = get(WARATAH, "today");
    expect(text).toContain("Local Business Guide\ngeneral directory");
    expect(text).toContain("Whereis\nmaps");
    expect(text).toContain("Birdeye\nreview site");
  });

  it("e. the over-time chart says why a point isn't compared, under its audit", () => {
    for (const v of REPORT_VERSIONS) {
      const { text } = get(WARATAH, v);
      expect(text, v).toMatch(/Audit #46 · 16 Oct\n○ questions changed/);
      expect(text, v).toMatch(/Audit #47 · 23 Oct\n○ 3 of 4 engines/);
      expect(text, v).toMatch(/Audit #48 · 30 Oct\n4 of 4 engines/);
      expect(text, v).not.toContain("○ 4 of 4 engines");
    }
  });
});

describe("e. the place line's rule", () => {
  const google = (label: string, kind = "postcode") => ({
    labelLine: `${label} · desktop · 21 Nov 2026`,
    location: { kind, label },
  });
  it("the brand's own postcode: suburb, state and postcode", () => {
    expect(googlePlaceLine(google("2161 NSW"), { suburb: "yennora", postcode: "2161" })).toBe(
      "Yennora NSW 2161 · desktop · 21 Nov 2026",
    );
  });
  it("unchanged for an operator's postcode, a suburb or city location, no postcode, or an older snapshot", () => {
    expect(googlePlaceLine(google("2000 NSW"), { suburb: "Yennora", postcode: "2161" })).toBe(
      "2000 NSW · desktop · 21 Nov 2026",
    );
    expect(
      googlePlaceLine(google("Castle Hill NSW", "suburb"), {
        suburb: "Castle Hill",
        postcode: "2154",
      }),
    ).toBe("Castle Hill NSW · desktop · 21 Nov 2026");
    expect(googlePlaceLine(google("2161 NSW"), { suburb: "Yennora", postcode: null })).toBe(
      "2161 NSW · desktop · 21 Nov 2026",
    );
    expect(
      googlePlaceLine(
        { labelLine: "2161 NSW · desktop · 21 Nov 2026" },
        { suburb: "Yennora", postcode: "2161" },
      ),
    ).toBe("2161 NSW · desktop · 21 Nov 2026");
  });
});

describe("e. directory names never wrap", () => {
  it("every registry directory's name fits the table's name column in its font", async () => {
    registerReportFonts();
    const source = Font.getFont({ fontFamily: "Inter", fontWeight: 600 });
    if (!source) throw new Error("Inter 600 isn't registered");
    await source.load();
    const font = source.data as unknown as {
      layout: (s: string) => { advanceWidth: number };
      unitsPerEm: number;
    };
    const size = 11.5 * 0.75; // px(11.5), the table's name style
    const names = [
      ...new Set(
        Object.values(DIRECTORY_REGISTRY)
          .flat()
          .map((d) => d.name),
      ),
    ];
    for (const name of names) {
      const width = (font.layout(name).advanceWidth / font.unitsPerEm) * size;
      expect(width, name).toBeLessThan(DIRECTORY_NAME_COLUMN);
    }
  });
});
