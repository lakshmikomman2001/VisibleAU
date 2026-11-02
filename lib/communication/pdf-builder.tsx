import { renderToBuffer } from "@react-pdf/renderer";
import { loadAgencyLogo } from "@/lib/reports/agency-logo-loader";
import { registerReportFonts } from "@/lib/reports/pdf/fonts";
import {
  BrandingPreviewDocument,
  type BrandingPreviewProps,
  ReportDocument,
} from "@/lib/reports/pdf/report-document";
import type { ReportData } from "@/lib/reports/report-data";

/**
 * DEMO-BLOCKER (1 Nov), part 4 -- the report PDF: the approved seven-page
 * design (lib/reports/pdf/report-document.tsx), built only from ReportData
 * (lib/reports/report-data.ts: the audit page's own numbers for one named
 * audit), in Fraunces, Inter and JetBrains Mono from the bundled TTFs. The
 * agency's logo is read once, at render time -- an uploaded one from
 * storage, a web address within 5 s (lib/reports/agency-logo-loader.ts);
 * without it the cover draws the agency's initials.
 */
export async function buildReportPdf(data: ReportData): Promise<Buffer> {
  registerReportFonts();
  const logo = await loadAgencyLogo(data.agency.logoUrl);
  return renderToBuffer(<ReportDocument data={data} logo={logo} />);
}

/**
 * 2 Nov -- Settings -> Report branding's preview: the report's own cover top
 * bar and page footer (the same components), drawn with the values being
 * edited, as a one-page PDF.
 */
export async function buildBrandingPreviewPdf(
  input: Omit<BrandingPreviewProps, "logo"> & { logoUrl: string | null },
): Promise<Buffer> {
  registerReportFonts();
  const logo = await loadAgencyLogo(input.logoUrl);
  return renderToBuffer(
    <BrandingPreviewDocument agency={input.agency} brandName={input.brandName} logo={logo} />,
  );
}

export { ReportDocument };
