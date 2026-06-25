import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/domain/app-sidebar";
import { AppTopbar } from "@/components/domain/app-topbar";
import { BreadcrumbProvider } from "@/components/domain/breadcrumb-context";
import { getCurrentUser } from "@/lib/auth/current-user";
import { auth } from "@/lib/auth/server";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");

  const currentUser = await getCurrentUser();

  return (
    <BreadcrumbProvider>
      <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg-base)" }}>
        <AppSidebar
          orgName={currentUser?.organization.name ?? "VisibleAU"}
          orgTier={currentUser?.organization.tier ?? "free"}
          userName={currentUser?.name ?? session.user?.name ?? ""}
        />
        <div className="flex-1 flex flex-col min-w-0">
          <AppTopbar orgTier={currentUser?.organization.tier ?? "free"} />
          <main className="flex-1 overflow-y-auto" style={{ background: "var(--bg-base)" }}>
            {children}
          </main>
        </div>
      </div>
    </BreadcrumbProvider>
  );
}
