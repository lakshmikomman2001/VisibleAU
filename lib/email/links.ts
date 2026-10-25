/**
 * Absolute links for emails. The base is NEXT_PUBLIC_APP_URL (the app's
 * own address; the auth client uses it too), then BETTER_AUTH_URL. Only
 * outside production does it fall back to localhost -- a production
 * email with neither set throws instead of linking somewhere nobody can
 * reach (the old digest footer linked to localhost:3000).
 */
export function appBaseUrl(): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL;
  if (base) return base.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_APP_URL is not set -- can't build links for an email");
  }
  return "http://localhost:3000";
}

export function appUrl(path: string): string {
  return `${appBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Every notification email links here (transactional ones don't need to). */
export const NOTIFICATION_SETTINGS_PATH = "/settings/notifications";

export function notificationSettingsUrl(): string {
  return appUrl(NOTIFICATION_SETTINGS_PATH);
}
