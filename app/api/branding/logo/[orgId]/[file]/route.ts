import { NextResponse } from "next/server";
import {
  LOGO_CONTENT_TYPE,
  LOGO_FILE,
  LOGO_ORG_ID,
  logoFormatOf,
  storedLogoPath,
} from "@/lib/branding/logo";
import { getStorage } from "@/lib/storage";
import { redactSecrets } from "@/lib/storage/redact";

/**
 * 2 Nov -- serves an uploaded logo (POST /api/branding/logo stores it):
 * "/api/branding/logo/<organization id>/<uuid>.png|.jpg". Public, like the
 * client portal that shows it: a logo is published branding, and its file
 * name is a random uuid (randomUUID), so the URL can't be guessed.
 *
 * Only that exact shape is read -- both segments are matched whole, so a
 * "..", a slash or an encoded one never reaches storage -- and only from
 * the "logos" bucket, so never a report PDF. The bytes must be the PNG or
 * JPEG the name says; the answer is image/png or image/jpeg,
 * nosniff, with nothing able to run in it. Everything else is a 404 -- a
 * storage failure too (logged), marked no-store so it isn't cached.
 * (middleware.ts's matcher skips .png and .jpg paths: no sign-in.)
 */
function notFound(): NextResponse {
  return new NextResponse(null, {
    status: 404,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgId: string; file: string }> },
) {
  const { orgId, file } = await params;
  const named = LOGO_FILE.exec(file);
  if (!LOGO_ORG_ID.test(orgId) || !named) return notFound();

  let bytes: Buffer | null;
  try {
    bytes = await getStorage("logos").download(storedLogoPath(orgId, file));
  } catch (err) {
    console.error(
      JSON.stringify({
        event: "logo_read_failed",
        organizationId: orgId,
        reason: redactSecrets(err instanceof Error ? err.message : String(err)),
      }),
    );
    return notFound();
  }
  const format = bytes ? logoFormatOf(bytes) : null;
  if (!bytes || !format || format !== named[1]) return notFound();

  return new NextResponse(new Uint8Array(bytes), {
    status: 200,
    headers: {
      "Content-Type": LOGO_CONTENT_TYPE[format],
      "Content-Length": String(bytes.byteLength),
      // Each upload gets a new file name, so a URL's bytes never change.
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
