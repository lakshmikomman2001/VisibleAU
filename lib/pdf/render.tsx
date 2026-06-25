import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { PdfTheme } from "./theme";

interface EngineStat {
  engine: string;
  total: number;
  mentioned: number;
  avgPosition: number | null;
}

export interface AuditPdfData {
  brandName: string;
  auditNumber: number;
  scoreComposite: number;
  scoreFrequency: number;
  scorePosition: number;
  scoreSentiment: number;
  scoreAccuracy: number;
  scoreConfidenceLow: number | null;
  scoreConfidenceHigh: number | null;
  completedAt: string | null;
  actionItems: Array<{ title: string; action: string }>;
  priorComposite: number | null;
  priorCompletedAt: string | null;
  engineStats: EngineStat[];
}

export interface PdfSections {
  executive: boolean;
  scorecard: boolean;
  engines: boolean;
  actions: boolean;
  methodology: boolean;
}

const ALL_SECTIONS: PdfSections = {
  executive: true,
  scorecard: true,
  engines: true,
  actions: true,
  methodology: false,
};

function fmt(n: number): string {
  return n.toFixed(1);
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function buildExecSummary(data: AuditPdfData): string {
  const parts: string[] = [];

  if (data.priorComposite != null) {
    const delta = data.scoreComposite - data.priorComposite;
    const direction = delta > 0 ? "up" : delta < 0 ? "down" : "unchanged";
    const abs = Math.abs(delta).toFixed(1);
    parts.push(
      `${data.brandName}'s AI visibility is ${fmt(data.scoreComposite)}/100, ${direction} ${abs} points since ${formatDate(data.priorCompletedAt)}.`,
    );
  } else {
    parts.push(`${data.brandName}'s current AI visibility score is ${fmt(data.scoreComposite)}/100.`);
  }

  const dims = [
    { name: "Frequency", val: data.scoreFrequency },
    { name: "Position", val: data.scorePosition },
    { name: "Sentiment", val: data.scoreSentiment },
    { name: "Accuracy", val: data.scoreAccuracy },
  ];

  if (dims.length > 1) {
    const sorted = [...dims].sort((a, b) => b.val - a.val);
    const strongest = sorted[0];
    const weakest = sorted[sorted.length - 1];
    if (strongest.val === weakest.val) {
      parts.push(`All dimensions scored equally (${fmt(strongest.val)}).`);
    } else {
      parts.push(
        `Strongest dimension: ${strongest.name} (${fmt(strongest.val)}). Weakest: ${weakest.name} (${fmt(weakest.val)}).`,
      );
    }
  }

  if (data.actionItems.length > 0) {
    parts.push(`${data.actionItems.length} open recommendation${data.actionItems.length > 1 ? "s" : ""} identified.`);
  }

  return parts.join(" ");
}

function AuditReport({
  data,
  theme,
  sections,
}: {
  data: AuditPdfData;
  theme: PdfTheme;
  sections: PdfSections;
}) {
  const s = StyleSheet.create({
    page: { padding: 40, fontSize: 11, fontFamily: "Helvetica", color: "#333" },
    header: {
      backgroundColor: theme.primaryColor,
      padding: 20,
      marginBottom: 24,
      marginHorizontal: -40,
      marginTop: -40,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    headerText: { color: "#ffffff", fontSize: 16, fontWeight: "bold" },
    headerSub: { color: "rgba(255,255,255,0.7)", fontSize: 10 },
    title: { fontSize: 18, fontWeight: "bold", color: theme.secondaryColor, marginBottom: 4 },
    subtitle: { fontSize: 10, color: "#888", marginBottom: 2 },
    sectionTitle: { fontSize: 12, fontWeight: "bold", color: "#555", marginBottom: 8, marginTop: 16 },
    scoreBox: {
      borderWidth: 1,
      borderColor: "#ddd",
      borderRadius: 4,
      padding: 16,
      marginVertical: 16,
    },
    scoreLabel: { fontSize: 10, fontWeight: "bold", color: "#555", marginBottom: 6 },
    scoreValue: { fontSize: 32, fontWeight: "bold", color: theme.accentColor },
    scoreUnit: { fontSize: 12, color: "#888" },
    ciText: { fontSize: 9, color: "#999", marginTop: 6 },
    dimRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
    dimCard: {
      flex: 1,
      borderWidth: 1,
      borderColor: "#ddd",
      borderRadius: 4,
      padding: 10,
    },
    dimName: { fontSize: 9, color: "#888", marginBottom: 2 },
    dimVal: { fontSize: 14, fontWeight: "bold", color: theme.secondaryColor },
    actionItem: { flexDirection: "row", marginBottom: 6, gap: 6 },
    bullet: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: theme.accentColor,
      marginTop: 3,
    },
    actionTitle: { fontSize: 10, color: "#333", fontWeight: "bold" },
    actionText: { fontSize: 9, color: "#555" },
    execText: { fontSize: 10, color: "#444", lineHeight: 1.5 },
    engineRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
    engineCard: {
      flex: 1,
      borderWidth: 1,
      borderColor: "#ddd",
      borderRadius: 4,
      padding: 10,
    },
    engineName: { fontSize: 9, color: "#888", marginBottom: 2 },
    engineVal: { fontSize: 14, fontWeight: "bold", color: theme.secondaryColor },
    engineSub: { fontSize: 8, color: "#aaa", marginTop: 2 },
    methodText: { fontSize: 9, color: "#666", lineHeight: 1.5, marginBottom: 6 },
    footer: {
      position: "absolute",
      bottom: 20,
      left: 40,
      right: 40,
      fontSize: 8,
      color: "#999",
    },
  });

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <Text style={s.headerText}>{theme.agencyName || data.brandName}</Text>
          <Text style={s.headerSub}>AI Visibility Report</Text>
        </View>

        <Text style={s.title}>Visibility Audit Report</Text>
        <Text style={s.subtitle}>Prepared for: {data.brandName}</Text>
        <Text style={s.subtitle}>
          Generated: {new Date().toLocaleDateString("en-AU")}
        </Text>

        {/* Executive summary */}
        {sections.executive && (
          <View>
            <Text style={s.sectionTitle}>Executive Summary</Text>
            <Text style={s.execText}>{buildExecSummary(data)}</Text>
          </View>
        )}

        {/* Scorecard */}
        {sections.scorecard && (
          <View>
            <View style={s.scoreBox}>
              <Text style={s.scoreLabel}>Composite Visibility Score</Text>
              <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 4 }}>
                <Text style={s.scoreValue}>{fmt(data.scoreComposite)}</Text>
                <Text style={s.scoreUnit}>/ 100</Text>
              </View>
              {data.scoreConfidenceLow != null && data.scoreConfidenceHigh != null && (
                <Text style={s.ciText}>
                  Confidence interval: {data.scoreConfidenceLow.toFixed(0)}–{data.scoreConfidenceHigh.toFixed(0)} (95%)
                </Text>
              )}
            </View>

            <View style={s.dimRow}>
              <View style={s.dimCard}>
                <Text style={s.dimName}>Frequency</Text>
                <Text style={s.dimVal}>{fmt(data.scoreFrequency)}</Text>
              </View>
              <View style={s.dimCard}>
                <Text style={s.dimName}>Position</Text>
                <Text style={s.dimVal}>{fmt(data.scorePosition)}</Text>
              </View>
            </View>
            <View style={s.dimRow}>
              <View style={s.dimCard}>
                <Text style={s.dimName}>Sentiment</Text>
                <Text style={s.dimVal}>{fmt(data.scoreSentiment)}</Text>
              </View>
              <View style={s.dimCard}>
                <Text style={s.dimName}>Accuracy</Text>
                <Text style={s.dimVal}>{fmt(data.scoreAccuracy)}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Per-engine breakdown */}
        {sections.engines && data.engineStats.length > 0 && (
          <View>
            <Text style={s.sectionTitle}>Per-Engine Breakdown</Text>
            {chunkPairs(data.engineStats).map((pair, i) => (
              <View key={`eng-row-${i}`} style={s.engineRow}>
                {pair.map((es) => {
                  const rate = es.total > 0 ? ((es.mentioned / es.total) * 100).toFixed(0) : "0";
                  return (
                    <View key={es.engine} style={s.engineCard}>
                      <Text style={s.engineName}>{es.engine.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</Text>
                      <Text style={s.engineVal}>{rate}%</Text>
                      <Text style={s.engineSub}>
                        mention rate{es.avgPosition != null ? ` · pos ${Number(es.avgPosition).toFixed(1)}` : ""}
                      </Text>
                    </View>
                  );
                })}
                {pair.length === 1 && <View style={s.engineCard} />}
              </View>
            ))}
          </View>
        )}

        {/* Action plan */}
        {sections.actions && (
          <View>
            <Text style={s.sectionTitle}>Action Plan</Text>
            {data.actionItems.length > 0 ? (
              data.actionItems.map((item, i) => (
                <View key={`action-${i}`} style={s.actionItem}>
                  <View style={s.bullet} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.actionTitle}>{item.title}</Text>
                    {item.action ? <Text style={s.actionText}>{item.action}</Text> : null}
                  </View>
                </View>
              ))
            ) : (
              <Text style={s.execText}>No open action items for this brand.</Text>
            )}
          </View>
        )}

        {/* Methodology */}
        {sections.methodology && (
          <View>
            <Text style={s.sectionTitle}>Methodology</Text>
            <Text style={s.methodText}>
              This report measures AI visibility by querying multiple large language models (ChatGPT, Claude, Gemini, Perplexity) with real user-intent prompts relevant to the brand{"'"}s category and region.
            </Text>
            <Text style={s.methodText}>
              Scoring dimensions: Frequency (how often the brand is mentioned, 25%), Position (where in the response, 25%), Sentiment (how positively framed, 20%), Context (recommendation strength, 15%), Accuracy (factual correctness, 15%).
            </Text>
            <Text style={s.methodText}>
              Scores include a 95% Wilson confidence interval accounting for sample size and response variance. Multiple runs per prompt reduce uncertainty.
            </Text>
          </View>
        )}

        <View style={s.footer}>
          <Text>{theme.footerText || "Confidential"}</Text>
          {theme.contactLine ? <Text>{theme.contactLine}</Text> : null}
        </View>
      </Page>
    </Document>
  );
}

function chunkPairs<T>(arr: T[]): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += 2) {
    result.push(arr.slice(i, i + 2));
  }
  return result;
}

export async function renderAuditPdf(
  data: AuditPdfData,
  theme: PdfTheme,
  sections?: Partial<PdfSections>,
): Promise<Buffer> {
  const resolved: PdfSections = { ...ALL_SECTIONS, ...sections };
  return renderToBuffer(<AuditReport data={data} theme={theme} sections={resolved} />);
}
