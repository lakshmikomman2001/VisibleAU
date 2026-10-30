import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current-user";
import { NO_WORKSPACE_PATH } from "@/lib/auth/paths";
import { auth } from "@/lib/auth/server";

/**
 * Someone who is already signed in never sees the sign-in form as if they
 * were signed out. With a workspace they go to it; without one, to
 * /no-workspace, which says so. (Every signed-in page's own
 * `if (!currentUser) redirect("/sign-in")` lands here, so an account
 * without a workspace no longer bounces to this form looking signed out.)
 */
export default async function SignInLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect((await getCurrentUser()) ? "/dashboard" : NO_WORKSPACE_PATH);
  return children;
}
