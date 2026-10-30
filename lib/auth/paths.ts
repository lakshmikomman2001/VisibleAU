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
