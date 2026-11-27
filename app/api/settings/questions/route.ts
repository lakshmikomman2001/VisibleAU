import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isEnabled } from "@/lib/flags/flags";
import { recordAction, roleRefusal, TierInsufficientError, tierRefusal } from "@/lib/governance";
import { MIN_EVERYDAY_QUESTIONS } from "@/lib/questions/limits";
import { loadQuestionSettings, saveQuestionDefaults } from "@/lib/questions/settings";

/**
 * S03 part 5 (LLD 8.3.4; contract P05): GET /api/settings/questions -- the workspace's question defaults for new brands
 * and one row per brand (one query); PUT { everydayCount, fillWithSuggestions } saves the defaults, which affect new
 * brands only. Owners and admins (manage_brands, the existing settings rule); behind agency_questions (off: 404).
 * Saving is Growth and up (403 plan_required below it: Starter sees the counts only); a count outside 5 and the plan's
 * included number is 422. Under the workspace's RLS context; a save is written to the Audit Trail with it.
 */
async function guard() {
  const currentUser = await getCurrentUser();
  if (!currentUser)
    return { refusal: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!(await isEnabled("agency_questions", currentUser.organizationId))) {
    return { refusal: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  const forbidden = await roleRefusal(currentUser, "manage_brands");
  if (forbidden) return { refusal: forbidden };
  return { currentUser };
}

export async function GET() {
  const { refusal, currentUser } = await guard();
  if (refusal) return refusal;
  return withRlsContext(currentUser.organizationId, async (tx) =>
    NextResponse.json(await loadQuestionSettings(tx, currentUser.organizationId)),
  );
}

const bodySchema = z.object({
  everydayCount: z.number().int(),
  fillWithSuggestions: z.boolean(),
});

export async function PUT(req: Request) {
  const { refusal, currentUser } = await guard();
  if (refusal) return refusal;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  return withRlsContext(currentUser.organizationId, async (tx) => {
    const view = await loadQuestionSettings(tx, currentUser.organizationId);
    if (!view.canWrite) return tierRefusal(new TierInsufficientError("growth"));
    const { everydayCount, fillWithSuggestions } = parsed.data;
    if (everydayCount < MIN_EVERYDAY_QUESTIONS || everydayCount > view.included) {
      return NextResponse.json(
        {
          error: "invalid_count",
          message: `Choose between ${MIN_EVERYDAY_QUESTIONS} and ${view.included} everyday questions.`,
        },
        { status: 422 },
      );
    }
    const unchanged =
      view.defaults.everydayCount === everydayCount &&
      view.defaults.fillWithSuggestions === fillWithSuggestions;
    if (unchanged) return NextResponse.json({ defaults: view.defaults, status: "unchanged" });
    const defaults = await saveQuestionDefaults(tx, currentUser.organizationId, {
      everydayCount,
      fillWithSuggestions,
    });
    await recordAction(
      {
        organizationId: currentUser.organizationId,
        userId: currentUser.id,
        action: "question_defaults_changed",
        resourceType: "question_settings",
        metadata: { before: view.defaults, after: defaults },
      },
      tx,
    );
    return NextResponse.json({ defaults, status: "saved" });
  });
}
