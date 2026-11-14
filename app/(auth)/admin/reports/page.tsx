import { ReportFailuresAdmin } from "@/components/domain/admin/report-failures-admin";
import { loadReportFailures } from "@/lib/admin/report-failures";
import { checkPlatformAdmin } from "@/lib/auth/platform-admin";

/**
 * 14 Nov, part 6 (Sri's review of audit #48): why a report's PDF failed, for the operator
 * (lib/admin/report-failures.ts). Operators only, checked on the server (lib/auth/platform-admin.ts), as
 * /admin/costs is; anyone else sees "Forbidden" and none of the reports.
 */
export default async function AdminReportsPage() {
  const { allowed, userId } = await checkPlatformAdmin();
  console.log(JSON.stringify({ event: "admin_access", userId, route: "/admin/reports", allowed }));
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
  return <ReportFailuresAdmin failures={await loadReportFailures()} />;
}
