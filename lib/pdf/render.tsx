import { Document, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { ENGINE_DISPLAY_NAMES, type Engine } from "@/lib/llm/interface";
import { getOrgTimezone } from "@/lib/platform/org-timezone";
import { DIMENSION_LABELS } from "@/lib/scoring/dimension-labels";
import type { DimensionKey, DimensionResult } from "@/lib/scoring/dimension-result";
import {
  engineAnswerLine,
  type MentionDetailCard,
  positionCard,
  sourceCitationCard,
} from "@/lib/scoring/measured-display";
import type { EngineAnswerCounts } from "@/lib/scoring/resolve-audit-dimensions";
import { formatVisibilityPercent, visibilityDisplay } from "@/lib/scoring/visibility-display";
import type { PdfTheme } from "./theme";

/**
 * Task #46 Phase 2, Part 2 (+ Phase 3, Part C): extends the Phase 1
 * insufficient-data contract (lib/scoring/dimension-result.ts) to the PDF
 * report -- `headline` and `dimensions` carry the SAME DimensionResult
 * shape the audit page (app/(auth)/audits/[auditId]/page.tsx) resolves,
 * so a zero-answer audit's headline never renders as a fabricated
 * numeric 0 here either, and Sentiment/Context -- which have no real
 * classifier behind them at all, Phase 3's addition -- render "Not yet
 * measured" instead of a fabricated score.
 *
 * Vunnara (19 Oct, post-aa83b3a), "the headline is the mention rate":
 * `composite` (a weighted 5-dimension blend, CompositeResult) is gone --
 * `headline` IS the Frequency DimensionResult, never blended with
 * anything else. Both call sites -- the export route and the
 * pdf-builder preview -- are owned by this same change.
 */
export interface AuditPdfData {
  brandName: string;
  auditNumber: number;
  headline: DimensionResult;
  dimensions: Record<DimensionKey, DimensionResult>;
  /** Successful organic answers the headline was computed from (lib/
   * scoring/resolve-audit-dimensions.ts's sampleCount) -- "mentioned in
   * 6 of 37 answers", never implied by the headline value alone. */
  sampleCount: number;
  mentionedCount: number;
  /** Audit #36: the counts Position and Source citation are shown as
   * ("#4", "3 of 3") -- never their 0-100 scores. Same resolver. */
  rankedCount: number;
  medianPosition: number | null;
  sourcedCount: number;
  completedAt: string | null;
  actionItems: Array<{ title: string; action: string }>;
  priorComposite: number | null;
  priorCompletedAt: string | null;
  /** The same per-engine split the headline sums (successful everyday
   * answers, run 1). */
  engineStats: EngineAnswerCounts[];
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

// "Dates show in Sydney time" (23 Oct), item 3 -- toLocaleDateString
// with no timeZone option renders in the SERVER's own ambient
// timezone (typically UTC), labeled with "en-AU" date CONVENTIONS
// (order, separators) but not the "en-AU" timezone -- a real, easy-
// to-miss gap between locale and timezone.
function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: getOrgTimezone(),
  });
}

function dimValueText(result: DimensionResult): string {
  if (result.status === "scored") return fmt(result.value);
  // Task #46 Phase 3, Part C: "not_measured" (Sentiment, Context -- no real
  // classifier exists yet) is a distinct reason from "insufficient_data"
  // (no mention rows to measure from) and gets its own wording here, same
  // as the audit page and the other export formats.
  return result.status === "not_measured" ? "Not yet measured" : "N/A — not mentioned";
}

function mentionDetailCards(data: AuditPdfData): {
  position: MentionDetailCard;
  sourceCitation: MentionDetailCard;
} {
  const counts = {
    mentionedCount: data.mentionedCount,
    rankedCount: data.rankedCount,
    medianPosition: data.medianPosition,
    sourcedCount: data.sourcedCount,
  };
  return { position: positionCard(counts), sourceCitation: sourceCitationCard(counts) };
}

