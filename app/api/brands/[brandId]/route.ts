import { and, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { auditSchedules, brands, reportDeliverySchedules } from "@/db/schema";
import { verticalEnum } from "@/db/schema/enums";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getBrandForOrg } from "@/lib/brands";
import { MAX_COMPARISON_COMPETITORS } from "@/lib/brands/competitor-limits";
import { competitorWebsitesToStore } from "@/lib/brands/competitor-websites";
import { reactivateScheduleIfReady } from "@/lib/brands/needs-confirmation";
import { normalizeBrandName } from "@/lib/brands/normalize";
import { AU_STATES } from "@/lib/constants/au";
import { assertBrandAccess, brandAccessErrorResponse, roleRefusal } from "@/lib/governance";
import { SUBURB_ENTRY_REGEX } from "@/lib/locations";
import { regeneratePromptPack } from "@/lib/prompts/regenerate-prompt-pack";

/** What a deleted brand's audit schedule says it was paused for (shown on the schedule pages). */
const BRAND_DELETED_REASON = "Brand deleted";

const AU_STATE_CODES = AU_STATES.map((s) => s.code) as [string, ...string[]];

const updateBrandSchema = z.object({
  // Vunnara Build 1, Part A: see app/api/brands/route.ts's matching
  // comment -- normalized before length validation, via .pipe.
  name: z.string().transform(normalizeBrandName).pipe(z.string().min(1).max(100)).optional(),
  domain: z.string().min(1).max(253).optional(),
  // 13 Nov (part 2): every stored vertical -- a Professional services or Real estate brand's Save sent its own
  // vertical back and was refused (400), so nothing on its form could be saved.
  vertical: z.enum(verticalEnum.enumValues).optional(),
  // "Cap competitor comparisons", item 2 -- see app/api/brands/
  // route.ts's matching comment.
  competitors: z
    .array(z.string())
    .max(MAX_COMPARISON_COMPETITORS, `Maximum ${MAX_COMPARISON_COMPETITORS} competitors`)
    .optional(),
  primaryRegions: z
    .array(
      z.string().regex(SUBURB_ENTRY_REGEX, "Format: STATE:Suburb (e.g. NSW:Bondi, VIC:Fitzroy)"),
    )
    .optional(),
  // Vunnara Build 1, Part D.4: lets an existing brand (created before
  // location was required) confirm its location from the settings
  // banner, the same structured shape the wizard writes at creation --
  // never a silent default (NO MOCK DATA IN PRODUCTION).
  locationMode: z.enum(["fixed", "online_only"]).optional(),
  suburb: z.string().trim().min(1).max(100).optional(),
  // Vunnara hotfix (18 Oct, post-df27ef8): nullable -- the location-
  // confirm card sends city: null explicitly when the typed suburb
  // isn't in the curated lib/locations list, so a re-confirmation with
  // a different, also-uncurated suburb correctly clears any stale
  // city from a previous save rather than leaving it untouched.
  city: z.string().trim().min(1).max(100).nullable().optional(),
  state: z.enum(AU_STATE_CODES).optional(),
  country: z.string().trim().min(1).max(100).optional(),
  // Fair competitor counting (7 Nov): { "<competitor name>": "<website>" }; an empty value removes
  // it. Normalised and kept to this brand's competitors below (lib/brands/competitor-websites.ts).
  competitorWebsites: z.record(z.string().max(100), z.string().max(253)).optional(),
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
    const denied = brandAccessErrorResponse(e);
    if (denied) return denied;
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
    const denied = brandAccessErrorResponse(e);
    if (denied) return denied;
    throw e;
  }
  const forbidden = await roleRefusal(currentUser, "manage_brands");
  if (forbidden) return forbidden;

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

    // Websites are kept for the competitors the brand has after this change: a removed or renamed
    // competitor's website goes with it.
    const { competitorWebsites: websiteChanges, ...fields } = parsed.data;
    const websites = competitorWebsitesToStore(
      fields.competitors ?? existing.competitors,
      existing.competitorWebsites,
      websiteChanges,
    );
    if (!websites.ok) {
      return NextResponse.json({ error: `competitorWebsites: ${websites.error}` }, { status: 400 });
    }

    const [updated] = await tx
      .update(brands)
      .set({
        ...fields,
        competitorWebsites: websites.websites,
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
      parsed.data.competitors !== undefined ||
      // 13 Nov (part 2): the pack's questions name the brand ("Is herohomeservices a good choice for ...?"),
      // so a rename regenerates them too.
      (parsed.data.name !== undefined && parsed.data.name !== existing.name)
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
    const denied = brandAccessErrorResponse(e);
    if (denied) return denied;
    throw e;
  }
  const forbidden = await roleRefusal(currentUser, "delete_brand");
  if (forbidden) return forbidden;

  return withRlsContext(currentUser.organizationId, async (tx) => {
    const existing = await getBrandForOrg(brandId, currentUser.organizationId, tx);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const now = new Date();
    await tx.update(brands).set({ deletedAt: now, updatedAt: now }).where(eq(brands.id, brandId));
    // Team follow-ups, item 7: its schedules stop with it, in this transaction. Nothing in the app
    // restores a deleted brand; one restored by hand finds them paused, saying why, until resumed.
    await tx
      .update(auditSchedules)
      .set({ status: "paused", pausedReason: BRAND_DELETED_REASON, updatedAt: now })
      .where(and(eq(auditSchedules.brandId, brandId), ne(auditSchedules.status, "paused")));
    await tx
      .update(reportDeliverySchedules)
      .set({ isActive: false, updatedAt: now })
      .where(
        and(
          eq(reportDeliverySchedules.brandId, brandId),
          eq(reportDeliverySchedules.isActive, true),
        ),
      );

    return new NextResponse(null, { status: 204 });
  });
}
