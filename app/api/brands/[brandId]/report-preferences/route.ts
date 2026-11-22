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
import { brandFeaturePlan } from "@/lib/pricing/brand-features";
import { firstIssue, reportPreferencesSchema } from "@/lib/reports/report-contents";
import { buildReportContentsView } from "@/lib/reports/report-contents-view";
import {
  REPORT_CURATION_FROM_TIER,
  ReportContentsError,
  saveReportPreferences,
  workspaceCurates,
} from "@/lib/reports/report-preferences-service";

/**
 * S01 part 5 (LLD 8.1.3, contract P08): the report contents panel's data.
 * GET: what the panel opens with (lib/reports/report-contents-view.ts); `{ enabled: false }` while report_v2 is off.
 * PUT: saves the section toggles, the default report type and the agency's choices (include, order, note).
 * Reports are Growth and up; choices, notes and toggles are Agency and up (Growth may save only the default report
 * type). Below the plan: the app's plan refusal (tierRefusal: 403, code plan_required, which the page's planRefused
 * reads; the S01 prompt's "402" would bypass it); generate_reports (owners, admins, analysts); the brand must be the workspace's.
 * Every read and write runs under the workspace's RLS context.
 */
type Guarded =
  | { refusal: Response; currentUser?: undefined }
  | { refusal?: undefined; currentUser: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>> };

async function guard(brandId: string): Promise<Guarded> {
  const currentUser = await getCurrentUser();
  if (!currentUser)
    return { refusal: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!z.uuid().safeParse(brandId).success)
    return { refusal: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  try {
    await assertBrandAccess(currentUser, brandId);
    await assertTier(currentUser.organizationId, brandFeaturePlan("reports"));
  } catch (e) {
    const denied = brandAccessErrorResponse(e);
    if (denied) return { refusal: denied };
    if (e instanceof TierInsufficientError) return { refusal: tierRefusal(e) };
    throw e;
  }
  return { currentUser };
}

export async function GET(_req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const { currentUser, refusal } = await guard(brandId);
  if (refusal) return refusal;
  const view = await withRlsContext(currentUser.organizationId, (tx) =>
    buildReportContentsView(tx, { organizationId: currentUser.organizationId, brandId }),
  );
  return NextResponse.json(view);
}

export async function PUT(req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const { currentUser, refusal } = await guard(brandId);
  if (refusal) return refusal;
  const forbidden = await roleRefusal(currentUser, "generate_reports");
  if (forbidden) return forbidden;
  if (!(await isEnabled("report_v2", currentUser.organizationId)))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = reportPreferencesSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const curated = await workspaceCurates(tx, currentUser.organizationId);
    const { defaultTier: _tier, ...curation } = parsed.data;
    if (!curated && Object.keys(curation).length > 0)
      return tierRefusal(new TierInsufficientError(REPORT_CURATION_FROM_TIER));
    try {
      const preferences = await saveReportPreferences(tx, {
        organizationId: currentUser.organizationId,
        brandId,
        userId: currentUser.id,
        curated,
        preferences: parsed.data,
      });
      return NextResponse.json({ preferences });
    } catch (e) {
      if (e instanceof ReportContentsError)
        return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }
  });
}
