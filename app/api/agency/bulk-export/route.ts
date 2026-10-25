import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { audits, brands, bulkOperations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { formatInOrgTimezone } from "@/lib/platform/org-timezone";
import { positionCard, sourceCitationCard } from "@/lib/scoring/measured-display";
import { visibilityDisplay } from "@/lib/scoring/visibility-display";
import { resolveOrganicDimensions } from "@/lib/scoring/resolve-audit-dimensions";

const exportSchema = z.object({
  brandIds: z.array(z.string().uuid()).min(1).max(100),
  dateRange: z
    .object({
      from: z.string().datetime(),
      to: z.string().datetime(),
    })
    .optional(),
});

export async function POST(req: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = exportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { brandIds, dateRange } = parsed.data;

  return withRlsContext(currentUser.organizationId, async (tx) => {
    // Verify all brands belong to the org
    const orgBrands = await tx
      .select({
        id: brands.id,
        name: brands.name,
        domain: brands.domain,
        vertical: brands.vertical,
      })
      .from(brands)
      .where(
        and(eq(brands.organizationId, currentUser.organizationId), inArray(brands.id, brandIds)),
      );

    if (orgBrands.length !== brandIds.length) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const brandMap = new Map(orgBrands.map((b) => [b.id, b]));

    // Default date range: last 30 days
    const fromDate = dateRange
      ? new Date(dateRange.from)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = dateRange ? new Date(dateRange.to) : new Date();

    // Query audits within date range for selected brands
    const auditRows = await tx
      .select({
        auditId: audits.id,
        brandId: audits.brandId,
        auditNumber: audits.auditNumber,
        completedAt: audits.completedAt,
      })
      .from(audits)
      .where(
        and(
          eq(audits.organizationId, currentUser.organizationId),
          inArray(audits.brandId, brandIds),
          gte(audits.completedAt, fromDate),
          lte(audits.completedAt, toDate),
          eq(audits.status, "complete"),
        ),
      )
      .orderBy(desc(audits.completedAt));

    // Task #46 (fix: stored value contradicting its own CI): up to 100
    // brands' recent audits, but one batched aggregate query regardless
    // of count (see lib/scoring/resolve-audit-dimensions.ts's doc
    // comment for the root cause this replaces) -- not the N+1-shaped
    // "hundreds of brands dashboard average" case that stays on stored
    // columns (Part B).
    const resolvedByAuditId = await resolveOrganicDimensions(
      tx,
      auditRows.map((r) => r.auditId),
    );

    // Build CSV
    // Display-only relabel ("Source citation"): this column measures citation rate
    // (accuracyDimensionScore), not factual correctness. DB column (score_accuracy) and internal
    // key (accuracy) are unchanged — see docs/ops for the Phase 1 writeup.
    // Sentiment has no real classifier behind it (lib/scoring/dimension-result.ts)
    // -- left blank rather than exporting a stored value fabricated from mention
    // presence alone.
    // Vunnara (19 Oct, post-aa83b3a): the headline column is the
    // Frequency DimensionResult (mention rate), never a weighted blend --
    // relabelled from "Composite" so the header doesn't claim a blend the
    // value no longer is. Blank when there were zero organic answers
    // (insufficient_data "no_answers"), same as Position/Source citation.
    // Audit #36: Position and Source citation are the counts behind them
    // ("#4", "3 of 3") from lib/scoring/measured-display.ts, never a
    // 0-100 score; blank when there was no mention, "Not ranked" when no
    // mention sat in a list.
    const csvRows: string[] = [
      "Brand,Domain,Vertical,Audit Number,Audit Date,Visibility,Mentioned in,Answers,Position (typical rank when listed),Sentiment,Source citation (mentions linking a source)",
    ];
    for (const row of auditRows) {
      const brand = brandMap.get(row.brandId);
      if (!brand) continue;
      // "Dates show in Sydney time" (23 Oct), item 3 -- was a plain
      // UTC date slice; an audit completed late at night AU time could
      // show as the wrong (earlier) calendar day in the exported CSV.
      const auditDate = row.completedAt
        ? formatInOrgTimezone(new Date(row.completedAt), currentUser.organizationId, "yyyy-MM-dd")
        : "";
      const resolved = resolvedByAuditId.get(row.auditId);
      // The audit page's figure ("8%"), or why there isn't one, plus the
      // counts behind it -- it exported the bare mention rate ("7.5")
      // twice, as "Visibility score" and "Frequency".
      const visibility = visibilityDisplay(resolved);
      const visibilityCell = visibility.band ? visibility.value : visibility.detail;
      const mentioned = resolved ? resolved.mentionedCount : "";
      const answers = resolved ? resolved.sampleCount : "";
      const positionShown = resolved ? positionCard(resolved) : null;
      const sourceShown = resolved ? sourceCitationCard(resolved) : null;
      const position =
        positionShown?.kind === "measured"
          ? positionShown.value
          : positionShown?.kind === "not_ranked"
            ? "Not ranked"
            : "";
      const accuracy = sourceShown?.kind === "measured" ? sourceShown.value : "";
      csvRows.push(
        `"${brand.name}","${brand.domain}","${brand.vertical ?? ""}",${row.auditNumber ?? ""},"${auditDate}","${visibilityCell}",${mentioned},${answers},"${position}",,"${accuracy}"`,
      );
    }

    const csvContent = csvRows.join("\n");

    // Record bulk operation
    await tx.insert(bulkOperations).values({
      organizationId: currentUser.organizationId,
      operationType: "csv_export",
      status: "complete",
      totalBrands: brandIds.length,
      completedBrands: brandIds.length,
      inputParams: {
        brandIds,
        dateRange: { from: fromDate.toISOString(), to: toDate.toISOString() },
      },
      completedAt: new Date(),
    });

    return new Response(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="visibleau-export-${formatInOrgTimezone(new Date(), currentUser.organizationId, "yyyy-MM-dd")}.csv"`,
      },
    });
  });
}
