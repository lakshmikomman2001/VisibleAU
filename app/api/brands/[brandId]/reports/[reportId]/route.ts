import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { generatedReports, subscriptions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { deriveReportStatus } from "@/lib/communication/types";
import { getStorage } from "@/lib/storage";

const GROWTH_PLUS = ["growth", "agency", "agency_pro", "enterprise"];

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

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const [sub] = await tx
      .select({ tier: subscriptions.tier })
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, currentUser.organizationId))
      .limit(1);

    const tier = sub?.tier ?? "free";
    if (!GROWTH_PLUS.includes(tier)) {
      return NextResponse.json(
        { error: "Reports require Growth tier or above" },
        { status: 403 },
      );
    }

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
