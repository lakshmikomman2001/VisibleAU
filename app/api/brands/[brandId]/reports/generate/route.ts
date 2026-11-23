import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isEnabled } from "@/lib/flags/flags";
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
import { reportPreferencesSchema } from "@/lib/reports/report-contents";
import { defaultReportPeriodLabel } from "@/lib/reports/report-data";
import { saveReportPreferences, workspaceCurates } from "@/lib/reports/report-preferences-service";
import { chooseReportTier, tierNotInPlanBody } from "@/lib/reports/report-tier-choice";
import { REPORT_TIERS, type ReportTier } from "@/lib/reports/report-tiers";

const generateSchema = z.object({
  periodLabel: z.string().optional(),
  periodType: z.enum(["weekly", "monthly"]).default("weekly"),
  // S01 part 5 (LLD 8.1.3, P08): what the report contents panel showed when Generate was pressed. While report_v2 is
  // on and the plan curates (Agency and up), it is saved as the brand's choices before the report starts, so the
  // report and the next panel use it. Otherwise it is ignored, as today. The server still picks the basis audit.
  contents: reportPreferencesSchema.optional(),
  // S01 part 8 (LLD 8.1.7, P08.footer): the report type. While report_v2 is on the server checks it against the plan
  // (402 report_tier_not_in_plan above it) and derives the page set from it; none sent means the brand's saved
  // default, else the plan's highest. With report_v2 off it is ignored, as today.
  tier: z.enum(REPORT_TIERS).optional(),
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

  // S01 part 8 (LLD 8.1.7 "Server enforcement", amendment 30): the tier, checked against the workspace's live plan.
  // A tier the plan doesn't include is a limit inside a feature the plan has (reports): 402 with its code, which the
  // panel shows inline (P08.overLimit), and nothing starts. Contents a Basic report doesn't print are dropped.
  let tier: ReportTier | null = null;
  if (await isEnabled("report_v2", currentUser.organizationId)) {
    const requested = parsed.data.tier ?? null;
    const contents = parsed.data.contents;
    const decided = await withRlsContext(currentUser.organizationId, async (tx) => {
      const choice = await chooseReportTier(tx, {
        organizationId: currentUser.organizationId,
        brandId,
        requested,
      });
      if (choice.overLimit) return { refused: tierNotInPlanBody(choice), tier: null };
      const curates =
        choice.tier !== "basic" && (await workspaceCurates(tx, currentUser.organizationId));
      // The tier asked for becomes the brand's default (P08.tier); the panel's choices are saved before the report
      // starts, so the report and the next panel use them (Agency and up, Standard and Enhanced only).
      if (requested !== null || (contents && curates)) {
        await saveReportPreferences(tx, {
          organizationId: currentUser.organizationId,
          brandId,
          userId: currentUser.id,
          curated: curates,
          preferences: {
            ...(curates && contents ? contents : {}),
            ...(requested !== null ? { defaultTier: requested } : {}),
          },
        });
      }
      return { refused: null, tier: choice.tier };
    });
    if (decided.refused) return NextResponse.json(decided.refused, { status: 402 });
    tier = decided.tier;
  }

  await inngest.send({
    name: "trend/aggregated",
    data: {
      brandId,
      organizationId: currentUser.organizationId,
      periodLabel,
      periodType,
      manual: true,
      ...(tier ? { tier } : {}),
    },
  });

  return NextResponse.json(
    { message: "Report generation started", periodLabel, ...(tier ? { tier } : {}) },
    { status: 202 },
  );
}
