import { NextResponse } from "next/server";
import { withRlsContext } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getBrandForOrg } from "@/lib/brands";
import { isEnabled } from "@/lib/flags/flags";
import { assertBrandAccess, brandAccessErrorResponse } from "@/lib/governance";
import { canPerformAction, isOrgRole } from "@/lib/governance/permissions";
import { enginesForTier } from "@/lib/llm/tier-engines";
import { effectiveTier } from "@/lib/pricing/effective-tier";
import { questionAgencyName } from "@/lib/questions/agency-name";
import { getQuestionLimits } from "@/lib/questions/limits";
import { ensureTemplateSuggestions, loadQuestionsView } from "@/lib/questions/questions-view";
import { isUuid } from "@/lib/validation/uuid";

/**
 * S02 part 4 (LLD 8.2.2, 13; contract P02 view mode): GET /api/brands/:id/questions -- the whole Questions tab in one
 * request: the current set with each question's last result, the version history, the library, the suggestions and
 * the limits. Behind question_library (off: 404, as if the route didn't exist). Any member of the workspace with
 * access to the brand may read it; a brand in another workspace is 404. Every read under the workspace's RLS context.
 * Suggestions are made the first time they're asked for (ensureTemplateSuggestions), except on Free, which has none.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { brandId } = await params;
  if (!isUuid(brandId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await isEnabled("question_library", currentUser.organizationId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    await assertBrandAccess(currentUser, brandId);
  } catch (e) {
    const denied = brandAccessErrorResponse(e);
    if (denied) return denied;
    throw e;
  }
  return withRlsContext(currentUser.organizationId, async (tx) => {
    const brand = await getBrandForOrg(brandId, currentUser.organizationId, tx);
    if (!brand) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const plan = await effectiveTier(tx, currentUser.organizationId);
    const suggestionsShown = plan !== "free";
    const input = { brandId, organizationId: currentUser.organizationId };
    if (suggestionsShown) await ensureTemplateSuggestions(tx, input);
    const view = await loadQuestionsView(tx, input);
    const canEdit =
      isOrgRole(currentUser.role) && canPerformAction(currentUser.role, "edit_brand_data");
    // S03 part 4 (LLD 8.3.1): editing is behind agency_questions; the counts and what the plan allows come from the
    // same limits the apply route enforces (lib/questions/limits.ts).
    const limits = await getQuestionLimits(tx, currentUser.organizationId, brandId);
    const agencyQuestions = await isEnabled("agency_questions", currentUser.organizationId);
    return NextResponse.json({
      ...view,
      suggestions: suggestionsShown ? view.suggestions : [],
      brandName: brand.name,
      agencyName: await questionAgencyName(tx, currentUser.organizationId, brandId),
      limits: {
        plan,
        engines: [...enginesForTier(plan)],
        suggestionsShown,
        canEdit,
        editable: agencyQuestions && canEdit && plan !== "free",
        everydayAllowed: limits.everydayAllowed,
        everydayMin: limits.everydayMin,
        maxBranded: limits.maxBrandedQuestions,
        canWriteQuestions: limits.canWriteQuestions,
      },
    });
  });
}
