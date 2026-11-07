import { redirect } from "next/navigation";
import { safeRedirectPath } from "@/lib/auth/paths";
import { signedInDestination } from "@/lib/auth/signed-in-destination";
import { SignUpForm } from "./sign-up-form";

/**
 * Sign-up. Someone already signed in goes where the link asked (an invite), else to their workspace, else
 * to /no-workspace -- the same as /sign-in (team follow-ups, item 3).
 */
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string | string[] }>;
}) {
  const { redirectTo } = await searchParams;
  const destination = await signedInDestination(
    safeRedirectPath(typeof redirectTo === "string" ? redirectTo : null),
  );
  if (destination) redirect(destination);
  return <SignUpForm />;
}
