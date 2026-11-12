import { OperatorCostsView } from "@/components/domain/admin/operator-costs";
import { loadOperatorCosts } from "@/lib/admin/costs";
import { checkPlatformAdmin } from "@/lib/auth/platform-admin";

/**
 * Part 14 (Sri, 13 Nov): what the providers cost us, month to date, per workspace and per audit
 * (lib/admin/costs.ts). Operators only, checked on the server (lib/auth/platform-admin.ts), as
 * /admin/settings is; anyone else sees "Forbidden" and none of the figures, and the API behind it
 * (app/api/admin/costs/route.ts) answers them 403.
 */
export default async function AdminCostsPage() {
  const { allowed, userId } = await checkPlatformAdmin();
  console.log(JSON.stringify({ event: "admin_access", userId, route: "/admin/costs", allowed }));
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
  return <OperatorCostsView costs={await loadOperatorCosts()} />;
}
