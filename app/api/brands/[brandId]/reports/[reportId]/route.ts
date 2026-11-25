import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { brands, generatedReports } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { reportFileName } from "@/lib/communication/report-file-name";
import {
  reportForPage,
  storageOrNull,
  warnUnavailableLinks,
} from "@/lib/communication/report-view";
import {
  assertBrandAccess,
  assertTier,
  brandAccessErrorResponse,
  TierInsufficientError,
  tierRefusal,
} from "@/lib/governance";
import { brandFeaturePlan } from "@/lib/pricing/brand-features";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ brandId: string; reportId: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId, reportId } = await params;
  if (
    !z.string().uuid().safeParse(brandId).success ||
    !z.string().uuid().safeParse(reportId).success
  )
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await assertBrandAccess(currentUser, brandId);
    await assertTier(currentUser.organizationId, brandFeaturePlan("reports"));
  } catch (e) {
    const denied = brandAccessErrorResponse(e);
    if (denied) return denied;
    if (e instanceof TierInsufficientError) return tierRefusal(e);
    throw e;
  }

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const [report] = await tx
      .select()
      .from(generatedReports)
      .where(
        and(
          eq(generatedReports.id, reportId),
          eq(generatedReports.brandId, brandId),
          eq(generatedReports.organizationId, currentUser.organizationId),
        ),
      );

    if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // S01C part 5a (LLD amendment 64): the download is named for the brand, the report's own tier name and week.
    const [brandRow] = report.pdfUrl
      ? await tx.select({ name: brands.name }).from(brands).where(eq(brands.id, brandId))
      : [];
    const snapshotTier = (report.contentsSnapshot as { tierName?: unknown } | null)?.tierName;
    const view = await reportForPage(
      report,
      report.pdfUrl ? storageOrNull() : null,
      brandRow
        ? reportFileName({
            brandName: brandRow.name,
            tierName: typeof snapshotTier === "string" ? snapshotTier : null,
            periodLabel: report.periodLabel,
          })
        : undefined,
    );
    warnUnavailableLinks("report-detail", [view]);
    return NextResponse.json(view);
  });
}
