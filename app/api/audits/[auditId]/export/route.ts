import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, setRlsContext } from "@/db/client";
import { auditExports, audits, brands, citations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { buildGha } from "@/lib/exports/gha";
import { buildJunit } from "@/lib/exports/junit";
import { buildSarif } from "@/lib/exports/sarif";

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
    const html = `<html><body><h1>VisibleAU Audit #${audit.auditNumber}</h1><p>Brand: ${brand?.name}</p><p>Score: ${audit.scoreComposite ?? "N/A"}/100</p><p>Engines: ${(audit.engines ?? []).join(", ")}</p><p>Citations: ${allCitations.length}</p></body></html>`;
    return new Response(html, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="visibleau-audit-${audit.auditNumber}.pdf"`,
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
