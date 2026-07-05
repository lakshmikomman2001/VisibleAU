import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/domain/app-sidebar";
import { AppTopbar } from "@/components/domain/app-topbar";
import { BreadcrumbProvider } from "@/components/domain/breadcrumb-context";
import { serviceDb } from "@/db/client";
import { subscriptions } from "@/db/schema/subscriptions";
import { getCurrentUser } from "@/lib/auth/current-user";
import { auth } from "@/lib/auth/server";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const currentUser = await getCurrentUser();

  let orgTier = "free";
  if (currentUser) {
    const [sub] = await serviceDb
      .select({ tier: subscriptions.tier })
      .from(subscriptions)
      .where(eq(subscriptions.organizationId, currentUser.organizationId))
      .limit(1);
    orgTier = sub?.tier ?? "free";
  }

  return (
    <BreadcrumbProvider>
      <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg-base)" }}>
        <AppSidebar
          orgName={currentUser?.organization.name ?? "VisibleAU"}
          orgTier={orgTier}
          userName={currentUser?.name ?? session.user?.name ?? ""}
        />
        <div className="flex-1 flex flex-col min-w-0">
          <AppTopbar orgTier={orgTier} />
          <main className="flex-1 overflow-y-auto" style={{ background: "var(--bg-base)" }}>
            {children}
          </main>
        </div>
      </div>
    </BreadcrumbProvider>
  );
}
