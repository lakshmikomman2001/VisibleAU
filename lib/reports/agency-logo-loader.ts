import {
  LOGO_MAX_BYTES,
  logoFormatOf,
  parseStoredLogoUrl,
  storedLogoPath,
} from "@/lib/branding/logo";
import { getStorage } from "@/lib/storage";
import { type AgencyLogo, fetchAgencyLogo } from "./agency-branding";

/**
 * 2 Nov -- the agency's logo for a PDF (the report, and Account -> Report
 * branding's preview): one uploaded through POST /api/branding/logo is read
 * from storage directly (no request to the app's own URL); anything else
 * goes through fetchAgencyLogo's rules (https only, no private host, 2 MB,
 * PNG or JPEG, 5 s). Never throws: no logo means the initials tile.
 */
export async function loadAgencyLogo(url: string | null): Promise<AgencyLogo | null> {
  const stored = parseStoredLogoUrl(url);
  if (!stored) return fetchAgencyLogo(url);
  try {
    const bytes = await getStorage("logos").download(
      storedLogoPath(stored.organizationId, stored.file),
    );
    if (!bytes || bytes.byteLength === 0 || bytes.byteLength > LOGO_MAX_BYTES) return null;
    const format = logoFormatOf(bytes);
    return format ? { data: bytes, format } : null;
  } catch {
    return null;
  }
}
