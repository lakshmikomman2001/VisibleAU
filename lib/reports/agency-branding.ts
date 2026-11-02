/**
 * DEMO-BLOCKER (1 Nov), part 5 point 4 -- the agency on a report: its
 * name, logo, contact line and footer, from agency_brand_assets.
 *
 * Field by field: the brand's own row first, then the workspace-wide row
 * (brand_id IS NULL), for EACH field. Before, a brand row with no agency
 * name hid the workspace row's name entirely, and the PDF said "VisibleAU".
 */

export interface AgencyAssetRow {
  agencyName: string | null;
  logoUrl: string | null;
  contactLine: string | null;
  footerText: string | null;
}

export interface AgencyBranding {
  name: string | null;
  logoUrl: string | null;
  contactLine: string | null;
  footerText: string | null;
}

function clean(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

export function resolveAgencyBranding(
  brandRow: AgencyAssetRow | null,
  workspaceRow: AgencyAssetRow | null,
): AgencyBranding {
  const pick = (field: keyof AgencyAssetRow) =>
    clean(brandRow?.[field]) ?? clean(workspaceRow?.[field]);
  return {
    name: pick("agencyName"),
    logoUrl: pick("logoUrl"),
    contactLine: pick("contactLine"),
    footerText: pick("footerText"),
  };
}

/** The cover's logo tile when there's no logo, as the approved prototype
 * draws it: "Harbour Agency" -> "HA", "Acme" -> "AC". */
export function agencyInitials(name: string): string {
  const letters = name.replace(/[^\p{L}\p{N}]/gu, "");
  return letters.slice(0, 2).toUpperCase();
}

export const LOGO_FETCH_TIMEOUT_MS = 5_000;
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export interface AgencyLogo {
  data: Buffer;
  format: "png" | "jpg";
}

/** A host the server must never fetch on an org's say-so: loopback, private and link-local. */
function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host.endsWith(".internal")) return true;
  if (host.includes(":")) return true; // IPv6 literal: never needed for a logo
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!v4) return false;
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

function imageFormat(bytes: Uint8Array): "png" | "jpg" | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "png";
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpg";
  return null;
}

/**
 * The agency's logo for the report cover, fetched at render time: https
 * only, never a private or loopback host, no redirects, at most 2 MB, a
 * PNG or JPEG by its own bytes, within 5 s. Anything else -- including a
 * slow or failing host -- returns null, and the cover draws the initials
 * tile instead. Never throws.
 */
export async function fetchAgencyLogo(
  url: string | null,
  options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<AgencyLogo | null> {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" || isPrivateHost(parsed.hostname)) return null;
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const res = await fetchImpl(parsed.toString(), {
      redirect: "error",
      signal: AbortSignal.timeout(options.timeoutMs ?? LOGO_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const length = Number(res.headers.get("content-length") ?? "0");
    if (length > LOGO_MAX_BYTES) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > LOGO_MAX_BYTES) return null;
    const format = imageFormat(bytes);
    return format ? { data: Buffer.from(bytes), format } : null;
  } catch {
    return null;
  }
}
