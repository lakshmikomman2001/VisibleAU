/**
 * S01 part 8 (LLD 8.1.7 "Public claims", appendix E; N10 plan-claim guard): the pricing page's "Reports" row.
 * - Through lib/pricing/tiers.ts only, from each plan's maxReportTier and reportTierNames: Free and Starter "—",
 *   Growth "Basic and Standard", Agency plans "Basic, Standard and Enhanced, chosen per client report, with your own
 *   names". No tier prices.
 * - Setting-aware: only while report_v2 is on (globally); the footnote says what each tier contains in appendix E's
 *   words. With it off -- and with no database, as in a build without one or a unit test -- the table is today's.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TierComparisonTable } from "@/components/domain/pricing/tier-comparison-table";
import { TIER_DESCRIPTIONS } from "@/lib/reports/report-tiers";
import {
  COMPARISON_ROWS,
  comparisonRows,
  REPORTS_ROW_LABEL,
  reportsFootnote,
  reportsRowValue,
  TIER_DEFINITIONS,
} from "@/lib/pricing/tiers";

const flags = vi.hoisted(() => ({ on: false, calls: [] as Array<[string, string | null]> }));
vi.mock("@/lib/flags/flags", () => ({
  isEnabled: vi.fn(async (flag: string, org: string | null) => {
    flags.calls.push([flag, org]);
    return flags.on;
  }),
}));
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  connection: vi.fn(async () => undefined),
}));

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

const def = (key: string) => {
  const t = TIER_DEFINITIONS.find((d) => d.key === key);
  if (!t) throw new Error(key);
  return t;
};

afterEach(() => {
  flags.on = false;
  flags.calls.length = 0;
  vi.unstubAllEnvs();
});

describe("the Reports row's words come from each plan's report tiers", () => {
  it("Free and Starter —, Growth Basic and Standard, Agency plans all three with their own names", () => {
    expect(reportsRowValue(def("free"))).toBe("—");
    expect(reportsRowValue(def("starter"))).toBe("—");
    expect(reportsRowValue(def("growth"))).toBe("Basic and Standard");
    for (const key of ["agency", "agency_pro", "enterprise"])
      expect(reportsRowValue(def(key))).toBe(
        "Basic, Standard and Enhanced, chosen per client report, with your own names",
      );
  });

  it("follows maxReportTier, not a list of plans: a plan with no reports is —", () => {
    for (const t of TIER_DEFINITIONS)
      expect(reportsRowValue(t) === "—").toBe(t.maxReportTier === null);
  });

  it("no price or plan name in the row or its footnote; the footnote is appendix E's three descriptions", () => {
    const words = [...TIER_DEFINITIONS.map(reportsRowValue), ...reportsFootnote()].join(" ");
    expect(words).not.toMatch(/\$|\bAUD\b|per month|\/mo\b/i);
    for (const t of TIER_DEFINITIONS) expect(words).not.toContain(t.name);
    expect(reportsFootnote()).toEqual([
      `Basic: ${TIER_DESCRIPTIONS.basic}`,
      `Standard: ${TIER_DESCRIPTIONS.standard}`,
      `Enhanced: ${TIER_DESCRIPTIONS.enhanced}`,
    ]);
  });
});

describe("setting-aware: shown only while report_v2 is on", () => {
  it("off: the rows are today's, with no Reports row", () => {
    expect(comparisonRows(null)).toBe(COMPARISON_ROWS);
    expect(comparisonRows(null, { reportTiers: false })).toBe(COMPARISON_ROWS);
  });

  it("on: one Reports row, right after PDF export", () => {
    const rows = comparisonRows(null, { reportTiers: true });
    expect(rows).toHaveLength(COMPARISON_ROWS.length + 1);
    const labels = rows.map((r) => ("label" in r ? r.label : r.feature));
    expect(labels.indexOf(REPORTS_ROW_LABEL)).toBe(labels.indexOf("PDF export") + 1);
  });

  it("the table prints the row and the footnote only when on", () => {
    const off = text(renderToStaticMarkup(<TierComparisonTable showFreeTier />));
    expect(off).not.toContain("chosen per client report");
    expect(off).not.toContain(TIER_DESCRIPTIONS.enhanced);
    const html = renderToStaticMarkup(<TierComparisonTable showFreeTier reportTiers />);
    const on = text(html);
    expect(html).toContain('data-row="value:Reports"');
    expect(on).toContain("Basic and Standard");
    expect(on).toContain(
      "Basic, Standard and Enhanced, chosen per client report, with your own names",
    );
    expect(html).toContain("data-reports-footnote");
    for (const d of Object.values(TIER_DESCRIPTIONS)) expect(on).toContain(d);
  });

  it("the page's loader reads the global report_v2 setting, and nothing without a database", async () => {
    const { loadReportTiersClaim } = await import(
      "@/components/domain/pricing/load-report-tiers-claim"
    );
    vi.stubEnv("DATABASE_URL", "");
    flags.on = true;
    expect(await loadReportTiersClaim()).toBe(false);
    expect(flags.calls).toEqual([]);
    vi.stubEnv("DATABASE_URL", "postgres://unit-test/none");
    expect(await loadReportTiersClaim()).toBe(true);
    expect(flags.calls).toEqual([["report_v2", null]]);
    flags.on = false;
    expect(await loadReportTiersClaim()).toBe(false);
  });
});
