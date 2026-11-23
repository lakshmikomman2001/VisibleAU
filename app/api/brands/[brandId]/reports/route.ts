import { and, desc, eq, getTableColumns, sql } from "drizzle-orm";
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
import { isEnabled } from "@/lib/flags/flags";
import { brandFeaturePlan } from "@/lib/pricing/brand-features";
import { workspaceTierNames } from "@/lib/reports/report-tier-choice";
import { isReportTier } from "@/lib/reports/report-tiers";

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

  // S01 part 9: every column but the contents snapshot (the PDF's render input, which the page never needs and the
  // 4-second poll shouldn't carry), and whether one is stored ("Running checks..." until it is, for Enhanced).
  const { contentsSnapshot: _renderInput, ...listColumns } = getTableColumns(generatedReports);
  return withRlsContext(currentUser.organizationId, async (tx) => {
    const reports = await tx
      .select({
        ...listColumns,
        hasSnapshot: sql<boolean>`${generatedReports.contentsSnapshot} IS NOT NULL`,
        snapshotTierName: sql<string | null>`${generatedReports.contentsSnapshot}->>'tierName'`,
      })
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
    // S01 part 10 (contract P17): each row's report type name, while report_v2 is on -- the name in its snapshot (a
    // later rename never changes it), else the workspace's name for its tier (reports from before tiers are Basic).
    const names = (await isEnabled("report_v2", currentUser.organizationId))
      ? await workspaceTierNames(tx, currentUser.organizationId)
      : null;
    const withStatus = await Promise.all(
      reports.map(async ({ snapshotTierName, ...r }) => ({
        ...(await reportForPage(r, storage)),
        ...(names
          ? {
              tierName:
                snapshotTierName ?? names[isReportTier(r.reportTier) ? r.reportTier : "basic"],
            }
          : {}),
      })),
    );
    warnUnavailableLinks("reports-list", withStatus);

    return NextResponse.json(withStatus);
  });
}
