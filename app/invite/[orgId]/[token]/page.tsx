import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { signedOutInviteRoute } from "@/lib/auth/invite";
import { authPagePath } from "@/lib/auth/paths";
import { auth } from "@/lib/auth/server";
import { AcceptInvite } from "./invite-client";

/**
 * Where a team invite's email link lands. Signed in, but not inside the
 * app's shell: an account with no workspace of its own (it's never had
 * one, or it was closed) must reach this page too, and accepting makes
 * the inviting workspace its own.
 *
 * Live invite test follow-ups (8 Nov), part 1 -- someone who isn't signed
 * in goes where the invite's own type says, decided here from the invite
 * row (lib/auth/invite.ts signedOutInviteRoute): an invite for a new
 * account to the invite sign-up, one for an account to sign-in as its
 * address; both carry on back here. A token that can't be used gets the
 * one answer (./not-found.tsx), so nothing about the invite or its address
 * is shown without a good token. (This page is public in middleware.ts.)
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ orgId: string; token: string }>;
}) {
  const { orgId, token } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    const route = await signedOutInviteRoute(orgId, token);
    if (route === "unusable") notFound();
    redirect(
      authPagePath(route === "sign-up" ? "/sign-up" : "/sign-in", `/invite/${orgId}/${token}`),
    );
  }
  return <AcceptInvite orgId={orgId} token={token} email={session.user.email} />;
}
