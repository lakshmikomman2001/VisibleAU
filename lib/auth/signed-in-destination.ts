import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth/current-user";
import { NO_WORKSPACE_PATH } from "@/lib/auth/paths";
import { auth } from "@/lib/auth/server";

/**
 * Where /sign-in and /sign-up send someone who's already signed in, instead of showing the form as if they
 * weren't: where the link asked to go (`next`, a safeRedirectPath -- an invite, say), else their workspace,
 * else /no-workspace, which says they have none. null when nobody is signed in.
 *
 * Team follow-ups (31 Oct), item 3: this was app/sign-in/layout.tsx's job, but a layout can't read the
 * query, so it sent a workspace-less account that came from an invite to /no-workspace every time.
 */
export async function signedInDestination(next: string | null): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  if (next) return next;
  return (await getCurrentUser()) ? "/dashboard" : NO_WORKSPACE_PATH;
}
