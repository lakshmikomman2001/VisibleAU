import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, setRlsContext } from "@/db/client";
import { actionItems, agencyBrandAssets, auditExports, audits, brands, citations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { buildGha } from "@/lib/exports/gha";
import { buildJunit } from "@/lib/exports/junit";
import { buildSarif } from "@/lib/exports/sarif";
import { renderAuditPdf } from "@/lib/pdf/render";
import { assetToTheme } from "@/lib/pdf/theme";

export async function GET(req: Request, { params }: { params: Promise<{ auditId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await setRlsContext(db, currentUser.organizationId);

  const { auditId } = await params;
  const url = new URL(req.url);
  const format = url.searchParams.get("format") ?? "json";

  const [audit] = await db
    .select()
    .from(audits)
    .where(and(eq(audits.id, auditId), eq(audits.organizationId, currentUser.organizationId)));
  if (!audit) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [brand] = await db.select().from(brands).where(eq(brands.id, audit.brandId));
  const allCitations = await db.select().from(citations).where(eq(citations.auditId, auditId));

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

    const [brandAsset] = await db
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
      : await db
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
      db
        .select({ title: actionItems.title, action: actionItems.action })
        .from(actionItems)
        .where(and(eq(actionItems.auditId, auditId), eq(actionItems.status, "open"))),
      audit.completedAt
        ? db
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
      db
        .select({
          engine: citations.engine,
          total: sql<number>`COUNT(*)::int`,
          mentioned: sql<number>`SUM(CASE WHEN brand_mentioned THEN 1 ELSE 0 END)::int`,
          avgPosition: sql<number | null>`ROUND(AVG(CASE WHEN brand_mentioned AND position IS NOT NULL THEN position END)::numeric, 1)`,
        })
        .from(citations)
        .where(eq(citations.auditId, auditId))
        .groupBy(citations.engine),
    ]);

    const priorAudit = priorAudits[0] ?? null;

    let buffer: Buffer;
    try {
      buffer = await renderAuditPdf(
        {
          brandName: brand?.name ?? "Unknown",
          auditNumber: audit.auditNumber ?? 0,
          scoreComposite: Number(audit.scoreComposite ?? 0),
          scoreFrequency: Number(audit.scoreFrequency ?? 0),
          scorePosition: Number(audit.scorePosition ?? 0),
          scoreSentiment: Number(audit.scoreSentimentNumeric ?? 0),
          scoreAccuracy: Number(audit.scoreAccuracy ?? 0),
          scoreConfidenceLow: audit.scoreConfidenceLow ? Number(audit.scoreConfidenceLow) : null,
          scoreConfidenceHigh: audit.scoreConfidenceHigh ? Number(audit.scoreConfidenceHigh) : null,
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

    await trackExport(auditId, currentUser.organizationId, "pdf", buffer.length);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="audit-report-${audit.auditNumber}.pdf"`,
      },
    });
  }

  const scores: Record<string, number> = {
    frequency: Number(audit.scoreFrequency ?? 0),
    position: Number(audit.scorePosition ?? 0),
    sentiment: Number(audit.scoreSentimentNumeric ?? 0),
    context: Number(audit.scoreContextNumeric ?? 0),
    accuracy: Number(audit.scoreAccuracy ?? 0),
  };

  if (format === "sarif") {
    const sarif = buildSarif({
      id: audit.id,
      brandId: audit.brandId,
      scores,
      scoreComposite: audit.scoreComposite ?? 0,
      createdAt: audit.createdAt,
    });
    const body = JSON.stringify(sarif, null, 2);
    await trackExport(auditId, currentUser.organizationId, "sarif", body.length);
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
      scores,
      createdAt: audit.createdAt,
    });
    await trackExport(auditId, currentUser.organizationId, "junit", xml.length);
    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml",
        "Content-Disposition": `attachment; filename="audit-${auditId}-junit.xml"`,
      },
    });
  }

  if (format === "gha") {
    const txt = buildGha({ scores });
    await trackExport(auditId, currentUser.organizationId, "gha", txt.length);
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
}

async function trackExport(auditId: string, organizationId: string, format: string, size: number) {
  try {
    await db
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
