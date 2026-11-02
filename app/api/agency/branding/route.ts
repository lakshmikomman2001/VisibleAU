import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  brandingRefusal,
  loadPrintableAgencyAssets,
  loadScopeRow,
  logoUrlAllowed,
  saveAgencyBranding,
} from "@/lib/branding/agency-assets";
import { recordAction } from "@/lib/governance";

/**
 * The workspace-wide agency branding, as the agency PDF builder reads it
 * (GET: nothing, on a plan without report branding). Account -> Report branding
 * (/settings/report-branding, and /api/report-branding) is where it's edited;
 * this PATCH stays for any caller of the old /agency/branding page.
 *
 * 2 Nov, both of that page's bugs fixed here too: owners and admins only
 * (RBAC manage_branding) -- any member, a viewer included, could change it --
 * and the save updates the workspace's row in place. It was INSERT ... ON
 * CONFLICT (organization_id, brand_id), which never conflicts for a NULL
 * brand_id, so every save added a row; GET returns the newest. Agency plans
 * only, as every route that changes branding.
 */

const optionalText = (max: number) => z.union([z.string().max(max), z.null()]).optional();
const colour = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "a colour like #0066CC")
  .optional();

const upsertSchema = z.object({
  logoUrl: optionalText(500),
  primaryColor: colour,
  secondaryColor: colour,
  accentColor: colour,
  footerText: optionalText(200),
  contactLine: optionalText(200),
  agencyName: optionalText(100),
});

function emptyToNull(v: string | null | undefined): string | null {
  return v?.trim() ? v.trim() : null;
}

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workspace } = await withRlsContext(currentUser.organizationId, (tx) =>
    loadPrintableAgencyAssets(tx, currentUser.organizationId),
  );
  return NextResponse.json({ branding: workspace });
}

export async function PATCH(req: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const refusal = await brandingRefusal(currentUser);
  if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = upsertSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.issues.map((i) => {
      const field = i.path.join(".");
      return field ? `${field}: ${i.message}` : i.message;
    });
    return NextResponse.json(
      { error: fieldErrors.join("; "), issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const organizationId = currentUser.organizationId;
  const fields = {
    agencyName: emptyToNull(parsed.data.agencyName),
    logoUrl: emptyToNull(parsed.data.logoUrl),
    footerText: emptyToNull(parsed.data.footerText),
    contactLine: emptyToNull(parsed.data.contactLine),
  };
  const result = await withRlsContext(organizationId, async (tx) => {
    const current = await loadScopeRow(tx, organizationId, null);
    if (!logoUrlAllowed(fields.logoUrl, organizationId, current?.logoUrl ?? null)) return null;
    return saveAgencyBranding(tx, {
      organizationId,
      brandId: null,
      fields,
      colours: {
        primaryColor: parsed.data.primaryColor,
        secondaryColor: parsed.data.secondaryColor,
        accentColor: parsed.data.accentColor,
      },
    });
  });
  if (!result) {
    return NextResponse.json({ error: "logoUrl: upload the logo first" }, { status: 400 });
  }
  if (result.changed.length > 0) {
    try {
      await recordAction({
        organizationId,
        userId: currentUser.id,
        action: "report_branding_changed",
        resourceType: "report_branding",
        resourceId: "workspace",
        metadata: { scope: "workspace", changed: result.changed },
      });
    } catch (err) {
      console.error(
        JSON.stringify({
          event: "report_branding_audit_failed",
          organizationId,
          reason: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }

  return NextResponse.json({ branding: result.row });
}
