import { eq } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { generatedReports } from "@/db/schema";
import { inngest } from "@/lib/inngest/client";
import { buildReportPdf } from "@/lib/communication/pdf-builder";
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
        const archetype = s.archetype ?? "invisible";
        const QUADRANT: Record<string, { label: string; meaning: string; action: string }> = {
          recognised_authority: { label: "recognised authority", meaning: "AI engines both mention and cite the brand", action: "maintain and defend the position" },
          known_but_untrusted: { label: "known but untrusted", meaning: "the brand is mentioned but rarely cited as a source", action: "fix content structure so AI engines trust and cite it" },
          niche_authority: { label: "niche authority", meaning: "the brand is cited when it appears, but mention volume is low", action: "expand prompt coverage to surface in more queries" },
          invisible: { label: "invisible", meaning: "the brand is neither mentioned nor cited", action: "a full GEO strategy to establish presence" },
        };
        const q = QUADRANT[archetype] ?? QUADRANT.invisible;
        const ratioText = s.ratio == null ? "N/A (brand not mentioned)" : Number(s.ratio).toFixed(2);
        const body =
          `The brand sits in the ${q.label} quadrant — ${q.meaning}. ` +
          `Mention-to-citation ratio: ${ratioText}. ` +
          `Priority: ${q.action}.`;
        sections.push({ title: "Mention Source Breakdown", body });
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
