import { redirect } from "next/navigation";
import { safeRedirectPath } from "@/lib/auth/paths";
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
  const destination = await signedInDestination(
    safeRedirectPath(typeof redirectTo === "string" ? redirectTo : null),
  );
  if (destination) redirect(destination);
  return <SignInForm />;
}
