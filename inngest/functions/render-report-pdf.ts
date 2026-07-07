import { desc, eq } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { citationSourceIntelligence, evidenceSnapshots, generatedReports } from "@/db/schema";
import { inngest } from "@/lib/inngest/client";
import { buildReportPdf } from "@/lib/communication/pdf-builder";
import { buildMentionSourceSection } from "@/lib/communication/format-helpers";
import { getStorage } from "@/lib/storage";
import type { ReportSectionData } from "@/lib/communication/pdf-builder";
import type { ReportTone } from "@/lib/communication/types";

export const renderReportPdf = inngest.createFunction(
  {
    id: "render-report-pdf",
    retries: 2,
    concurrency: { limit: 3 },
    triggers: [{ event: "report/generated" }],
  },
  async ({
    event,
    step,
  }: {
    event: {
      data: {
        reportId: string;
        organizationId: string;
        brandId: string;
      };
    };
    step: any;
  }) => {
    const { reportId, organizationId, brandId } = event.data;

    const report = await step.run("load-report", async () => {
      const [row] = await serviceDb
        .select({
          headline: generatedReports.headline,
          narrativeText: generatedReports.narrativeText,
          fanOutSummary: generatedReports.fanOutSummary,
          topicalSummary: generatedReports.topicalSummary,
          mentionSourceSummary: generatedReports.mentionSourceSummary,
          linkedinSummary: generatedReports.linkedinSummary,
          consensusSummary: generatedReports.consensusSummary,
          knowledgePanelSummary: generatedReports.knowledgePanelSummary,
        })
        .from(generatedReports)
        .where(eq(generatedReports.id, reportId))
        .limit(1);

      if (!row) throw new Error(`Report ${reportId} not found`);
      return row;
    });

    const pdfPath = await step.run("render-and-upload", async () => {
      const sections: ReportSectionData[] = [];

      if (report.fanOutSummary) {
        const s = report.fanOutSummary as {
          totalSubQueries?: number;
          coveredCount?: number;
          coveragePercent?: number;
          topUncovered?: string[];
        };
        const total = s.totalSubQueries ?? 0;
        const covered = s.coveredCount ?? 0;
        const pct = s.coveragePercent ?? 0;
        const uncovered = s.topUncovered ?? [];
        let body =
          covered === 0
            ? `None of the ${total} sub-queries mention the brand yet (${pct.toFixed(0)}% coverage).`
            : `${covered} of ${total} sub-queries mention the brand (${pct.toFixed(0)}% coverage).`;
        if (uncovered.length > 0) {
          body += "\n\nTop uncovered queries:\n" + uncovered.map((q) => `  • ${q}`).join("\n");
        }
        sections.push({ title: "Fan-Out Coverage", body });
      }

      if (report.topicalSummary) {
        const s = report.topicalSummary as {
          tcgScore?: number;
          totalGaps?: number;
          highLeverageGaps?: Array<{ topic: string; impact: number }>;
        };
        const total = s.totalGaps ?? 0;
        const score = s.tcgScore ?? 0;
        const high = s.highLeverageGaps ?? [];
        let body = `Topical coverage score: ${score.toFixed(0)}%. ${total} gap${total !== 1 ? "s" : ""} identified.`;
        if (high.length > 0) {
          body +=
            "\n\nHigh-leverage gaps:\n" +
            high.map((g) => `  • ${g.topic} (impact: ${g.impact})`).join("\n");
        }
        sections.push({ title: "Topical Coverage Gaps", body });
      }

      if (report.mentionSourceSummary) {
        const s = report.mentionSourceSummary as {
          mentionRate?: number;
          citationRate?: number;
          ratio?: number | null;
          archetype?: string;
        };
        const body = buildMentionSourceSection(s.archetype ?? "invisible", s.ratio ?? null);
        sections.push({ title: "Mention Source Breakdown", body });
      }

      if (report.linkedinSummary) {
        const s = report.linkedinSummary as {
          presenceScore?: number;
          gaps?: string[];
        };
        let body = `LinkedIn presence score: ${s.presenceScore ?? 0}/100.`;
        if (s.gaps && s.gaps.length > 0) {
          body += "\n\nGaps identified:\n" + s.gaps.map((g) => `  • ${g}`).join("\n");
        }
        sections.push({ title: "LinkedIn Performance", body });
      }

      if (report.consensusSummary) {
        const s = report.consensusSummary as {
          avgScore?: number;
          sourceCount?: number;
        };
        sections.push({
          title: "Cross-Platform Consensus",
          body: `Average consensus score: ${s.avgScore ?? 0}/100 across ${s.sourceCount ?? 0} source${(s.sourceCount ?? 0) !== 1 ? "s" : ""}.`,
        });
      }

      if (report.knowledgePanelSummary) {
        const s = report.knowledgePanelSummary as {
          present?: boolean;
          accurate?: boolean;
          url?: string | null;
        };
        const present = s.present === true;
        const accurate = s.accurate === true;
        if (!(present && accurate)) {
          let body = `Knowledge Panel: ${present ? "present but inaccurate" : "not found"}.`;
          if (s.url) body += `\nPanel URL: ${s.url}`;
          sections.push({ title: "Knowledge Panel Status", body });
        }
      }

      const csiRows = await serviceDb
        .select({
          sourceType: citationSourceIntelligence.sourceType,
          gapSeverity: citationSourceIntelligence.gapSeverity,
        })
        .from(citationSourceIntelligence)
        .where(eq(citationSourceIntelligence.brandId, brandId))
        .orderBy(desc(citationSourceIntelligence.calculatedAt))
        .limit(20);
      if (csiRows.length > 0) {
        const critical = csiRows.filter((r) => r.gapSeverity === "critical");
        let body = `${csiRows.length} source type${csiRows.length !== 1 ? "s" : ""} analysed, ${critical.length} critical gap${critical.length !== 1 ? "s" : ""}.`;
        if (critical.length > 0) {
          body += "\n\nCritical gaps:\n" + critical.map((g) => `  • ${g.sourceType.replace(/_/g, " ")}`).join("\n");
        }
        sections.push({ title: "Source Type Gaps", body });
      }

      const snapCount = await serviceDb
        .select({ id: evidenceSnapshots.id })
        .from(evidenceSnapshots)
        .where(eq(evidenceSnapshots.brandId, brandId))
        .limit(1);
      if (snapCount.length > 0) {
        sections.push({
          title: "Evidence Archive",
          body: "Immutable evidence snapshots are being captured for this brand. These provide a timestamped record of AI responses for compliance and audit purposes.",
        });
      }

      const buffer = await buildReportPdf({
        organizationId,
        headline: report.headline,
        narrativeText: report.narrativeText,
        sections,
        tone: "professional" as ReportTone,
        brandId,
      });

      const path = `${organizationId}/${reportId}.pdf`;
      const storage = getStorage();
      await storage.upload(path, buffer, "application/pdf");

      return path;
    });

    await step.run("set-pdf-url", async () => {
      await serviceDb
        .update(generatedReports)
        .set({ pdfUrl: pdfPath, updatedAt: new Date() })
        .where(eq(generatedReports.id, reportId));
    });

    return { reportId, pdfPath };
  },
);
