import { redirect } from "next/navigation";
import { inviteSignInHeading } from "@/lib/auth/invite";
import { inviteFromPath, safeRedirectPath } from "@/lib/auth/paths";
import { signedInDestination } from "@/lib/auth/signed-in-destination";
import { SignInForm } from "./sign-in-form";

/**
 * Sign-in. Someone already signed in never sees the form as if they were signed out: they go where the
 * link asked (an invite), else to their workspace, else to /no-workspace, which says so. (Every signed-in
 * page's own `if (!currentUser) redirect("/sign-in")` lands here, so an account without a workspace
 * doesn't bounce to this form looking signed out.)
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string | string[] }>;
}) {
  const { redirectTo } = await searchParams;
  const next = safeRedirectPath(typeof redirectTo === "string" ? redirectTo : null);
  const destination = await signedInDestination(next);
  if (destination) redirect(destination);
  // Live invite test follow-ups (8 Nov), part 1: from an invite to an account, the page says who to sign in
  // as and what it joins, read from the invite row -- only for a token that can be used.
  const invite = inviteFromPath(next);
  const joining = invite ? await inviteSignInHeading(invite.orgId, invite.token) : null;
  return <SignInForm invite={invite && joining ? { ...invite, ...joining } : undefined} />;
}
