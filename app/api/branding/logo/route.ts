import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { withRlsContext } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { BRANDING_NOT_ON_PLAN, orgHasReportBranding } from "@/lib/branding/agency-assets";
import {
  LOGO_CONTENT_TYPE,
  LOGO_ERRORS,
  LOGO_MAX_BYTES,
  logoFormatOf,
  storedLogoPath,
  storedLogoUrl,
} from "@/lib/branding/logo";
import { canPerformAction, getMemberRecord, type OrgRole } from "@/lib/governance";
import { getStorage } from "@/lib/storage";
import { redactSecrets } from "@/lib/storage/redact";

/**
 * 2 Nov ("Upload instead does nothing in Brand basics") -- uploads a logo:
 * a brand's own (the new-brand wizard) or the agency's (Account -> Report
 * branding). Owners and admins only (RBAC manage_branding), checked here.
 *
 * multipart/form-data with one `file`: a PNG or JPEG of at most 2 MB,
 * judged by its own bytes, never its name or declared type (an SVG is
 * checked and made into a PNG in the browser first -- lib/branding/
 * svg-logo.ts). Stored in the private "logos" bucket -- the "reports" bucket
 * accepts only PDFs -- under <organization id>/branding/<new uuid>.<png|jpg>,
 * the same per-workspace prefix as the report PDFs. Returns the URL to save
 * ({ logoUrl }, the serving route's path); saving it on a brand or a
 * branding row is the caller's next request.
 *
 * `purpose`: "agency" for report branding, which is Agency-plan only, refused
 * here on any other plan. A brand's own logo isn't gated, and neither is an
 * upload that names no purpose: saving a logo on agency branding is refused by
 * plan anyway (app/api/report-branding/route.ts).
 */
export async function POST(req: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const member = await getMemberRecord(currentUser.organizationId, currentUser.id);
  const role = (member?.role ?? currentUser.role ?? "viewer") as OrgRole;
  if (!canPerformAction(role, "manage_branding")) {
    return NextResponse.json({ error: LOGO_ERRORS.forbidden }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: LOGO_ERRORS.noFile }, { status: 400 });
  }
  if (form.get("purpose") === "agency") {
    const organizationId = currentUser.organizationId;
    const onPlan = await withRlsContext(organizationId, (tx) =>
      orgHasReportBranding(tx, organizationId),
    );
    if (!onPlan) return NextResponse.json({ error: BRANDING_NOT_ON_PLAN }, { status: 403 });
  }
  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: LOGO_ERRORS.noFile }, { status: 400 });
  }
  if (file.size > LOGO_MAX_BYTES) {
    return NextResponse.json({ error: LOGO_ERRORS.tooLarge }, { status: 413 });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength === 0) {
    return NextResponse.json({ error: LOGO_ERRORS.noFile }, { status: 400 });
  }
  if (bytes.byteLength > LOGO_MAX_BYTES) {
    return NextResponse.json({ error: LOGO_ERRORS.tooLarge }, { status: 413 });
  }
  const format = logoFormatOf(bytes);
  if (!format) {
    return NextResponse.json({ error: LOGO_ERRORS.wrongType }, { status: 415 });
  }

  const name = `${randomUUID()}.${format}`;
  try {
    await getStorage("logos").upload(
      storedLogoPath(currentUser.organizationId, name),
      Buffer.from(bytes),
      LOGO_CONTENT_TYPE[format],
    );
  } catch (err) {
    // The reason, without a URL, key or token; never the file.
    console.error(
      JSON.stringify({
        event: "logo_upload_failed",
        organizationId: currentUser.organizationId,
        reason: redactSecrets(err instanceof Error ? err.message : String(err)),
      }),
    );
    return NextResponse.json({ error: LOGO_ERRORS.failed }, { status: 502 });
  }

  return NextResponse.json(
    { logoUrl: storedLogoUrl(currentUser.organizationId, name) },
    { status: 201 },
  );
}
