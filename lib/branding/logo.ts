/**
 * 2 Nov ("Upload instead does nothing in Brand basics") -- uploaded logos:
 * a brand's own, or the agency's for the report cover. One set of rules
 * for the uploader (components/domain/branding/logo-uploader.tsx), the
 * upload API (app/api/branding/logo/route.ts), the route that serves them
 * and the report PDF.
 *
 * Stored as a PNG or JPEG of at most 2 MB in the private "logos" bucket
 * (the "reports" bucket accepts only PDFs), under
 * <organization id>/branding/<uuid>.<png|jpg> -- an SVG is checked and
 * turned into a PNG in the browser first (lib/branding/svg-logo.ts), so
 * only PNG and JPEG bytes are ever stored or served. What's saved on a
 * brand or an agency_brand_assets row is the path of the route that
 * serves it, "/api/branding/logo/<organization id>/<file>": no host and no
 * signed URL, so nothing expires and no storage project is baked in. The
 * report PDF reads the file from storage itself (lib/reports/
 * agency-branding.ts).
 *
 * No imports: the uploader runs in the browser.
 */

export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/** Per workspace (app/api/branding/logo/route.ts). */
export const LOGO_UPLOADS_PER_HOUR = 20;
export const LOGO_MAX_STORED = 50;

/** What the file picker offers. */
export const LOGO_ACCEPT = "image/png,image/jpeg,image/svg+xml,.png,.jpg,.jpeg,.svg";

/** What the uploader and the upload API say. */
export const LOGO_ERRORS = {
  tooLarge: "File too large",
  wrongType: "Use PNG, JPEG or SVG",
  failed: "Upload failed: try again",
  forbidden: "Only owners and admins can upload a logo",
  unsafeSvg:
    "This SVG runs a script or loads other files. Use a PNG or JPEG, or an SVG without them.",
  unreadableSvg: "This SVG couldn't be drawn. Use a PNG or JPEG.",
  noFile: "Choose a PNG, JPEG or SVG file",
  tooMany: "Too many uploads, try again later",
} as const;

export type LogoFormat = "png" | "jpg";

export const LOGO_CONTENT_TYPE: Record<LogoFormat, string> = {
  png: "image/png",
  jpg: "image/jpeg",
};

/** A PNG or JPEG by its own first bytes (never by its name or declared type); null otherwise. */
export function logoFormatOf(bytes: Uint8Array): LogoFormat | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "png";
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  return null;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** An organization id as the serving route accepts it. */
export const LOGO_ORG_ID = new RegExp(`^${UUID}$`);
/** A stored logo's file name: a fresh uuid and its format. */
export const LOGO_FILE = new RegExp(`^${UUID}\\.(png|jpg)$`);

const STORED_LOGO_URL = new RegExp(`^/api/branding/logo/(${UUID})/(${UUID}\\.(?:png|jpg))$`);

/** "/api/branding/logo/<organization id>/<file>" -- what's saved. */
export function storedLogoUrl(organizationId: string, file: string): string {
  return `/api/branding/logo/${organizationId}/${file}`;
}

/** The folder a workspace's logos are in, in the "logos" bucket. */
export function storedLogoFolder(organizationId: string): string {
  return `${organizationId}/branding`;
}

/** Where the file is in the "logos" bucket. */
export function storedLogoPath(organizationId: string, file: string): string {
  return `${storedLogoFolder(organizationId)}/${file}`;
}

/** Every stored logo's file name in a saved value, however it's written around it. */
export function logoFilesNamedIn(url: string | null | undefined): string[] {
  return url?.match(new RegExp(`${UUID}\\.(?:png|jpg)`, "g")) ?? [];
}

/** The workspace and file of a saved logo URL; null for anything else (an https URL included). */
export function parseStoredLogoUrl(
  url: string | null | undefined,
): { organizationId: string; file: string } | null {
  const match = url ? STORED_LOGO_URL.exec(url) : null;
  return match ? { organizationId: match[1], file: match[2] } : null;
}

/** A logo this workspace uploaded -- the only kind a brand may be given, or a branding row newly set to. */
export function isOwnStoredLogo(url: string | null | undefined, organizationId: string): boolean {
  return parseStoredLogoUrl(url)?.organizationId === organizationId;
}
