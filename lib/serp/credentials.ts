/**
 * Google AI surfaces, Phase 1, part 1 -- the ONE reader of the SERP provider's credentials
 * (DataForSEO: DATAFORSEO_LOGIN, DATAFORSEO_PASSWORD; docs/research/google-ai-surfaces.md). Env only,
 * never the database. The values never leave this module except as the request's Authorization header
 * (lib/serp/dataforseo.ts), and are never logged: callers ask whether they're present.
 * tests/unit/google-surfaces/switch-readers.test.ts fails if any other file reads these names.
 */

export interface DataForSeoCredentials {
  login: string;
  password: string;
}

export function dataForSeoCredentials(): DataForSeoCredentials | null {
  const login = process.env.DATAFORSEO_LOGIN?.trim();
  const password = process.env.DATAFORSEO_PASSWORD?.trim();
  return login && password ? { login, password } : null;
}

/** Both credentials are set (their values aren't looked at). */
export function hasGoogleSurfaceProviderCredentials(): boolean {
  return dataForSeoCredentials() !== null;
}
