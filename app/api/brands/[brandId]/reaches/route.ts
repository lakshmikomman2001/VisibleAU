import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { QUESTION_REACHES } from "@/db/schema/questions";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isEnabled } from "@/lib/flags/flags";
import {
  assertBrandAccess,
  brandAccessErrorResponse,
  recordAction,
  roleRefusal,
  TierInsufficientError,
  tierRefusal,
} from "@/lib/governance";
import { questionLimitBody } from "@/lib/questions/limits";
import { loadReachSettings, saveReachSettings } from "@/lib/reach/settings";
import { isUuid } from "@/lib/validation/uuid";

/**
 * S04 part 6 (LLD 8.4.7; contract P01.reach): a brand's reaches.
 * - GET: the reaches (Local always on), their places and targets, the plan's reach and everyday limits, suggestions.
 * - PUT `{ reaches: [{ reach, enabled, place?, targetCount }] }`: 200 `{ reaches view, draft }` -- the draft goes to
 *   the Questions tab's edit mode and through the apply flow (P02 -> P04); audits change only once it's applied.
 *   403 plan_required for more reaches than the plan allows; 402 question_limit over the plan's everyday questions;
 *   422 when Local is off, a place doesn't match the business, or a count is too low. lib/reach/settings.ts says why
 *   403 and 402 rather than the sprint's 402 and 422.
 * Behind visibility_reach (off: 404, as if the route didn't exist). Reading needs access to the brand; saving needs
 * manage_brands (owners and admins, contract P01.access). A brand in another workspace is 404. The save is one
 * transaction under the workspace's RLS context, written to the Audit Trail with it.
 */
const placeSchema = z
  .object({
    suburb: z.string().max(120).optional(),
    city: z.string().max(120).optional(),
    state: z.string().max(60).optional(),
    postcode: z.string().max(10).optional(),
    country: z.string().max(60).optional(),
  })
  .strict();
const bodySchema = z.object({
  reaches: z
    .array(
      z.object({
        reach: z.enum(QUESTION_REACHES),
        enabled: z.boolean(),
        place: placeSchema.nullable().optional(),
        targetCount: z.number().int().min(0).max(1000),
      }),
    )
    .min(1)
    .max(QUESTION_REACHES.length),
});

type Access =
  | { ok: false; response: Response }
  | { ok: true; currentUser: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>> };

async function access(brandId: string): Promise<Access> {
  const currentUser = await getCurrentUser();
  if (!currentUser)
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const notFound = {
    ok: false,
    response: NextResponse.json({ error: "Not found" }, { status: 404 }),
  } as const;
  if (!isUuid(brandId)) return notFound;
  if (!(await isEnabled("visibility_reach", currentUser.organizationId))) return notFound;
  try {
    await assertBrandAccess(currentUser, brandId);
  } catch (e) {
    const denied = brandAccessErrorResponse(e);
    if (denied) return { ok: false, response: denied };
    throw e;
  }
  return { ok: true, currentUser };
}

export async function GET(_req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const checked = await access(brandId);
  if (!checked.ok) return checked.response;
  const { currentUser } = checked;
  const packsFlag = await isEnabled("question_packs", currentUser.organizationId);
  const view = await withRlsContext(currentUser.organizationId, (tx) =>
    loadReachSettings(tx, { organizationId: currentUser.organizationId, brandId, packsFlag }),
  );
  if (!view) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(view);
}

export async function PUT(req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const checked = await access(brandId);
  if (!checked.ok) return checked.response;
  const { currentUser } = checked;
  const forbidden = await roleRefusal(currentUser, "manage_brands");
  if (forbidden) return forbidden;

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
  const packsFlag = await isEnabled("question_packs", currentUser.organizationId);

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const result = await saveReachSettings(tx, {
      organizationId: currentUser.organizationId,
      brandId,
      userId: currentUser.id,
      updates: parsed.data.reaches,
      packsFlag,
    });
    if (!result.ok) {
      if (result.status === 404) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (result.status === 403) return tierRefusal(new TierInsufficientError(result.requiredPlan));
      if (result.status === 402)
        return NextResponse.json(questionLimitBody(result.error), { status: 402 });
      return NextResponse.json(
        { error: "invalid_reaches", message: result.message },
        { status: 422 },
      );
    }
    await recordAction(
      {
        organizationId: currentUser.organizationId,
        userId: currentUser.id,
        action: "brand_reaches_changed",
        resourceType: "brand",
        resourceId: brandId,
        metadata: {
          reaches: result.view.reaches
            .filter((r) => r.enabled)
            .map((r) => ({ reach: r.reach, targetCount: r.targetCount })),
        },
      },
      tx,
    );
    return NextResponse.json({ ...result.view, draft: result.draft });
  });
}
