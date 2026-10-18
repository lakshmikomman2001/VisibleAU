import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { brands } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getBrandForOrg } from "@/lib/brands";
import { reactivateScheduleIfReady } from "@/lib/brands/needs-confirmation";
import { normalizeBrandName } from "@/lib/brands/normalize";
import { assertBrandAccess, BrandAccessDeniedError } from "@/lib/governance";
import { AU_STATES } from "@/lib/constants/au";
import { SUBURB_ENTRY_REGEX } from "@/lib/locations";
import { regeneratePromptPack } from "@/lib/prompts/regenerate-prompt-pack";

const AU_STATE_CODES = AU_STATES.map((s) => s.code) as [string, ...string[]];

const updateBrandSchema = z.object({
  // Vunnara Build 1, Part A: see app/api/brands/route.ts's matching
  // comment -- normalized before length validation, via .pipe.
  name: z.string().transform(normalizeBrandName).pipe(z.string().min(1).max(100)).optional(),
  domain: z.string().min(1).max(253).optional(),
  vertical: z.enum(["tradies", "allied_health", "saas"]).optional(),
  competitors: z.array(z.string()).optional(),
  primaryRegions: z
    .array(z.string().regex(SUBURB_ENTRY_REGEX, "Format: STATE:Suburb (e.g. NSW:Bondi, VIC:Fitzroy)"))
    .optional(),
  // Vunnara Build 1, Part D.4: lets an existing brand (created before
  // location was required) confirm its location from the settings
  // banner, the same structured shape the wizard writes at creation --
  // never a silent default (NO MOCK DATA IN PRODUCTION).
  locationMode: z.enum(["fixed", "online_only"]).optional(),
  suburb: z.string().trim().min(1).max(100).optional(),
  city: z.string().trim().min(1).max(100).optional(),
  state: z.enum(AU_STATE_CODES).optional(),
  country: z.string().trim().min(1).max(100).optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { brandId } = await params;
  if (!z.string().uuid().safeParse(brandId).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await assertBrandAccess(currentUser, brandId);
  } catch (e) {
    if (e instanceof BrandAccessDeniedError)
      return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
    throw e;
  }

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const brand = await getBrandForOrg(brandId, currentUser.organizationId, tx);
    if (!brand) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ brand });
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { brandId } = await params;
  if (!z.string().uuid().safeParse(brandId).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await assertBrandAccess(currentUser, brandId);
  } catch (e) {
    if (e instanceof BrandAccessDeniedError)
      return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
    throw e;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = updateBrandSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const existing = await getBrandForOrg(brandId, currentUser.organizationId, tx);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const [updated] = await tx
      .update(brands)
      .set({
        ...parsed.data,
        // Confirming a location (fixed or online-only) is what makes
        // it count as confirmed -- set once here, next to the fields
        // it describes, not backfilled anywhere else.
        ...(parsed.data.locationMode ? { locationConfirmedAt: new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(eq(brands.id, brandId))
      .returning();

    // Vunnara Build 1, Part E.2: location and/or competitors may have
    // just changed -- regenerate the frozen pack (bumps prompt_pack_
    // version if one already existed; a no-op if this brand still
    // isn't classification+location ready).
    if (
      parsed.data.locationMode !== undefined ||
      parsed.data.suburb !== undefined ||
      parsed.data.city !== undefined ||
      parsed.data.state !== undefined ||
      parsed.data.competitors !== undefined
    ) {
      await regeneratePromptPack(tx, brandId);
    }

    // Build 1 follow-up (entry-point check): this is the location-
    // confirming path -- if the brand is now fully ready (classification
    // was already confirmed), resume any schedule paused on
    // needs_confirmation. See that function's own comment for why this
    // is the only resume path.
    await reactivateScheduleIfReady(tx, updated);

    return NextResponse.json({ brand: updated });
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ brandId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { brandId } = await params;
  if (!z.string().uuid().safeParse(brandId).success) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    await assertBrandAccess(currentUser, brandId);
  } catch (e) {
    if (e instanceof BrandAccessDeniedError)
      return NextResponse.json({ error: "Brand access denied" }, { status: 403 });
    throw e;
  }

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const existing = await getBrandForOrg(brandId, currentUser.organizationId, tx);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await tx
      .update(brands)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(brands.id, brandId));

    return new NextResponse(null, { status: 204 });
  });
}
