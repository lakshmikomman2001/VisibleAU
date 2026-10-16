import { and, count, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { TxClient } from "@/db/client";
import { withRlsContext } from "@/db/client";
import {
  actionItems,
  agencyBrandAssets,
  auditExports,
  audits,
  brands,
  citations,
} from "@/db/schema";
import { ORGANIC_ONLY } from "@/lib/audit/organic-filter";
import { getCurrentUser } from "@/lib/auth/current-user";
import { buildGha } from "@/lib/exports/gha";
import { buildJunit } from "@/lib/exports/junit";
import { buildSarif } from "@/lib/exports/sarif";
import { renderAuditPdf } from "@/lib/pdf/render";
import { assetToTheme } from "@/lib/pdf/theme";
import type { DimensionKey, DimensionResult } from "@/lib/scoring/dimension-result";
import { resolveComposite, resolveDimension } from "@/lib/scoring/dimension-result";
import { wilsonCI, wilsonCIFromScore } from "@/lib/scoring/wilson";

/**
 * Task #46 Phase 2, Part 2: the export route's own read of the Phase 1
 * insufficient-data contract (lib/scoring/dimension-result.ts), mirroring
 * exactly what app/(auth)/audits/[auditId]/page.tsx does -- the TRUE
 * independent-sample mention count (organic, run_number = 1), not the
 * stored audits.score* columns' own notion of "mentioned", decides
 * whether Position/Sentiment/Context/Source-citation are real
 * measurements or insufficient_data. Shared by every export format (pdf,
 * sarif, junit, gha) below so none of them can drift from this gate or
 * from each other.
 */
async function resolveAuditDimensions(
  tx: TxClient,
  auditId: string,
  audit: {
    scoreFrequency: string | null;
    scorePosition: string | null;
    scoreSentimentNumeric: string | null;
    scoreContextNumeric: string | null;
    scoreAccuracy: string | null;
  },
): Promise<Record<DimensionKey, DimensionResult>> {
  const [{ distinctSampleCount, distinctMentionedCount, distinctAccWithSourcesCount }] = await tx
    .select({
      distinctSampleCount: count(),
      distinctMentionedCount: sql<number>`COALESCE(SUM(CASE WHEN brand_mentioned = true THEN 1 ELSE 0 END), 0)`,
      distinctAccWithSourcesCount: sql<number>`COALESCE(SUM(CASE WHEN brand_mentioned = true AND jsonb_array_length(cited_sources) > 0 THEN 1 ELSE 0 END), 0)`,
    })
    .from(citations)
    .where(and(eq(citations.auditId, auditId), ORGANIC_ONLY, eq(citations.runNumber, 1)));

  // Postgres SUM() surfaces as a string over the wire -- coerce before any
  // `=== 0` comparison inside resolveDimension (the exact Phase 1 bug: a
  // string "0" is never === the number 0). distinctSampleCount is a plain
  // count() and is already a real number.
  const sampleCount = distinctSampleCount;
  const mentionedCount = Number(distinctMentionedCount);
  const accWithSourcesCount = Number(distinctAccWithSourcesCount);

  const frequency = resolveDimension(
    Number(audit.scoreFrequency ?? 0),
    wilsonCI(mentionedCount, sampleCount),
    mentionedCount,
    { alwaysScored: true },
  );
  const position = resolveDimension(
    Number(audit.scorePosition ?? 0),
    wilsonCIFromScore(Number(audit.scorePosition ?? 0), mentionedCount),
    mentionedCount,
  );
  const sentiment = resolveDimension(
    Number(audit.scoreSentimentNumeric ?? 0),
    wilsonCIFromScore(Number(audit.scoreSentimentNumeric ?? 0), mentionedCount),
    mentionedCount,
  );
  const context = resolveDimension(
    Number(audit.scoreContextNumeric ?? 0),
    wilsonCIFromScore(Number(audit.scoreContextNumeric ?? 0), mentionedCount),
    mentionedCount,
  );
  const accuracy = resolveDimension(
    Number(audit.scoreAccuracy ?? 0),
    wilsonCI(accWithSourcesCount, mentionedCount),
    mentionedCount,
  );

  return { frequency, position, sentiment, context, accuracy };
}

export async function GET(req: Request, { params }: { params: Promise<{ auditId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { auditId } = await params;
  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "json";

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const [audit] = await tx
      .select()
      .from(audits)
      .where(and(eq(audits.id, auditId), eq(audits.organizationId, currentUser.organizationId)));
    if (!audit) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const [brand] = await tx.select().from(brands).where(eq(brands.id, audit.brandId));
    const allCitations = await tx.select().from(citations).where(eq(citations.auditId, auditId));

    if (format === "csv") {
      const header =
        "audit_number,brand_name,engine,prompt,run_number,brand_mentioned,position,sentiment_label,context_label,response_snippet,cited_sources_domains,llm_model,llm_cost_usd,created_at";
      const rows = allCitations.map((c) => {
        const domains =
          (c.citedSources as Array<{ domain: string }>)?.map((s) => s.domain).join("|") ?? "";
        const snippet = (c.responseSnippet ?? "")
          .slice(0, 200)
          .replace(/\n/g, " ")
          .replace(/"/g, '""');
        return `${audit.auditNumber},"${brand?.name ?? ""}",${c.engine},"${c.prompt.replace(/"/g, '""')}",${c.runNumber},${c.brandMentioned},${c.position ?? ""},${c.sentimentLabel ?? ""},${c.contextLabel ?? ""},"${snippet}","${domains}",${c.llmModel ?? ""},${c.llmCostUsd ?? ""},${c.createdAt.toISOString()}`;
      });
      const csv = [header, ...rows].join("\n");
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="visibleau-audit-${audit.auditNumber}.csv"`,
        },
      });
    }

    if (format === "pdf") {
      const sectionsParam = url.searchParams.get("sections");
      const sectionKeys = sectionsParam ? sectionsParam.split(",") : null;
      const pdfSections = sectionKeys
        ? {
            executive: sectionKeys.includes("executive"),
            scorecard: sectionKeys.includes("scorecard"),
            engines: sectionKeys.includes("engines"),
            actions: sectionKeys.includes("actions"),
            methodology: sectionKeys.includes("methodology"),
          }
        : undefined;

      const [brandAsset] = await tx
        .select()
        .from(agencyBrandAssets)
        .where(
          and(
            eq(agencyBrandAssets.organizationId, currentUser.organizationId),
            eq(agencyBrandAssets.brandId, audit.brandId),
          ),
        );
      const [orgAsset] = brandAsset
        ? [brandAsset]
        : await tx
            .select()
            .from(agencyBrandAssets)
            .where(
              and(
                eq(agencyBrandAssets.organizationId, currentUser.organizationId),
                isNull(agencyBrandAssets.brandId),
              ),
            );
      const theme = assetToTheme(orgAsset ?? null);

      const [items, priorAudits, engineStatsRaw] = await Promise.all([
        tx
          .select({ title: actionItems.title, action: actionItems.action })
          .from(actionItems)
          .where(and(eq(actionItems.auditId, auditId), eq(actionItems.status, "open"))),
        audit.completedAt
          ? tx
              .select({
                scoreComposite: audits.scoreComposite,
                completedAt: audits.completedAt,
              })
              .from(audits)
              .where(
                and(
                  eq(audits.brandId, audit.brandId),
                  eq(audits.status, "complete"),
                  lt(audits.completedAt, audit.completedAt),
                ),
              )
              .orderBy(desc(audits.completedAt))
              .limit(1)
          : Promise.resolve([]),
        tx
          .select({
            engine: citations.engine,
            total: sql<number>`COUNT(*)::int`,
            mentioned: sql<number>`SUM(CASE WHEN brand_mentioned THEN 1 ELSE 0 END)::int`,
            avgPosition: sql<
              number | null
            >`ROUND(AVG(CASE WHEN brand_mentioned AND position IS NOT NULL THEN position END)::numeric, 1)`,
          })
          .from(citations)
          .where(eq(citations.auditId, auditId))
          .groupBy(citations.engine),
      ]);

      const priorAudit = priorAudits[0] ?? null;

      // Task #46 Phase 2, Part 2: the real DimensionResults, not a trust-the-
      // stored-columns-as-plain-numbers read. audit.scoreComposite/
      // scoreConfidenceLow/scoreConfidenceHigh are the pre-Phase-1 stored
      // values (a historical zero-mention audit's columns can hold a
      // collapsed [0,0] Wald CI) -- resolveComposite recomputes the
      // composite and its CI honestly from each dimension's own resolved
      // result instead.
      const dimensions = await resolveAuditDimensions(tx, auditId, audit);
      const composite = resolveComposite(dimensions);

      let buffer: Buffer;
      try {
        buffer = await renderAuditPdf(
          {
            brandName: brand?.name ?? "Unknown",
            auditNumber: audit.auditNumber ?? 0,
            composite,
            dimensions,
            completedAt: audit.completedAt?.toISOString() ?? null,
            actionItems: items,
            priorComposite: priorAudit ? Number(priorAudit.scoreComposite ?? 0) : null,
            priorCompletedAt: priorAudit?.completedAt?.toISOString() ?? null,
            engineStats: engineStatsRaw.map((es) => ({
              engine: es.engine,
              total: Number(es.total),
              mentioned: Number(es.mentioned),
              avgPosition: es.avgPosition != null ? Number(es.avgPosition) : null,
            })),
          },
          theme,
          pdfSections,
        );
      } catch (err) {
        console.error("[PDF export] renderAuditPdf failed:", err);
        return NextResponse.json(
          { error: "PDF rendering failed", detail: String(err) },
          { status: 500 },
        );
      }

      await trackExport(tx, auditId, currentUser.organizationId, "pdf", buffer.length);
      return new Response(new Uint8Array(buffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="audit-report-${audit.auditNumber}.pdf"`,
        },
      });
    }

    // Task #46 Phase 2, Part 1: sarif/junit/gha all key off the SAME
    // dimensions record (computed once, shared below) instead of each
    // separately trusting the stored audits.score* columns as plain
    // numbers -- a zero-mention audit's insufficient_data dimensions must
    // read identically (and never as error/failure) across all three CI
    // export formats.
    if (format === "sarif" || format === "junit" || format === "gha") {
      const dimensions = await resolveAuditDimensions(tx, auditId, audit);

      if (format === "sarif") {
        const sarif = buildSarif({
          id: audit.id,
          brandId: audit.brandId,
          dimensions,
          scoreComposite: audit.scoreComposite ?? 0,
          createdAt: audit.createdAt,
        });
        const body = JSON.stringify(sarif, null, 2);
        await trackExport(tx, auditId, currentUser.organizationId, "sarif", body.length);
        return new Response(body, {
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition": `attachment; filename="audit-${auditId}.sarif.json"`,
          },
        });
      }

      if (format === "junit") {
        const xml = buildJunit({
          id: audit.id,
          brandId: audit.brandId,
          brandName: brand?.name,
          dimensions,
          createdAt: audit.createdAt,
        });
        await trackExport(tx, auditId, currentUser.organizationId, "junit", xml.length);
        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Content-Disposition": `attachment; filename="audit-${auditId}-junit.xml"`,
          },
        });
      }

      // format === "gha"
      const txt = buildGha({ dimensions });
      await trackExport(tx, auditId, currentUser.organizationId, "gha", txt.length);
      return new Response(txt, {
        headers: {
          "Content-Type": "text/plain",
          "Content-Disposition": `attachment; filename="audit-${auditId}-gha.txt"`,
        },
      });
    }

    // Default: JSON
    return new Response(JSON.stringify({ audit, brand, citations: allCitations }, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="visibleau-audit-${audit.auditNumber}.json"`,
      },
    });
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function trackExport(
  tx: any,
  auditId: string,
  organizationId: string,
  format: string,
  size: number,
) {
  try {
    await tx
      .insert(auditExports)
      .values({
        auditId,
        organizationId,
        format,
        generatedAt: new Date(),
        fileSizeBytes: size,
        downloadCount: 1,
      })
      .onConflictDoUpdate({
        target: [auditExports.auditId, auditExports.format],
        set: {
          downloadCount: sql`${auditExports.downloadCount} + 1`,
          generatedAt: new Date(),
        },
      });
  } catch {
    // Non-critical — don't block the download
  }
}
