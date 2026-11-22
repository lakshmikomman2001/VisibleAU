import {
  LOGO_MAX_BYTES,
  logoFormatOf,
  parseStoredLogoUrl,
  storedLogoPath,
} from "@/lib/branding/logo";
import { guardedFetch } from "@/lib/fetch/guarded-fetch";
import { getStorage } from "@/lib/storage";
import { type AgencyLogo, fetchAgencyLogo, LOGO_FETCH_TIMEOUT_MS } from "./agency-branding";

/**
 * S00B part 3: fetchAgencyLogo's request through the guarded fetcher, with what it asks for (no redirect, its own
 * timeout signal) and its own limits (https only, 2 MB, 5 s).
 */
const guardedLogoFetch = ((input: RequestInfo | URL, init?: RequestInit) =>
  guardedFetch(input instanceof Request ? input.url : String(input), {
    redirect: init?.redirect ?? "follow",
    signal: init?.signal ?? undefined,
    timeoutMs: LOGO_FETCH_TIMEOUT_MS,
    maxBytes: LOGO_MAX_BYTES,
    allowHttp: false,
  })) as typeof fetch;

/**
 * 2 Nov -- the agency's logo for a PDF (the report, and Account -> Report
 * branding's preview): one uploaded through POST /api/branding/logo is read
 * from storage directly (no request to the app's own URL); anything else
 * goes through fetchAgencyLogo's rules (https only, no private host, 2 MB,
 * PNG or JPEG, 5 s). Never throws: no logo means the initials tile.
 */
export async function loadAgencyLogo(url: string | null): Promise<AgencyLogo | null> {
  const stored = parseStoredLogoUrl(url);
  if (!stored) return fetchAgencyLogo(url, { fetchImpl: guardedLogoFetch });
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
