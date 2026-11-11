import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { brands } from "@/db/schema";
import { type CurrentUser, getCurrentUser } from "@/lib/auth/current-user";
import {
  type BrandingFields,
  brandingRefusal,
  canManageBranding,
  loadAgencyAssetRows,
  loadScopeRow,
  logoUrlAllowed,
  orgHasReportBranding,
  removeBrandOverride,
  saveAgencyBranding,
} from "@/lib/branding/agency-assets";
import { assertBrandAccess, brandAccessErrorResponse, recordAction } from "@/lib/governance";
import { DEFAULT_REPORT_COLOURS } from "@/lib/pdf/theme";
import { resolveAgencyBranding } from "@/lib/reports/agency-branding";

/**
 * 2 Nov ("where does Sri set the agency name and logo for the report
 * cover?", part 3) -- Account -> Report branding's API.
 *
 * GET ?brandId=: the agency name a brand's reports print (the brand's own,
 * else the workspace's) and whether this workspace's plan has report branding
 * -- for the reports page's "add your agency name" hint. Any member who can
 * see the brand.
 * PUT: saves one scope -- the workspace (brandId null) or one brand's
 * override -- in place. DELETE ?brandId=: removes a brand's override.
 * Both on an Agency plan only, by owners and admins only (RBAC
 * manage_branding), checked here, and written to the audit trail.
 */

const text = (max: number) => z.union([z.string().max(max), z.null()]).optional();
const colour = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, `a colour like ${DEFAULT_REPORT_COLOURS.primaryColor}`)
  .optional();

const saveSchema = z.object({
  brandId: z.string().uuid().nullable().default(null),
  agencyName: text(100),
  logoUrl: text(500),
  footerText: text(200),
  contactLine: text(200),
  primaryColor: colour,
  secondaryColor: colour,
  accentColor: colour,
});

function clean(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

async function brandInWorkspace(organizationId: string, brandId: string): Promise<boolean> {
  return withRlsContext(organizationId, async (tx) => {
    const [brand] = await tx
      .select({ id: brands.id })
      .from(brands)
      .where(
        and(
          eq(brands.id, brandId),
          eq(brands.organizationId, organizationId),
          isNull(brands.deletedAt),
        ),
      );
    return Boolean(brand);
  });
}

async function audit(
  currentUser: CurrentUser,
  brandId: string | null,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await recordAction({
      organizationId: currentUser.organizationId,
      userId: currentUser.id,
      action: "report_branding_changed",
      resourceType: "report_branding",
      resourceId: brandId ?? "workspace",
      metadata: { scope: brandId ? "brand" : "workspace", ...metadata },
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "report_branding_audit_failed",
        organizationId: currentUser.organizationId,
        reason: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

export async function GET(req: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const brandId = new URL(req.url).searchParams.get("brandId");
  if (brandId !== null) {
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
  }

  const organizationId = currentUser.organizationId;
  const { available, rows } = await withRlsContext(organizationId, async (tx) => {
    const onPlan = await orgHasReportBranding(tx, organizationId);
    return {
      available: onPlan,
      rows: onPlan
        ? await loadAgencyAssetRows(tx, organizationId, brandId)
        : { workspace: null, brand: null },
    };
  });
  const effective = resolveAgencyBranding(rows.brand, rows.workspace);
  return NextResponse.json({
    agencyName: effective.name,
    logoSet: effective.logoUrl !== null,
    canEdit: available && (await canManageBranding(currentUser)),
    available,
  });
}

export async function PUT(req: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const refusal = await brandingRefusal(currentUser);
  if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
      .join("; ");
    return NextResponse.json({ error: message }, { status: 400 });
  }
  const { brandId, primaryColor, secondaryColor, accentColor } = parsed.data;
  const organizationId = currentUser.organizationId;
  if (brandId && !(await brandInWorkspace(organizationId, brandId))) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }
  if (brandId && (primaryColor || secondaryColor || accentColor)) {
    return NextResponse.json(
      { error: "Colours are set for the whole workspace, not per brand" },
      { status: 400 },
    );
  }

  const fields: BrandingFields = {
    agencyName: clean(parsed.data.agencyName),
    logoUrl: clean(parsed.data.logoUrl),
    footerText: clean(parsed.data.footerText),
    contactLine: clean(parsed.data.contactLine),
  };

  // A brand's override with nothing in it is no override: the brand uses the
  // workspace's branding, with no blank row calling itself the brand's own.
  if (brandId && Object.values(fields).every((value) => value === null)) {
    const removed = await withRlsContext(organizationId, (tx) =>
      removeBrandOverride(tx, organizationId, brandId),
    );
    if (removed > 0) await audit(currentUser, brandId, { brandId, removed: true });
    return NextResponse.json({ saved: { brandId, ...fields }, changed: [] });
  }

  const result = await withRlsContext(organizationId, async (tx) => {
    const current = await loadScopeRow(tx, organizationId, brandId);
    if (!logoUrlAllowed(fields.logoUrl, organizationId, current?.logoUrl ?? null)) {
      return null;
    }
    return saveAgencyBranding(tx, {
      organizationId,
      brandId,
      fields,
      colours: brandId ? {} : { primaryColor, secondaryColor, accentColor },
    });
  });
  if (!result) {
    return NextResponse.json({ error: "logoUrl: upload the logo first" }, { status: 400 });
  }
  if (result.changed.length > 0) {
    await audit(currentUser, brandId, { brandId, changed: result.changed });
  }

  const { row } = result;
  return NextResponse.json({
    saved: {
      brandId: row.brandId,
      agencyName: row.agencyName,
      logoUrl: row.logoUrl,
      footerText: row.footerText,
      contactLine: row.contactLine,
      primaryColor: row.primaryColor,
      secondaryColor: row.secondaryColor,
      accentColor: row.accentColor,
    },
    changed: result.changed,
  });
}

export async function DELETE(req: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const refusal = await brandingRefusal(currentUser);
  if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });
  const brandId = new URL(req.url).searchParams.get("brandId");
  if (!brandId || !z.string().uuid().safeParse(brandId).success) {
    return NextResponse.json({ error: "brandId: a brand's override to remove" }, { status: 400 });
  }
  const removed = await withRlsContext(currentUser.organizationId, (tx) =>
    removeBrandOverride(tx, currentUser.organizationId, brandId),
  );
  if (removed > 0) await audit(currentUser, brandId, { brandId, removed: true });
  return NextResponse.json({ removed });
}
