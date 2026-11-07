/**
 * Where the app sends someone whose session, or workspace, isn't there.
 * No imports: client pages read these too.
 *
 * A signed-in user is never sent to the sign-in form as if signed out:
 * without a workspace they go to NO_WORKSPACE_PATH; only a session that
 * has actually ended goes to SESSION_ENDED_PATH, which says so.
 */
export const NO_WORKSPACE_PATH = "/no-workspace";
export const SESSION_ENDED_REASON = "session-ended";
export const SESSION_ENDED_PATH = `/sign-in?reason=${SESSION_ENDED_REASON}`;

/**
 * Team follow-ups (31 Oct), item 3 -- where a link asked to go after signing in (`redirectTo`), if it's a
 * page on this site: the path with its query and hash, or null for anything else. Never another site:
 * not "https://...", not "//host" or "/\host" (browsers read both as another host), nothing with a
 * backslash or a control character.
 *
 * Follow-ups from d247ba7..f13411d, part 4 -- nor any of those once decoded: "/%2Fevil.com",
 * "/%5Cevil.com", "/%0d%0aLocation:..." and the double-encoded "/%252F%252Fevil.com" are refused too, in
 * case anything between here and the browser decodes the path again. Only the path is decoded for this
 * check (up to three times, until it stops changing); a query or hash can't change which site a link
 * goes to, so "/invite/abc?x=1" and "/reports?q=100%25" pass as they are. A path that won't decode is
 * refused.
 */
export function safeRedirectPath(value: string | null | undefined): string | null {
  if (!value?.startsWith("/") || value.startsWith("//")) return null;
  if (hasBackslashOrControl(value)) return null;
  let path = value.split(/[?#]/, 1)[0];
  for (let pass = 0; pass < 3; pass++) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(path);
    } catch {
      return null;
    }
    if (decoded === path) break;
    if (!decoded.startsWith("/") || decoded.startsWith("//") || hasBackslashOrControl(decoded)) {
      return null;
    }
    path = decoded;
  }
  const base = "https://this-site.invalid";
  try {
    const url = new URL(value, base);
    return url.origin === base ? `${url.pathname}${url.search}${url.hash}` : null;
  } catch {
    return null;
  }
}

function hasBackslashOrControl(text: string): boolean {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what it refuses.
  return /[\\\u0000-\u001f\u007f]/.test(text);
}

/** Team follow-ups, item 4: the workspace and token of an invite page's path, /invite/<orgId>/<token>. */
export function inviteFromPath(path: string | null): { orgId: string; token: string } | null {
  const match = path?.match(/^\/invite\/([0-9a-f-]{36})\/([\w-]{10,})$/i);
  return match ? { orgId: match[1], token: match[2] } : null;
}

/** /sign-in or /sign-up, carrying on to `next` (already a safeRedirectPath) when there is one. */
export function authPagePath(page: "/sign-in" | "/sign-up", next: string | null): string {
  return next ? `${page}?redirectTo=${encodeURIComponent(next)}` : page;
}

/**
 * What the emailed verification link comes back to: sign-in, which says the
 * address is confirmed and then carries on to `next`. The link starts no session
 * of its own (lib/auth/server.ts), so an account someone else registered with this
 * address can't be taken over by whoever opens it.
 */
export function verifiedLandingPath(next: string): string {
  return `/sign-in?verified=1&redirectTo=${encodeURIComponent(next)}`;
}

/**
 * Where a new sign-up goes once it's verified and signed in: /no-workspace,
 * offering the name it typed. Encoded past encodeURIComponent, because better-auth
 * accepts only [\w\-.+/=&%@] in a relative callback's query.
 */
export function newWorkspacePath(name: string): string {
  const encoded = encodeURIComponent(name.trim()).replace(
    /[!'()*~]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return encoded ? `${NO_WORKSPACE_PATH}?name=${encoded}` : NO_WORKSPACE_PATH;
}

/** A slug for a new workspace that two people choosing the same name
 * can't collide on (a taken slug used to fail sign-up halfway, leaving
 * an account with no workspace). */
export function workspaceSlug(name: string, suffix: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `${base || "workspace"}-${suffix}`;
}
