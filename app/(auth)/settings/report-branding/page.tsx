import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  type BrandingScopeValues,
  ReportBrandingForm,
} from "@/components/domain/branding/report-branding-form";
import { withRlsContext } from "@/db/client";
import { agencyBrandAssets, brands } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  BRANDING_NOT_ON_PLAN,
  canManageBranding,
  loadAgencyAssetRows,
  orgHasReportBranding,
} from "@/lib/branding/agency-assets";
import { PRODUCT_NAME } from "@/lib/product";

/**
 * 2 Nov ("where does Sri set the agency name and logo for the report
 * cover?", part 3) -- Account -> Report branding: the agency name, logo,
 * footer text and contact line every report PDF prints, for the whole
 * workspace, with an optional override per brand (field by field, as the
 * PDF reads them). The Agency Dashboard's "Report branding & logo" and the
 * old /agency/branding open this page. On an Agency plan only (any other plan
 * sees a locked card, with no preview), for owners and admins only, both
 * checked here and by every API it calls.
 */
export default async function ReportBrandingPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");

  const onPlan = await withRlsContext(currentUser.organizationId, (tx) =>
    orgHasReportBranding(tx, currentUser.organizationId),
  );
  if (!onPlan) {
    return (
      <div className="flex-1 overflow-y-auto" style={{ background: "var(--bg-base)" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: 32 }}>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Report branding
          </h1>
          <div
            className="rounded-lg p-5 mt-4"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}
            data-branding-locked
          >
            <p className="text-[14px] font-medium" style={{ color: "var(--text-primary)" }}>
              {BRANDING_NOT_ON_PLAN}
            </p>
            <p className="text-[13px] mt-1" style={{ color: "var(--text-secondary)" }}>
              They put your agency&apos;s name and logo on every report PDF, audit export and client
              portal. Until then, these say &quot;Powered by {PRODUCT_NAME}&quot;.
            </p>
            <Link
              href="/pricing"
              className="inline-block mt-3 text-[13px] font-medium underline focus-visible:outline focus-visible:outline-2"
              style={{ color: "var(--accent-blue)" }}
            >
              See the Agency plans
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!(await canManageBranding(currentUser))) {
    return (
      <div className="flex-1 overflow-y-auto" style={{ background: "var(--bg-base)" }}>
        <div style={{ maxWidth: 960, margin: "0 auto", padding: 32 }}>
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>
            Report branding
          </h1>
          <p className="text-[13px] mt-2" style={{ color: "var(--text-secondary)" }} data-no-access>
            Only owners and admins can change report branding. Ask an owner or admin of this
            workspace to set the agency name and logo.
          </p>
        </div>
      </div>
    );
  }

  const organizationId = currentUser.organizationId;
  const data = await withRlsContext(organizationId, async (tx) => {
    const { workspace } = await loadAgencyAssetRows(tx, organizationId);
    const overrideRows = await tx
      .select()
      .from(agencyBrandAssets)
      .where(
        and(
          eq(agencyBrandAssets.organizationId, organizationId),
          isNotNull(agencyBrandAssets.brandId),
        ),
      );
    const brandList = await tx
      .select({ id: brands.id, name: brands.name })
      .from(brands)
      .where(and(eq(brands.organizationId, organizationId), isNull(brands.deletedAt)))
      .orderBy(asc(brands.name));
    return { workspace, overrideRows, brandList };
  });

  const values = (row: {
    agencyName: string | null;
    logoUrl: string | null;
    footerText: string | null;
    contactLine: string | null;
  }): BrandingScopeValues => ({
    agencyName: row.agencyName ?? "",
    logoUrl: row.logoUrl,
    footerText: row.footerText ?? "",
    contactLine: row.contactLine ?? "",
  });
  const brandIds = new Set(data.brandList.map((b) => b.id));

  return (
    <ReportBrandingForm
      workspace={{
        ...(data.workspace
          ? values(data.workspace)
          : { agencyName: "", logoUrl: null, footerText: "", contactLine: "" }),
        primaryColor: data.workspace?.primaryColor ?? "#0066CC",
        secondaryColor: data.workspace?.secondaryColor ?? "#1A1A1A",
        accentColor: data.workspace?.accentColor ?? "#FF6B35",
      }}
      overrides={Object.fromEntries(
        data.overrideRows
          .filter(
            (r): r is typeof r & { brandId: string } => !!r.brandId && brandIds.has(r.brandId),
          )
          .map((r) => [r.brandId, values(r)]),
      )}
      brands={data.brandList}
    />
  );
}
