/**
 * 2 Nov (Sri's decision) -- the audit export's header: the agency's logo and
 * name, as the report's cover draws them, or "Powered by Vunnara" alone when
 * there's no agency name. The renderer draws what it's given; the plan rule is
 * upstream (lib/branding/agency-assets.ts, loadPrintableAgencyAssets).
 */
import { describe, expect, it } from "vitest";
import { type AuditPdfData, AuditReport, renderAuditPdf } from "@/lib/pdf/render";
import { assetToTheme } from "@/lib/pdf/theme";
import type { AgencyLogo } from "@/lib/reports/agency-branding";
import { collectPdfPages } from "@/tests/helpers/pdf-text";
import { solidPng } from "@/tests/helpers/png";

const NO_MENTIONS = { status: "insufficient_data", reason: "no_mentions" } as const;
const DATA: AuditPdfData = {
  brandName: "Example Plumbing",
  auditNumber: 7,
  headline: { status: "insufficient_data", reason: "no_answers" },
  dimensions: {
    frequency: { status: "insufficient_data", reason: "no_answers" },
    position: NO_MENTIONS,
    sentiment: NO_MENTIONS,
    context: NO_MENTIONS,
    accuracy: NO_MENTIONS,
  },
  sampleCount: 0,
  mentionedCount: 0,
  rankedCount: 0,
  medianPosition: null,
  sourcedCount: 0,
  completedAt: new Date("2026-01-01").toISOString(),
  actionItems: [],
  priorComposite: null,
  priorCompletedAt: null,
  engineStats: [],
};
const SECTIONS = {
  executive: true,
  scorecard: true,
  engines: true,
  actions: true,
  methodology: false,
};
const LOGO: AgencyLogo = { data: solidPng(32, 32, [168, 85, 247]), format: "png" };

function firstPage(theme: ReturnType<typeof assetToTheme>, logo: AgencyLogo | null) {
  return collectPdfPages(
    <AuditReport data={DATA} theme={theme} sections={SECTIONS} logo={logo} />,
  )[0];
}

function hasImage(pdf: Buffer): boolean {
  return /\/Subtype\s*\/Image/.test(pdf.toString("latin1"));
}

describe("the audit export's header", () => {
  it("no agency name: 'Powered by Vunnara' alone, and the brand is still on 'Prepared for'", () => {
    const page = firstPage(assetToTheme(null), null);
    expect(page).toContain("Powered by Vunnara");
    expect(page).toContain("Prepared for: Example Plumbing");
  });

  it("an agency name: the name, and no 'Powered by'", () => {
    const page = firstPage(assetToTheme({ agencyName: "Harbour Agency" }), null);
    expect(page).toContain("Harbour Agency");
    expect(page.join("\n")).not.toContain("Powered by");
  });

  it("draws the logo beside the agency's name", async () => {
    const theme = assetToTheme({ agencyName: "Harbour Agency" });
    expect(hasImage(await renderAuditPdf(DATA, theme, undefined, LOGO))).toBe(true);
  });

  it("without a logo, draws no image: the name alone", async () => {
    const theme = assetToTheme({ agencyName: "Harbour Agency" });
    expect(hasImage(await renderAuditPdf(DATA, theme))).toBe(false);
  });

  it("a logo with no agency name isn't drawn, as on the report's cover", async () => {
    expect(hasImage(await renderAuditPdf(DATA, assetToTheme(null), undefined, LOGO))).toBe(false);
  });
});
