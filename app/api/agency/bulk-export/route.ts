import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { db, setRlsContext } from "@/db/client";
import { audits, brands, bulkOperations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

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

  await setRlsContext(db, currentUser.organizationId);

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

  // Verify all brands belong to the org
  const orgBrands = await db
    .select({ id: brands.id, name: brands.name, domain: brands.domain, vertical: brands.vertical })
    .from(brands)
    .where(
      and(
        eq(brands.organizationId, currentUser.organizationId),
        inArray(brands.id, brandIds),
      ),
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
  const auditRows = await db
    .select({
      brandId: audits.brandId,
      auditNumber: audits.auditNumber,
      scoreComposite: audits.scoreComposite,
      scoreFrequency: audits.scoreFrequency,
      scorePosition: audits.scorePosition,
      scoreSentiment: audits.scoreSentimentNumeric,
      scoreAccuracy: audits.scoreAccuracy,
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

  // Build CSV
  const csvRows: string[] = [
    "Brand,Domain,Vertical,Audit Number,Audit Date,Composite,Frequency,Position,Sentiment,Accuracy",
  ];
  for (const row of auditRows) {
    const brand = brandMap.get(row.brandId);
    if (!brand) continue;
    const auditDate = row.completedAt
      ? row.completedAt.toISOString().split("T")[0]
      : "";
    csvRows.push(
      `"${brand.name}","${brand.domain}","${brand.vertical ?? ""}",${row.auditNumber ?? ""},"${auditDate}",${row.scoreComposite ?? ""},${row.scoreFrequency ?? ""},${row.scorePosition ?? ""},${row.scoreSentiment ?? ""},${row.scoreAccuracy ?? ""}`,
    );
  }

  const csvContent = csvRows.join("\n");

  // Record bulk operation
  await db
    .insert(bulkOperations)
    .values({
      organizationId: currentUser.organizationId,
      operationType: "csv_export",
      status: "completed",
      totalBrands: brandIds.length,
      completedBrands: brandIds.length,
      inputParams: { brandIds, dateRange: { from: fromDate.toISOString(), to: toDate.toISOString() } },
      completedAt: new Date(),
    });

  return new Response(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="visibleau-export-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
