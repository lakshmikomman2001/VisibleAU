import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, setRlsContext } from "@/db/client";
import { audits, brands, citations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

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

  // Default: JSON
  return new Response(JSON.stringify({ audit, brand, citations: allCitations }, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="visibleau-audit-${audit.auditNumber}.json"`,
    },
  });
}
