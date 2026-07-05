import { and, desc, eq } from "drizzle-orm";
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
  { params }: { params: Promise<{ brandId: string }> },
) {
  const currentUser = await getCurrentUser();
  if (!currentUser)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId } = await params;
  if (!z.string().uuid().safeParse(brandId).success)
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

    const reports = await tx
      .select()
      .from(generatedReports)
      .where(
        and(
          eq(generatedReports.brandId, brandId),
          eq(generatedReports.organizationId, currentUser.organizationId),
        ),
      )
      .orderBy(desc(generatedReports.createdAt));

    const hasPdfs = reports.some((r) => r.pdfUrl);
    const storage = hasPdfs ? getStorage() : null;
    const withStatus = await Promise.all(
      reports.map(async (r) => {
        let downloadUrl: string | null = null;
        if (r.pdfUrl && storage) {
          try {
            downloadUrl = await storage.getDownloadUrl(r.pdfUrl);
          } catch {
            downloadUrl = null;
          }
        }
        return {
          ...r,
          pdfUrl: downloadUrl,
          status: deriveReportStatus(r.pdfUrl, r.emailSentAt),
        };
      }),
    );

    return NextResponse.json(withStatus);
  });
}
