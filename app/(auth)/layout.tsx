import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/domain/app-shell";
import { BreadcrumbProvider } from "@/components/domain/breadcrumb-context";
import { CurrentBrandProvider } from "@/components/domain/current-brand-context";
import { serviceDb } from "@/db/client";
import { subscriptions } from "@/db/schema/subscriptions";
import { getCurrentUser } from "@/lib/auth/current-user";
import { NO_WORKSPACE_PATH, SESSION_ENDED_PATH } from "@/lib/auth/paths";
import { auth } from "@/lib/auth/server";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // The middleware let a session cookie through, but the session behind
  // it has ended (expired or revoked): say so on the sign-in page.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect(SESSION_ENDED_PATH);

  // Signed in, but not in a workspace: /no-workspace says so and offers
  // the way in -- never the sign-in form, which looked like being signed
  // out straight after signing in (27 Oct, production).
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect(NO_WORKSPACE_PATH);

  const [sub] = await serviceDb
    .select({ tier: subscriptions.tier })
    .from(subscriptions)
    .where(eq(subscriptions.organizationId, currentUser.organizationId))
    .limit(1);
  const orgTier = sub?.tier ?? "free";

  return (
    <BreadcrumbProvider>
      <CurrentBrandProvider>
        <AppShell
          orgName={currentUser.organization.name}
          orgTier={orgTier}
          userName={currentUser.name ?? session.user?.name ?? ""}
        >
          {children}
        </AppShell>
      </CurrentBrandProvider>
    </BreadcrumbProvider>
  );
}
