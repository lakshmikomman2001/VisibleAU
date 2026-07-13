import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { generatedReports } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertBrandAccess, assertTier, BrandAccessDeniedError, TierInsufficientError } from "@/lib/governance";
import { deriveReportStatus } from "@/lib/communication/types";
import { getStorage } from "@/lib/storage";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ brandId: string; reportId: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId, reportId } = await params;
  if (
    !z.string().uuid().safeParse(brandId).success ||
    !z.string().uuid().safeParse(reportId).success
  )
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    await assertBrandAccess(currentUser, brandId);
    await assertTier(currentUser.organizationId, "growth");
  } catch (e) {
    if (e instanceof BrandAccessDeniedError)
      return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
    if (e instanceof TierInsufficientError)
      return NextResponse.json({ error: e.message }, { status: 403 });
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

    if (!report)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    let downloadUrl: string | null = null;
    if (report.pdfUrl) {
      try {
        const storage = getStorage();
        downloadUrl = await storage.getDownloadUrl(report.pdfUrl);
      } catch {
        downloadUrl = null;
      }
    }

    return NextResponse.json({
      ...report,
      pdfUrl: downloadUrl,
      status: deriveReportStatus(report.pdfUrl, report.emailSentAt),
    });
  });
}
