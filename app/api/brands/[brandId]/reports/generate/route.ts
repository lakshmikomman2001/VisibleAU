import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  assertBrandAccess,
  assertTier,
  brandAccessErrorResponse,
  roleRefusal,
  TierInsufficientError,
  tierRefusal,
} from "@/lib/governance";
import { inngest } from "@/lib/inngest/client";
import { brandFeaturePlan } from "@/lib/pricing/brand-features";
import { defaultReportPeriodLabel } from "@/lib/reports/report-data";

const generateSchema = z.object({
  periodLabel: z.string().optional(),
  periodType: z.enum(["weekly", "monthly"]).default("weekly"),
});

export async function POST(req: Request, { params }: { params: Promise<{ brandId: string }> }) {
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

  // Team follow-ups, item 10: a report is generated work (the narrative, a PDF in storage) and a document
  // for a client, so a viewer can't start one -- the same rule as Try again (retry-pdf/route.ts).
  const refused = await roleRefusal(currentUser, "generate_reports");
  if (refused) return refused;

  const body = await req.json();
  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const periodType = parsed.data.periodType;
  // 2 Nov follow-up, item 1: with no period chosen (the reports page's
  // button never chooses one), the Sydney week of the audit the report will
  // be based on -- Monday's report is last week's, not "Week 45 (2 – 8 Nov)"
  // with no audit in it yet. A chosen period is kept.
  const periodLabel =
    parsed.data.periodLabel ??
    (await withRlsContext(currentUser.organizationId, (tx) =>
      defaultReportPeriodLabel(tx, {
        organizationId: currentUser.organizationId,
        brandId,
        periodType,
      }),
    ));

  await inngest.send({
    name: "trend/aggregated",
    data: {
      brandId,
      organizationId: currentUser.organizationId,
      periodLabel,
      periodType,
      manual: true,
    },
  });

  return NextResponse.json({ message: "Report generation started", periodLabel }, { status: 202 });
}
