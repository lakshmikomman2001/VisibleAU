import { hasGoogleSurfaceProviderCredentials } from "@/lib/serp/credentials";

/**
 * Google AI surfaces, Phase 1 -- the env kill switch, and the ONE reader of it (no database import, so the
 * public pages that say whether Google is collected -- methodology, privacy, data residency -- can ask
 * without loading the database client). lib/governance/google-surfaces.ts resolves everything else;
 * tests/unit/google-surfaces/switch-readers.test.ts fails on any other reader.
 */

export const GOOGLE_SURFACES_ENV = "GOOGLE_AI_SURFACES_ENABLED";

/** Anything but "true" is off, whatever the database says. A change needs a redeploy. */
export function googleSurfacesEnvEnabled(): boolean {
  return process.env[GOOGLE_SURFACES_ENV] === "true";
}

let loggedMissingCredentials = false;

/** The provider's credentials are set; when they aren't, says so once (their names only). */
export function googleSurfaceCredentialsPresent(): boolean {
  const present = hasGoogleSurfaceProviderCredentials();
  if (!present && !loggedMissingCredentials) {
    loggedMissingCredentials = true;
    console.warn(
      JSON.stringify({
        event: "google_surfaces_disabled_missing_credentials",
        env: ["DATAFORSEO_LOGIN", "DATAFORSEO_PASSWORD"],
      }),
    );
  }
  return present;
}

/**
 * Google can actually run for a customer: the env switch is on and the provider's credentials are set.
 * The public pages name the provider only then (no customer data goes to it before).
 */
export function googleSurfacesCanRun(): boolean {
  return googleSurfacesEnvEnabled() && googleSurfaceCredentialsPresent();
}
