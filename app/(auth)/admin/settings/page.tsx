import { GoogleSurfacesAdmin } from "@/components/domain/admin/google-surfaces-admin";
import { checkPlatformAdmin } from "@/lib/auth/platform-admin";
import { loadGoogleSurfaceAdminView } from "@/lib/governance/google-surfaces";

/**
 * Google AI surfaces, Phase 1, part 1 -- the operator's settings page. Operators only, checked on the
 * server (lib/auth/platform-admin.ts). Anyone else sees "Forbidden" and none of the settings or workspace
 * names; the API behind it (app/api/admin/settings/route.ts) answers them 403. (A real 403 status for the
 * page itself needs Next's experimental, canary-only `authInterrupts`, which isn't turned on.)
 */
export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string }>;
}) {
  const { allowed, userId } = await checkPlatformAdmin();
  console.log(JSON.stringify({ event: "admin_access", userId, route: "/admin/settings", allowed }));
  if (!allowed) {
    return (
      <div className="flex-1 overflow-y-auto" style={{ background: "var(--bg-base)" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", padding: 32 }} data-admin-forbidden="">
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Forbidden
          </h1>
          <p className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>
            This page is for the operator's account only.
          </p>
        </div>
      </div>
    );
  }
  const { workspace } = await searchParams;
  const view = await loadGoogleSurfaceAdminView(workspace ?? null);
  return <GoogleSurfacesAdmin view={view} />;
}
