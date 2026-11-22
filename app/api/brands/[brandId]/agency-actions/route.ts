import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { agencyActions } from "@/db/schema";
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
import {
  agencyActionCreateSchema,
  agencyActionUpdateSchema,
  firstIssue,
  MAX_AGENCY_ACTIONS,
} from "@/lib/reports/report-contents";
import {
  countLiveAgencyActions,
  REPORT_CURATION_FROM_TIER,
} from "@/lib/reports/report-preferences-service";

/**
 * S01 part 5 (LLD 8.1.3, contract P08 "Recommended by {agency}"): actions an agency writes for its client's report,
 * never shown as measured. POST adds one, PATCH changes one (by `id`), DELETE archives one (`?id=`; kept, never
 * shown again). Agency and up (below it, the app's plan refusal: 403, code plan_required), generate_reports (owners, admins, analysts), the workspace's own brand, its
 * RLS context; report_v2 off: 404. Titles 5-120 characters, details up to 600, stored as typed (text, never markup).
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
  const forbidden = await roleRefusal(currentUser, "generate_reports");
  if (forbidden) return { refusal: forbidden };
  try {
    await assertBrandAccess(currentUser, brandId);
    await assertTier(currentUser.organizationId, REPORT_CURATION_FROM_TIER);
  } catch (e) {
    const denied = brandAccessErrorResponse(e);
    if (denied) return { refusal: denied };
    if (e instanceof TierInsufficientError) return { refusal: tierRefusal(e) };
    throw e;
  }
  if (!(await isEnabled("report_v2", currentUser.organizationId)))
    return { refusal: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  return { currentUser };
}

async function readBody(req: Request): Promise<unknown | Response> {
  try {
    return await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const { currentUser, refusal } = await guard(brandId);
  if (refusal) return refusal;
  const body = await readBody(req);
  if (body instanceof Response) return body;
  const parsed = agencyActionCreateSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  return withRlsContext(currentUser.organizationId, async (tx) => {
    if ((await countLiveAgencyActions(tx, brandId)) >= MAX_AGENCY_ACTIONS)
      return NextResponse.json(
        { error: `Up to ${MAX_AGENCY_ACTIONS} of your own actions per brand. Archive one first.` },
        { status: 400 },
      );
    const [action] = await tx
      .insert(agencyActions)
      .values({
        organizationId: currentUser.organizationId,
        brandId,
        title: parsed.data.title,
        detail: parsed.data.detail ?? null,
        priority: parsed.data.priority,
        status: parsed.data.status ?? "open",
        position: parsed.data.position ?? null,
        createdBy: currentUser.id,
      })
      .returning();
    return NextResponse.json({ action }, { status: 201 });
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const { currentUser, refusal } = await guard(brandId);
  if (refusal) return refusal;
  const body = await readBody(req);
  if (body instanceof Response) return body;
  const parsed = agencyActionUpdateSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  const { id, ...changes } = parsed.data;
  return withRlsContext(currentUser.organizationId, async (tx) => {
    const [action] = await tx
      .update(agencyActions)
      .set(changes)
      .where(
        and(
          eq(agencyActions.id, id),
          eq(agencyActions.brandId, brandId),
          isNull(agencyActions.archivedAt),
        ),
      )
      .returning();
    if (!action) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ action });
  });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const { brandId } = await params;
  const { currentUser, refusal } = await guard(brandId);
  if (refusal) return refusal;
  const id = new URL(req.url).searchParams.get("id");
  if (!id || !z.uuid().safeParse(id).success)
    return NextResponse.json({ error: "id: an action id" }, { status: 400 });
  return withRlsContext(currentUser.organizationId, async (tx) => {
    const [archived] = await tx
      .update(agencyActions)
      .set({ archivedAt: new Date() })
      .where(
        and(
          eq(agencyActions.id, id),
          eq(agencyActions.brandId, brandId),
          isNull(agencyActions.archivedAt),
        ),
      )
      .returning({ id: agencyActions.id });
    if (!archived) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return new Response(null, { status: 204 });
  });
}
