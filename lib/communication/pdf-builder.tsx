import { renderToBuffer } from "@react-pdf/renderer";
import { fetchAgencyLogo } from "@/lib/reports/agency-branding";
import { registerReportFonts } from "@/lib/reports/pdf/fonts";
import { ReportDocument } from "@/lib/reports/pdf/report-document";
import type { ReportData } from "@/lib/reports/report-data";

/**
 * DEMO-BLOCKER (1 Nov), part 4 -- the report PDF: the approved seven-page
 * design (lib/reports/pdf/report-document.tsx), built only from ReportData
 * (lib/reports/report-data.ts: the audit page's own numbers for one named
 * audit), in Fraunces, Inter and JetBrains Mono from the bundled TTFs. The
 * agency's logo is fetched once, at render time, within 5 s; without it the
 * cover draws the agency's initials.
 */
export async function buildReportPdf(data: ReportData): Promise<Buffer> {
  registerReportFonts();
  const logo = await fetchAgencyLogo(data.agency.logoUrl);
  return renderToBuffer(<ReportDocument data={data} logo={logo} />);
}

export { ReportDocument };
