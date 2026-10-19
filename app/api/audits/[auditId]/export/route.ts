import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import type { TxClient } from "@/db/client";
import { withRlsContext } from "@/db/client";
import { actionItems, agencyBrandAssets, auditExports, audits, brands, citations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { buildGha } from "@/lib/exports/gha";
import { buildJunit } from "@/lib/exports/junit";
import { buildSarif } from "@/lib/exports/sarif";
import { renderAuditPdf } from "@/lib/pdf/render";
import { assetToTheme } from "@/lib/pdf/theme";
import { displayRecommendationTitle } from "@/lib/recommendations/confidence-labels";
import type { DimensionKey, DimensionResult } from "@/lib/scoring/dimension-result";
import { resolveAuditDimensionsAndHeadline } from "@/lib/scoring/resolve-audit-dimensions";

/**
 * Task #46 (fix: stored value contradicting its own CI): the export
 * route's own read of the shared read-time contract
 * (lib/scoring/resolve-audit-dimensions.ts), mirroring exactly what
 * app/(auth)/audits/[auditId]/page.tsx does -- every dimension's VALUE,
 * CI and scored/insufficient_data state come from the real organic
 * (is_branded_prompt IS NOT TRUE), run_number = 1 citations, never from
 * the stored audits.score_* columns, which can go stale the moment a
 * prod-fix changes which rows count as organic without the audit being
 * re-run. Shared by every export format (pdf, sarif, junit, gha) below
 * so none of them can drift from this gate or from each other.
 */
async function resolveAuditDimensions(
  tx: TxClient,
  auditId: string,
): Promise<{ dimensions: Record<DimensionKey, DimensionResult>; headlineValue: number | null }> {
  // Vunnara (19 Oct, post-aa83b3a): the headline is the Frequency
  // DimensionResult (mention rate), never a blend -- null when there were
  // zero organic answers (insufficient_data "no_answers"), never a
  // fabricated 0.
  const { dimensions, headline } = await resolveAuditDimensionsAndHeadline(tx, auditId);
  return { dimensions, headlineValue: headline.status === "scored" ? headline.value : null };
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
          .select({
            title: actionItems.title,
            action: actionItems.action,
            confidenceBasis: actionItems.confidenceBasis,
          })
          .from(actionItems)
          .where(and(eq(actionItems.auditId, auditId), eq(actionItems.status, "open")))
          // Build 1 addendum, item 1: the PDF's Action Plan must show the
          // same "Check: " framing for a legacy row as the audit page and
          // Action Center -- transformed here, at the source, so
          // lib/pdf/render.tsx never needs to know about confidenceBasis.
          .then((rows) =>
            rows.map((r) => ({
              title: displayRecommendationTitle(r.title, r.confidenceBasis),
              action: r.action,
            })),
          ),
        audit.completedAt
          ? tx
              .select({
                id: audits.id,
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

      // Task #46 (fix: stored value contradicting its own CI): the real
      // DimensionResults, not a trust-the-stored-columns-as-plain-numbers
      // read. audit.scoreComposite/scoreConfidenceLow/scoreConfidenceHigh
      // are a snapshot written once at audit-completion time, never
      // recomputed -- resolveAuditDimensionsAndHeadline recomputes the
      // headline (Frequency / mention rate, never a blend) and its CI
      // honestly from real citations instead, every time this is read.
      // priorComposite gets the identical treatment -- a stale prior
      // value would make the PDF's own trend line (current vs prior) just
      // as dishonest as the headline. A prior audit with zero organic
      // answers (insufficient_data) has no comparable value: null, so the
      // PDF omits the trend sentence rather than diffing against a fake 0.
      const { dimensions, headline, sampleCount, mentionedCount } =
        await resolveAuditDimensionsAndHeadline(tx, auditId);
      const priorHeadline = priorAudit
        ? (await resolveAuditDimensionsAndHeadline(tx, priorAudit.id)).headline
        : null;
      const priorComposite = priorHeadline?.status === "scored" ? priorHeadline.value : null;

      let buffer: Buffer;
      try {
        buffer = await renderAuditPdf(
          {
            brandName: brand?.name ?? "Unknown",
            auditNumber: audit.auditNumber ?? 0,
            headline,
            sampleCount,
            mentionedCount,
            dimensions,
            completedAt: audit.completedAt?.toISOString() ?? null,
            actionItems: items,
            priorComposite,
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
      // Build 1 follow-up (entry-point check): an audit that never ran
      // because its brand needs confirmation is NOT the same thing as
      // one that ran and genuinely found zero mentions -- both would
      // otherwise fall through to resolveAuditDimensions() below and
      // read identically as "insufficient_data" across all three CI
      // formats. Checked via errorCode (a stable Error.name marker set
      // by lib/audit/run-audit-inline.ts / inngest/functions/
      // run-audit.ts's shared catch shape), never by parsing the
      // free-text error message. Still never a failed gate -- SARIF
      // "note", JUnit <skipped>, GHA ::notice:: -- same non-breaking
      // outcome as insufficient_data, with its own distinct wording.
      const auditMetadata = audit.metadata as { errorCode?: string } | null;
      if (audit.status === "failed" && auditMetadata?.errorCode === "BrandNeedsConfirmationError") {
        const message =
          "Audit skipped: this brand hasn't confirmed its business type and location yet.";

        if (format === "sarif") {
          const sarif = {
            $schema: "https://schemastore.azurewebsites.net/schemas/json/sarif-2.1.0.json",
            version: "2.1.0",
            runs: [
              {
                tool: { driver: { name: "VisibleAU", version: "1.0.0", rules: [] } },
                results: [
                  {
                    ruleId: "VA000",
                    level: "note" as const,
                    message: { text: message },
                    locations: [
                      {
                        physicalLocation: {
                          artifactLocation: { uri: `brand/${audit.brandId}`, uriBaseId: "%SRCROOT%" },
                        },
                      },
                    ],
                  },
                ],
                invocations: [{ executionSuccessful: true }],
              },
            ],
          };
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
          const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="VisibleAU Audit" tests="1" failures="0" skipped="1">
  <testsuite name="${brand?.name ?? audit.brandId}" tests="1" failures="0" skipped="1" timestamp="${audit.createdAt.toISOString()}" time="0">
    <testcase name="Audit" classname="audit.skipped" time="0">
      <skipped message="${message}"/>
    </testcase>
  </testsuite>
</testsuites>`;
          await trackExport(tx, auditId, currentUser.organizationId, "junit", xml.length);
          return new Response(xml, {
            headers: {
              "Content-Type": "application/xml",
              "Content-Disposition": `attachment; filename="audit-${auditId}-junit.xml"`,
            },
          });
        }

        // format === "gha"
        const txt = `::notice title=Audit skipped::${message}`;
        await trackExport(tx, auditId, currentUser.organizationId, "gha", txt.length);
        return new Response(txt, {
          headers: {
            "Content-Type": "text/plain",
            "Content-Disposition": `attachment; filename="audit-${auditId}-gha.txt"`,
          },
        });
      }

      const { dimensions, headlineValue } = await resolveAuditDimensions(tx, auditId);

      if (format === "sarif") {
        const sarif = buildSarif({
          id: audit.id,
          brandId: audit.brandId,
          dimensions,
          // buildSarif's input type requires string | number but never
          // reads this field (results are keyed off `dimensions`) -- ""
          // for a zero-answer audit rather than a fabricated 0.
          scoreComposite: headlineValue ?? "",
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
