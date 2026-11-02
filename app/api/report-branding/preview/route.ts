import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { withRlsContext } from "@/db/client";
import { agencyBrandAssets } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { BRANDING_FORBIDDEN, canManageBranding } from "@/lib/branding/agency-assets";
import { isOwnStoredLogo } from "@/lib/branding/logo";
import { buildBrandingPreviewPdf } from "@/lib/communication/pdf-builder";

/**
 * 2 Nov -- Settings -> Report branding's live preview: a one-page PDF of
 * the report's own cover top bar and page footer (CoverTopBar and
 * RunningFooter, lib/reports/pdf/report-document.tsx), drawn with the
 * values being edited -- nothing saved. Owners and admins only.
 *
 * The logo is drawn only when it's one this workspace uploaded or one
 * already saved in its branding: the preview never fetches an address
 * someone types into the query string.
 *
 * It shows one workspace's unsaved values to one person, so no answer of this
 * route, a refusal included, may be kept by a shared cache.
 */
const PRIVATE = { "Cache-Control": "private, no-store" };

const query = z.object({
  agencyName: z.string().max(100).optional(),
  footerText: z.string().max(200).optional(),
  contactLine: z.string().max(200).optional(),
  logoUrl: z.string().max(500).optional(),
  brandName: z.string().max(100).optional(),
});

function clean(value: string | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

export async function GET(req: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: PRIVATE });
  }
  if (!(await canManageBranding(currentUser))) {
    return NextResponse.json({ error: BRANDING_FORBIDDEN }, { status: 403, headers: PRIVATE });
  }
  const parsed = query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid preview" }, { status: 400, headers: PRIVATE });
  }

  const organizationId = currentUser.organizationId;
  let logoUrl = clean(parsed.data.logoUrl);
  if (logoUrl && !isOwnStoredLogo(logoUrl, organizationId)) {
    const saved = await withRlsContext(organizationId, (tx) =>
      tx
        .select({ logoUrl: agencyBrandAssets.logoUrl })
        .from(agencyBrandAssets)
        .where(eq(agencyBrandAssets.organizationId, organizationId)),
    );
    if (!saved.some((r) => r.logoUrl === logoUrl)) logoUrl = null;
  }

  const pdf = await buildBrandingPreviewPdf({
    agency: {
      name: clean(parsed.data.agencyName),
      footerText: clean(parsed.data.footerText),
      contactLine: clean(parsed.data.contactLine),
    },
    brandName: clean(parsed.data.brandName) ?? "your client",
    logoUrl,
  });
  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="report-branding-preview.pdf"',
      ...PRIVATE,
      "X-Content-Type-Options": "nosniff",
      // The settings page shows it in a frame. vercel.json's DENY rule leaves
      // out this one exact path and its own rule says the same as this, so
      // it's also this strict wherever vercel.json doesn't apply.
      "X-Frame-Options": "SAMEORIGIN",
    },
  });
}
