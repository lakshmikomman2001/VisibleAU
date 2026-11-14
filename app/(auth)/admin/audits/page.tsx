import { TrendExclusionsAdmin } from "@/components/domain/admin/trend-exclusions-admin";
import { loadTrendExclusionAdminView } from "@/lib/admin/trend-exclusions";
import { checkPlatformAdmin } from "@/lib/auth/platform-admin";

/**
 * 14 Nov, part 5 (Sri's review of audit #48): exclude an audit from trends and comparisons, with a reason
 * (lib/admin/trend-exclusions.ts). Operators only, checked on the server (lib/auth/platform-admin.ts), as
 * /admin/costs is; anyone else sees "Forbidden" and none of the audits, and the API behind it
 * (app/api/admin/audits/route.ts) answers them 403.
 */
export default async function AdminAuditsPage() {
  const { allowed, userId } = await checkPlatformAdmin();
  console.log(JSON.stringify({ event: "admin_access", userId, route: "/admin/audits", allowed }));
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
  return <TrendExclusionsAdmin view={await loadTrendExclusionAdminView()} />;
}
