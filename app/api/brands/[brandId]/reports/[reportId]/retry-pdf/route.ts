import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { generatedReports } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { deriveReportStatus } from "@/lib/communication/types";
import {
  assertBrandAccess,
  assertTier,
  brandAccessErrorResponse,
  TierInsufficientError,
  tierRefusal,
  userCan,
} from "@/lib/governance";
import { inngest } from "@/lib/inngest/client";
import { brandFeaturePlan } from "@/lib/pricing/brand-features";

/**
 * URGENT PDF reports (1 Nov), part 2 -- "Try again" on a report whose PDF
 * failed: clears the recorded reason (so the report shows "Generating..."
 * again) and re-sends report/generated, which runs render-report-pdf for
 * this report. Allowed for the roles that can generate reports (RBAC
 * generate_reports: owner, admin, analyst); a viewer gets 403. Only for a
 * report with no PDF that has failed, or has stopped changing (409
 * otherwise, so a click can't start a second render of one in progress).
 */
export async function POST(
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

  // The role from the active membership only (follow-ups from 6e27afc..01a6a8c, part 1).
  if (!(await userCan(currentUser, "generate_reports"))) {
    return NextResponse.json(
      { error: "Only an owner, admin or analyst can create a report's PDF again." },
      { status: 403 },
    );
  }

  const outcome = await withRlsContext(currentUser.organizationId, async (tx) => {
    const [report] = await tx
      .select({
        pdfUrl: generatedReports.pdfUrl,
        emailSentAt: generatedReports.emailSentAt,
        pdfFailureReason: generatedReports.pdfFailureReason,
        updatedAt: generatedReports.updatedAt,
      })
      .from(generatedReports)
      .where(
        and(
          eq(generatedReports.id, reportId),
          eq(generatedReports.brandId, brandId),
          eq(generatedReports.organizationId, currentUser.organizationId),
        ),
      );
    if (!report) return "not_found" as const;
    const status = deriveReportStatus(report.pdfUrl, report.emailSentAt, {
      failureReason: report.pdfFailureReason,
      updatedAt: report.updatedAt,
    });
    if (status !== "failed") return "not_failed" as const;
    await tx
      .update(generatedReports)
      // 14 Nov, part 6: and its recorded cause (migration 0149) -- a new attempt records its own.
      .set({ pdfFailureReason: null, pdfFailureDetail: null, updatedAt: new Date() })
      .where(and(eq(generatedReports.id, reportId), isNull(generatedReports.pdfUrl)));
    return "retrying" as const;
  });

  if (outcome === "not_found") return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (outcome === "not_failed") {
    return NextResponse.json(
      { error: "This report's PDF hasn't failed, so there's nothing to try again." },
      { status: 409 },
    );
  }

  await inngest.send({
    name: "report/generated",
    data: { organizationId: currentUser.organizationId, brandId, reportId },
  });
  return NextResponse.json({ status: "generating" }, { status: 202 });
}
