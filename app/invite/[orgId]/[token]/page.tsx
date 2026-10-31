import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_ENDED_PATH } from "@/lib/auth/paths";
import { auth } from "@/lib/auth/server";
import { AcceptInvite } from "./invite-client";

/**
 * Where a team invite's email link lands. Signed in, but not inside the
 * app's shell: an account with no workspace of its own (it's never had
 * one, or it was closed) must reach this page too, and accepting makes
 * the inviting workspace its own. Signing in brings you back here (the
 * middleware sends a visitor without a session to /sign-in?redirectTo=).
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ orgId: string; token: string }>;
}) {
  const { orgId, token } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect(`${SESSION_ENDED_PATH}&redirectTo=${encodeURIComponent(`/invite/${orgId}/${token}`)}`);
  }
  return <AcceptInvite orgId={orgId} token={token} email={session.user.email} />;
}
