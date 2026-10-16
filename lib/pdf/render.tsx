import { Document, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { type Engine, ENGINE_DISPLAY_NAMES } from "@/lib/llm/interface";
import { DIMENSION_LABELS } from "@/lib/scoring/dimension-labels";
import type {
  CompositeResult,
  DimensionKey,
  DimensionResult,
  ScoredDimension,
} from "@/lib/scoring/dimension-result";
import type { PdfTheme } from "./theme";

interface EngineStat {
  engine: string;
  total: number;
  mentioned: number;
  avgPosition: number | null;
}

/**
 * Task #46 Phase 2, Part 2: extends the Phase 1 insufficient-data contract
 * (lib/scoring/dimension-result.ts) to the PDF report -- `composite` and
 * `dimensions` carry the SAME DimensionResult/CompositeResult shape the
 * audit page (app/(auth)/audits/[auditId]/page.tsx) resolves, so a
 * zero-mention audit's Position/Sentiment/Context/Source-citation never
 * render as a fabricated numeric 0 here either. Replaces the old plain
 * `number` score fields entirely (both call sites -- the export route and
 * the pdf-builder preview -- are owned by this same change).
 */
export interface AuditPdfData {
  brandName: string;
  auditNumber: number;
  composite: CompositeResult;
  dimensions: Record<DimensionKey, DimensionResult>;
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
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function dimValueText(result: DimensionResult): string {
  return result.status === "scored" ? fmt(result.value) : "N/A — not mentioned";
}

function buildExecSummary(data: AuditPdfData): string {
  const parts: string[] = [];
  const compositeValue = data.composite.value;

  if (data.priorComposite != null) {
    const delta = compositeValue - data.priorComposite;
    const direction = delta > 0 ? "up" : delta < 0 ? "down" : "unchanged";
    const abs = Math.abs(delta).toFixed(1);
    parts.push(
      `${data.brandName}'s AI visibility is ${fmt(compositeValue)}/100, ${direction} ${abs} points since ${formatDate(data.priorCompletedAt)}.`,
    );
  } else {
    parts.push(`${data.brandName}'s current AI visibility score is ${fmt(compositeValue)}/100.`);
  }

  // Task #46 Phase 2, Part 2: a zero-mention audit's composite literally
  // equals Frequency alone (resolveComposite's "frequency_only" basis) --
  // say so in plain language instead of comparing four dimensions where
  // three are "insufficient_data", which used to read as
  // "All dimensions scored equally (0.0)" and implied a real 5-dimension
  // measurement that never happened.
  if (data.composite.basis === "frequency_only") {
    parts.push("Not mentioned by any AI engine in this audit.");
  } else {
    // Display-only relabel: this dimension measures citation rate (accuracyDimensionScore), not
    // factual correctness. DB column (score_accuracy) and internal key (accuracy) are unchanged —
    // see docs/ops for the Phase 1 writeup.
    const dims = (["frequency", "position", "sentiment", "accuracy"] as DimensionKey[])
      .map((key) => ({ name: DIMENSION_LABELS[key], result: data.dimensions[key] }))
      .filter((d): d is { name: string; result: ScoredDimension } => d.result.status === "scored");

    if (dims.length > 1) {
      const sorted = [...dims].sort((a, b) => b.result.value - a.result.value);
      const strongest = sorted[0];
      const weakest = sorted[sorted.length - 1];
      if (strongest.result.value === weakest.result.value) {
        parts.push(`All dimensions scored equally (${fmt(strongest.result.value)}).`);
      } else {
        parts.push(
          `Strongest dimension: ${strongest.name} (${fmt(strongest.result.value)}). Weakest: ${weakest.name} (${fmt(weakest.result.value)}).`,
        );
      }
    }
  }

  if (data.actionItems.length > 0) {
    parts.push(
      `${data.actionItems.length} open recommendation${data.actionItems.length > 1 ? "s" : ""} identified.`,
    );
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
    sectionTitle: {
      fontSize: 12,
      fontWeight: "bold",
      color: "#555",
      marginBottom: 8,
      marginTop: 16,
    },
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
        <Text style={s.subtitle}>Generated: {new Date().toLocaleDateString("en-AU")}</Text>

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
                <Text style={s.scoreValue}>{fmt(data.composite.value)}</Text>
                <Text style={s.scoreUnit}>/ 100</Text>
              </View>
              {/* Task #46 Phase 2, Part 2: CompositeResult.ci is never null
                  (resolveComposite always returns a real range, Frequency's
                  own Wilson CI at minimum) -- unlike the stored
                  score_confidence_low/high columns this replaces, which can
                  hold a collapsed [0,0] from the pre-Phase-1 Wald CI for a
                  historical zero-mention audit. Always shown, matching the
                  audit page's own unconditional CI line. */}
              <Text style={s.ciText}>
                Confidence interval: {data.composite.ci.lower.toFixed(0)}–
                {data.composite.ci.upper.toFixed(0)} (95%)
              </Text>
              {data.composite.basis === "frequency_only" && (
                <Text style={s.ciText}>Not mentioned by any AI engine in this audit.</Text>
              )}
            </View>

            {/* Task #46 Phase 2, Part 2: when the composite is
                "frequency_only" (zero mention rows), EVERY dimension below
                Frequency is insufficient_data -- showing a 4-card grid of
                "N/A — not mentioned" cards would still visually imply a
                5-dimension breakdown was computed. State it plainly once
                instead, matching the audit page's "Not mentioned" subline. */}
            {data.composite.basis === "frequency_only" ? null : (
              <>
                <View style={s.dimRow}>
                  <View style={s.dimCard}>
                    <Text style={s.dimName}>Frequency</Text>
                    <Text style={s.dimVal}>{dimValueText(data.dimensions.frequency)}</Text>
                  </View>
                  <View style={s.dimCard}>
                    <Text style={s.dimName}>Position</Text>
                    <Text style={s.dimVal}>{dimValueText(data.dimensions.position)}</Text>
                  </View>
                </View>
                <View style={s.dimRow}>
                  <View style={s.dimCard}>
                    <Text style={s.dimName}>Sentiment</Text>
                    <Text style={s.dimVal}>{dimValueText(data.dimensions.sentiment)}</Text>
                  </View>
                  <View style={s.dimCard}>
                    <Text style={s.dimName}>{DIMENSION_LABELS.accuracy}</Text>
                    <Text style={s.dimVal}>{dimValueText(data.dimensions.accuracy)}</Text>
                  </View>
                </View>
              </>
            )}
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
                      <Text style={s.engineName}>
                        {ENGINE_DISPLAY_NAMES[es.engine as Engine] ?? es.engine}
                      </Text>
                      <Text style={s.engineVal}>{rate}%</Text>
                      <Text style={s.engineSub}>
                        mention rate
                        {es.avgPosition != null
                          ? ` · pos ${Number(es.avgPosition).toFixed(1)}`
                          : ""}
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
              This report measures AI visibility by querying multiple large language models
              (ChatGPT, Claude, Gemini, Perplexity) with real user-intent prompts relevant to the
              brand{"'"}s category and region.
            </Text>
            <Text style={s.methodText}>
              Scoring dimensions: Frequency (how often the brand is mentioned, 25%), Position (where
              in the response, 25%), Sentiment (how positively framed, 20%), Context (recommendation
              strength, 15%), Source citation (how often answers that mention you cite a source,
              15%).
            </Text>
            <Text style={s.methodText}>
              Scores include a 95% Wilson confidence interval accounting for sample size and
              response variance. Multiple runs per prompt reduce uncertainty.
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
