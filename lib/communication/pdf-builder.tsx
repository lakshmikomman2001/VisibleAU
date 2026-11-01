import { Document, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { PRODUCT_NAME } from "@/lib/product";
import type { ReportData } from "@/lib/reports/report-data";
import {
  answersLine,
  basisLine,
  basisReasonText,
  citedDirectories,
  coverageLine,
  directoryGapLine,
  directoryLine,
  engineCountLine,
  headlineSentence,
  locationText,
  modelsLine,
  periodFull,
  positionLine,
  sourceLine,
  trendLines,
} from "@/lib/reports/report-format";
import { reportDateTime } from "@/lib/reports/report-period";

/**
 * DEMO-BLOCKER (1 Nov), part 2 -- the report PDF, built only from
 * ReportData (lib/reports/report-data.ts): the audit page's own numbers
 * for one named audit. Every sentence comes from lib/reports/
 * report-format.ts. The archetype, the "source types analysed" count and
 * the "immutable" evidence claim are gone (diag-0111).
 */

const s = StyleSheet.create({
  page: { padding: 40, paddingBottom: 60, fontSize: 10, fontFamily: "Helvetica", color: "#0F172A" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottom: "1px solid #E2E8F0",
    paddingBottom: 8,
    marginBottom: 16,
  },
  product: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  headerRight: { fontSize: 9, color: "#64748B" },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 4 },
  meta: { fontSize: 10, color: "#334155", marginBottom: 2 },
  h2: { fontSize: 13, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 6 },
  line: { fontSize: 10, color: "#334155", lineHeight: 1.5 },
  note: { fontSize: 9, color: "#64748B", lineHeight: 1.4, marginTop: 4 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    fontSize: 8,
    color: "#64748B",
  },
});

function Lines({ lines }: { lines: string[] }) {
  return (
    <View>
      {lines.map((line) => (
        <Text key={line} style={s.line}>
          {line}
        </Text>
      ))}
    </View>
  );
}

function Header({ data }: { data: ReportData }) {
  return (
    <View style={s.header} fixed>
      <Text style={s.product}>{PRODUCT_NAME}</Text>
      <Text style={s.headerRight}>
        {data.agency.name ? `AI Visibility Report · ${data.agency.name}` : "AI Visibility Report"}
      </Text>
    </View>
  );
}

function Footer({ generated }: { generated: string }) {
  return (
    <Text
      style={s.footer}
      fixed
      render={({ pageNumber, totalPages }) =>
        `Generated ${generated} · Page ${pageNumber} of ${totalPages} · Confidential`
      }
    />
  );
}

export function ReportDocument({ data }: { data: ReportData }) {
  const generated = reportDateTime(new Date(data.generatedAt), data.organizationId);
  const location = locationText(data);
  const cited = citedDirectories(data);
  const gap = directoryGapLine(data);
  return (
    <Document title={`AI Visibility Report · ${data.brand.name}`} author={PRODUCT_NAME}>
      <Page size="A4" style={s.page}>
        <Header data={data} />
        <Text style={s.title}>{data.brand.name}</Text>
        {[location, data.brand.vertical].filter(Boolean).length > 0 && (
          <Text style={s.meta}>{[location, data.brand.vertical].filter(Boolean).join(" · ")}</Text>
        )}
        <Text style={s.meta}>{periodFull(data)}</Text>
        <Text style={s.meta}>{basisLine(data)}</Text>
        <Text style={s.note}>{basisReasonText(data)}</Text>

        <Text style={s.h2}>Summary</Text>
        <Text style={s.line}>{headlineSentence(data)}</Text>
        <Text style={s.line}>Engines: {coverageLine(data)}</Text>
        <Text style={s.line}>Per engine: {data.engines.map(engineCountLine).join(" · ")}</Text>

        <Text style={s.h2}>When you're mentioned</Text>
        <Lines
          lines={[
            `Position: ${positionLine(data)}`,
            `Source citation: ${sourceLine(data)}`,
            "Sentiment and context: Not yet measured",
          ]}
        />
        <Footer generated={generated} />
      </Page>

      <Page size="A4" style={s.page}>
        <Header data={data} />
        <Text style={s.h2}>Directories AI cited</Text>
        {cited.length === 0 ? (
          <Text style={s.line}>
            None of your relevant directories were cited in the {data.directories.totalAnswers}{" "}
            answers to everyday customer questions.
          </Text>
        ) : (
          <Lines lines={cited.map((r) => directoryLine(r, data.directories.totalAnswers))} />
        )}
        {gap && <Text style={s.note}>{gap}</Text>}

        <Text style={s.h2}>Over time</Text>
        <Lines lines={trendLines(data)} />
        <Footer generated={generated} />
      </Page>

      <Page size="A4" style={s.page}>
        <Header data={data} />
        <Text style={s.h2}>Method and notes</Text>
        <Lines
          lines={[
            `Questions: ${data.questions.everyday} everyday questions a local customer would ask (they don't name your business) and ${data.questions.branded} branded questions, per engine. Visibility uses the everyday questions only.`,
            `Method: ${data.basis.methodology}. Engines and models: ${modelsLine(data)}.`,
            `Answers: ${answersLine(data)}.`,
            "A mention counts when your business is named in the answer and verified against your business details.",
            "The 95% confidence interval is the range the true rate very likely falls in, given how many answers there are.",
            "Excluded: answers that failed (shown, never counted), branded questions (from the headline), and audits in which a whole engine failed (from comparisons over time).",
            `Data residency: your account data is stored in ${data.residency.accountData}; this report is stored in ${data.residency.reportStorage}.`,
          ]}
        />
        <Footer generated={generated} />
      </Page>
    </Document>
  );
}

export async function buildReportPdf(data: ReportData): Promise<Buffer> {
  return renderToBuffer(<ReportDocument data={data} />);
}
