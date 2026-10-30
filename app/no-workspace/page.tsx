import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { SESSION_ENDED_PATH } from "@/lib/auth/paths";
import { auth } from "@/lib/auth/server";
import { getWorkspaceState } from "@/lib/auth/workspace-state";
import { NoWorkspaceClient } from "./no-workspace-client";

/**
 * Signed in, but not in a workspace. The app used to send this account
 * to /sign-in from every page, which looked exactly like being signed
 * out straight after signing in (27 Oct, production). It stays signed in
 * here and is offered the way in: reconnect the workspace it already
 * belongs to, or create one -- or sign out.
 */
export default async function NoWorkspacePage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect(SESSION_ENDED_PATH);
  if (await getCurrentUser()) redirect("/dashboard");

  const state = await getWorkspaceState(session.user.id);
  return <NoWorkspaceClient email={session.user.email} state={state} />;
}
