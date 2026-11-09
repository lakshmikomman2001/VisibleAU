import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { generatedReports } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
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

export async function GET(_req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { brandId } = await params;
  if (!z.string().uuid().safeParse(brandId).success)
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
    const storage = hasPdfs ? storageOrNull() : null;
    const withStatus = await Promise.all(reports.map((r) => reportForPage(r, storage)));
    warnUnavailableLinks("reports-list", withStatus);

    return NextResponse.json(withStatus);
  });
}
