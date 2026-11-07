import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/domain/app-shell";
import { BreadcrumbProvider } from "@/components/domain/breadcrumb-context";
import { CurrentBrandProvider } from "@/components/domain/current-brand-context";
import { PlanTierProvider } from "@/components/domain/plan-tier-context";
import { RoleProvider } from "@/components/domain/role-context";
import { serviceDb } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { NO_WORKSPACE_PATH, SESSION_ENDED_PATH } from "@/lib/auth/paths";
import { auth } from "@/lib/auth/server";
import { countBrands } from "@/lib/brands";
import { brandUsage } from "@/lib/brands/limits";
import { roleOf } from "@/lib/governance";
import { effectiveTier } from "@/lib/pricing/effective-tier";

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

  const orgTier = await effectiveTier(serviceDb, currentUser.organizationId);
  // A layout doesn't re-render on navigation: whatever adds or deletes a
  // brand calls router.refresh() so "New brand" follows (the wizard, the
  // brand page's Delete).
  const newBrandUsage = brandUsage(
    orgTier,
    await countBrands(serviceDb, currentUser.organizationId),
  );

  // Team follow-ups, items 6 and 10: the role every server check reads, so the UI hides what it refuses.
  const role = await roleOf(currentUser);

  return (
    <PlanTierProvider tier={orgTier}>
      <RoleProvider role={role}>
        <BreadcrumbProvider>
          <CurrentBrandProvider>
            <AppShell
              orgName={currentUser.organization.name}
              orgTier={orgTier}
              userName={currentUser.name ?? session.user?.name ?? ""}
              brandUsage={newBrandUsage}
            >
              {children}
            </AppShell>
          </CurrentBrandProvider>
        </BreadcrumbProvider>
      </RoleProvider>
    </PlanTierProvider>
  );
}
