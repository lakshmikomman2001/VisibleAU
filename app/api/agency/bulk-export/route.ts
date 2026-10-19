import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { audits, brands, bulkOperations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
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
    const csvRows: string[] = [
      "Brand,Domain,Vertical,Audit Number,Audit Date,Visibility score (mention rate),Frequency,Position,Sentiment,Source citation",
    ];
    for (const row of auditRows) {
      const brand = brandMap.get(row.brandId);
      if (!brand) continue;
      const auditDate = row.completedAt ? row.completedAt.toISOString().split("T")[0] : "";
      const resolved = resolvedByAuditId.get(row.auditId);
      const headline = resolved?.headline.status === "scored" ? resolved.headline.value : "";
      const frequency = resolved?.frequency.status === "scored" ? resolved.frequency.value : "";
      const position = resolved?.position.status === "scored" ? resolved.position.value : "";
      const accuracy = resolved?.accuracy.status === "scored" ? resolved.accuracy.value : "";
      csvRows.push(
        `"${brand.name}","${brand.domain}","${brand.vertical ?? ""}",${row.auditNumber ?? ""},"${auditDate}",${headline},${frequency},${position},,${accuracy}`,
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
        "Content-Disposition": `attachment; filename="visibleau-export-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  });
}
