import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { withRlsContext } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { BRANDING_NOT_ON_PLAN, orgHasReportBranding } from "@/lib/branding/agency-assets";
import {
  LOGO_CONTENT_TYPE,
  LOGO_ERRORS,
  LOGO_MAX_BYTES,
  LOGO_MAX_STORED,
  LOGO_UPLOADS_PER_HOUR,
  logoFormatOf,
  storedLogoFolder,
  storedLogoPath,
  storedLogoUrl,
} from "@/lib/branding/logo";
import { userCan } from "@/lib/governance";
import { checkPostgresRateLimit } from "@/lib/governance/pg-rate-limit";
import { getStorage } from "@/lib/storage";
import { redactSecrets } from "@/lib/storage/redact";

const HOUR_MS = 60 * 60 * 1000;

/**
 * How many files the workspace has stored, reading no further than the limit;
 * null if storage can't say. That skips the cap, not the upload: the hourly limit
 * still holds, and a store that's really down fails the upload itself.
 */
async function countStoredLogos(organizationId: string): Promise<number | null> {
  try {
    const { files } = await getStorage("logos").list(storedLogoFolder(organizationId), {
      limit: LOGO_MAX_STORED,
    });
    return files.length;
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "logo_upload_cap_unchecked",
        organizationId,
        reason: redactSecrets(err instanceof Error ? err.message : String(err)),
      }),
    );
    return null;
  }
}

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
 *
 * 3 Nov: at most LOGO_UPLOADS_PER_HOUR per workspace (429) and LOGO_MAX_STORED
 * files stored per workspace (409), counted only for a file that would otherwise
 * be stored. inngest/functions/cleanup-orphan-logos.ts removes unsaved ones.
 */
export async function POST(req: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // The role from the active membership only (follow-ups from 6e27afc..01a6a8c, part 1).
  if (!(await userCan(currentUser, "manage_branding"))) {
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

  const organizationId = currentUser.organizationId;
  const hourly = await checkPostgresRateLimit({
    routeKey: "logo-upload",
    // Hashed before it's stored (pg-rate-limit.ts's hashIp).
    ip: organizationId,
    windowMs: HOUR_MS,
    max: LOGO_UPLOADS_PER_HOUR,
  });
  if (!hourly.allowed) {
    console.warn(
      JSON.stringify({
        event: "logo_upload_limited",
        organizationId,
        limit: "hourly",
        max: LOGO_UPLOADS_PER_HOUR,
      }),
    );
    return NextResponse.json(
      { error: LOGO_ERRORS.tooMany },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((hourly.resetAt.getTime() - Date.now()) / 1000)),
        },
      },
    );
  }

  const stored = await countStoredLogos(organizationId);
  if (stored !== null && stored >= LOGO_MAX_STORED) {
    console.warn(
      JSON.stringify({
        event: "logo_upload_limited",
        organizationId,
        limit: "stored",
        stored,
        max: LOGO_MAX_STORED,
      }),
    );
    return NextResponse.json({ error: LOGO_ERRORS.tooMany }, { status: 409 });
  }

  const name = `${randomUUID()}.${format}`;
  try {
    await getStorage("logos").upload(
      storedLogoPath(organizationId, name),
      Buffer.from(bytes),
      LOGO_CONTENT_TYPE[format],
    );
  } catch (err) {
    // The reason, without a URL, key or token; never the file.
    console.error(
      JSON.stringify({
        event: "logo_upload_failed",
        organizationId,
        reason: redactSecrets(err instanceof Error ? err.message : String(err)),
      }),
    );
    return NextResponse.json({ error: LOGO_ERRORS.failed }, { status: 502 });
  }

  return NextResponse.json({ logoUrl: storedLogoUrl(organizationId, name) }, { status: 201 });
}