function buildExecSummary(data: AuditPdfData): string {
  const parts: string[] = [];

  // Vunnara (19 Oct, post-aa83b3a), "the headline is the mention rate":
  // insufficient_data here means zero successful organic ANSWERS (not
  // zero mentions -- 0% mentioned among real answers is itself a real,
  // meaningful measurement, handled below). resolveHeadline only ever
  // returns "scored" or "insufficient_data" -- checked positively
  // (`!== "scored"`) rather than negated against "insufficient_data" so
  // TS narrows `data.headline` to ScoredDimension below, not the wider
  // ScoredDimension | NotMeasuredDimension a negative check would leave.
  if (data.headline.status !== "scored") {
    parts.push(
      `No successful answers were collected for ${data.brandName} in this audit, so visibility couldn't be measured.`,
    );
    return parts.join(" ");
  }

  // The audit page's figure ("8%", "3 of 40") -- it used to print "7.5%".
  const visibility = visibilityDisplay(data);

  if (data.priorComposite != null) {
    // Between the two rounded figures, in percentage points.
    const delta = Number(data.headline.value.toFixed(0)) - Number(data.priorComposite.toFixed(0));
    const direction = delta > 0 ? "up" : delta < 0 ? "down" : "unchanged";
    parts.push(
      `${data.brandName} is mentioned in ${visibility.value} of AI answers (${visibility.detail}), ${direction}${delta === 0 ? "" : ` ${Math.abs(delta)} points`} from ${formatVisibilityPercent(data.priorComposite)} on ${formatDate(data.priorCompletedAt)}.`,
    );
  } else {
    parts.push(
      `${data.brandName} is mentioned in ${visibility.value} of AI answers to everyday customer questions (${visibility.detail}).`,
    );
  }

  // Position/Source-citation are only ever measured over the mentions
  // that exist (lib/scoring/dimension-result.ts's "no_mentions" gate,
  // unchanged by this fix) -- zero mentions means both are
  // insufficient_data, so there's nothing to compare here.
  if (data.dimensions.position.status === "insufficient_data") {
    parts.push("Not mentioned by any AI engine in this audit.");
  } else {
    // Audit #36: was "strongest/weakest" by comparing the two 0-100
    // scores (a #4 rank read as "94.0"). Now the counts themselves.
    const { position, sourceCitation } = mentionDetailCards(data);
    const rank =
      position.kind === "measured"
        ? `typically ${position.value} when listed (${position.detail})`
        : "not inside a ranked list";
    parts.push(`When mentioned: ${rank}; ${sourceCitation.line}.`);
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
    dimSub: { fontSize: 8, color: "#888", marginTop: 2 },
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

  // Audit #36: Position / Source citation -- the counts, never a 0-100 score.
  const mentionDetailCard = (name: string, card: MentionDetailCard) => (
    <View style={s.dimCard}>
      <Text style={s.dimName}>{name}</Text>
      <Text style={s.dimVal}>{card.kind === "measured" ? card.value : card.line}</Text>
      {card.kind === "measured" && <Text style={s.dimSub}>{card.detail}</Text>}
      {card.kind === "measured" && card.smallSampleNote && (
        <Text style={s.dimSub}>{card.smallSampleNote}</Text>
      )}
    </View>
  );

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
          Generated: {new Date().toLocaleDateString("en-AU", { timeZone: getOrgTimezone() })}
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
              {/* Vunnara (19 Oct, post-aa83b3a), "the headline is the
                  mention rate": no more weighted blend -- this IS the
                  Frequency DimensionResult, shown as "Visibility". */}
              <Text style={s.scoreLabel}>Visibility</Text>
              {data.headline.status !== "scored" ? (
                <Text style={s.scoreValue}>—</Text>
              ) : (
                <>
                  <Text style={s.scoreValue}>{visibilityDisplay(data).value}</Text>
                  <Text style={s.ciText}>
                    Mentioned in {data.mentionedCount} of {data.sampleCount} answers · 95% CI{" "}
                    {data.headline.ci.lower.toFixed(0)}–{data.headline.ci.upper.toFixed(0)}%
                  </Text>
                </>
              )}
              {data.headline.status !== "scored" && (
                <Text style={s.ciText}>No successful answers to measure in this audit.</Text>
              )}
            </View>

            {/* Vunnara (19 Oct, post-aa83b3a): Frequency moved into the
                Visibility score box above -- this grid is "when you're
                mentioned" detail only (Position/Sentiment/Context/Source
                citation), never shown at all when there's no answer data
                to measure anything from. A scored-but-zero headline (real
                mentions: 0) still shows the grid -- each insufficient_data
                card below already says "N/A — not mentioned" on its own. */}
            {data.headline.status !== "scored" ? null : (
              <>
                <View style={s.dimRow}>
                  {mentionDetailCard(DIMENSION_LABELS.position, mentionDetailCards(data).position)}
                  <View style={s.dimCard}>
                    <Text style={s.dimName}>Sentiment</Text>
                    <Text style={s.dimVal}>{dimValueText(data.dimensions.sentiment)}</Text>
                  </View>
                </View>
                <View style={s.dimRow}>
                  <View style={s.dimCard}>
                    <Text style={s.dimName}>Context</Text>
                    <Text style={s.dimVal}>{dimValueText(data.dimensions.context)}</Text>
                  </View>
                  {mentionDetailCard(
                    DIMENSION_LABELS.accuracy,
                    mentionDetailCards(data).sourceCitation,
                  )}
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
                  // Audit #36: k of n successful everyday answers -- the
                  // same split the headline sums.
                  const line = engineAnswerLine(es);
                  return (
                    <View key={es.engine} style={s.engineCard}>
                      <Text style={s.engineName}>
                        {ENGINE_DISPLAY_NAMES[es.engine as Engine] ?? es.engine}
                      </Text>
                      <Text style={s.engineVal}>{line.rate ?? "—"}</Text>
                      <Text style={s.engineSub}>
                        {line.rate ? `mentioned in ${line.counts} answers` : line.counts}
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
            {/* Vunnara (19 Oct, post-aa83b3a), "the headline is the
                mention rate": the Visibility score above is how often
                AI answers mention the brand when customers ask everyday
                questions -- not a weighted blend of several dimensions.
                Position and Source citation describe how the brand
                appears WHEN it's mentioned; they never change the
                Visibility number itself. */}
            <Text style={s.methodText}>
              The Visibility score is how often AI answers mention the brand in response to everyday
              customer questions — never questions that name the brand directly. Position (where in
              the response) and Source citation (how often a mention cites a source) describe how
              the brand appears when it IS mentioned; they're shown separately and never blended
              into the Visibility score.
            </Text>
            {/* Task #46 Phase 3, Part C: Sentiment and Context are planned
                but have no real classifier behind them yet -- say so
                plainly instead of quoting the old nominal 20%/15% weights,
                which were never backed by real tone/framing analysis
                (see lib/scoring/dimension-result.ts). */}
            <Text style={s.methodText}>
              Sentiment (tone of mentions) and Context (recommended vs. listed) are planned but not
              yet measured, so they're shown as "Not yet measured" above.
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
