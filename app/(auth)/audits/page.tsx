import { formatDistanceToNow } from "date-fns";
import { count, desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DriftIndicator } from "@/components/domain/drift/drift-indicator";
import { StatusBadge } from "@/components/domain/shared/status-badge";
import { withRlsContext } from "@/db/client";
import { audits, brands } from "@/db/schema";
import { getAuditCosts } from "@/lib/audit/answered-count";
import { getCurrentUser } from "@/lib/auth/current-user";
import { COST_INCOMPLETE_LABEL, formatAudFromUsd } from "@/lib/constants/currency";
import { resolveOrganicDimensions } from "@/lib/scoring/resolve-audit-dimensions";

export default async function AuditsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(params.limit ?? "50", 10)));
  const offset = (page - 1) * limit;

  const { auditRows, total } = await withRlsContext(currentUser.organizationId, async (tx) => {
    const rawAuditRows = await tx
      .select({
        id: audits.id,
        auditNumber: audits.auditNumber,
        brandId: audits.brandId,
        brandName: brands.name,
        status: audits.status,
        engines: audits.engines,
        totalCostUsd: audits.totalCostUsd,
        createdAt: audits.createdAt,
        completedAt: audits.completedAt,
        driftSeverity: sql<string | null>`(
          SELECT severity FROM drift_alerts
          WHERE current_audit_id = ${audits.id} AND acknowledged = false
          ORDER BY created_at DESC LIMIT 1
        )`,
      })
      .from(audits)
      .innerJoin(brands, eq(audits.brandId, brands.id))
      .where(eq(audits.organizationId, currentUser.organizationId))
      .orderBy(desc(audits.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ count: total }] = await tx
      .select({ count: count() })
      .from(audits)
      .where(eq(audits.organizationId, currentUser.organizationId));

    // Task #46 (fix: stored value contradicting its own CI), follow-up
    // #2: one batched query for every COMPLETE audit on this page (never
    // one query per row) -- a pending/running/failed audit never had
    // citations to recompute from, so it correctly stays "—" rather than
    // being forced through the resolver.
    const completeAuditIds = rawAuditRows
      .filter((a) => a.status === "complete")
      .map((a) => a.id);
    const resolvedByAuditId = await resolveOrganicDimensions(tx, completeAuditIds);
    // Same figure as the audit's own page; "—" until it has a recorded total.
    const costByAuditId = await getAuditCosts(
      tx,
      rawAuditRows.filter((a) => a.totalCostUsd !== null).map((a) => a.id),
    );

    const auditRows = rawAuditRows.map((a) => {
      const resolved = resolvedByAuditId.get(a.id);
      const cost = costByAuditId.get(a.id) ?? null;
      // Headline = Frequency alone. insufficient_data (zero successful
      // organic answers) renders "—", same as a non-complete audit --
      // never a fabricated 0.
      const scoreComposite =
        a.status === "complete" && resolved && resolved.headline.status === "scored"
          ? resolved.headline.value
          : null;
      return { ...a, scoreComposite, cost };
    });

    return { auditRows, total };
  });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Audits</h1>
      </div>
      {auditRows.length === 0 ? (
        <p className="text-muted-foreground">
          No audits yet. Run your first audit from a brand page.
        </p>
      ) : (
        // On a phone the table scrolls sideways inside its border
        // instead of clipping its last columns.
        <div className="border rounded-lg overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-4 py-3 text-left font-medium">#</th>
                <th className="px-4 py-3 text-left font-medium">Brand</th>
                <th className="px-4 py-3 text-left font-medium">Status</th>
                <th className="px-4 py-3 text-left font-medium">Score</th>
                <th className="px-4 py-3 text-left font-medium">Cost</th>
                <th className="px-4 py-3 text-left font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {auditRows.map((a) => (
                <tr key={a.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <Link href={`/audits/${a.id}`} className="text-primary hover:underline">
                      #{a.auditNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{a.brandName}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={a.status} />
                  </td>
                  <td className="px-4 py-3">
                    {a.scoreComposite !== null ? a.scoreComposite.toFixed(1) : "—"}
                    {a.driftSeverity && (
                      <span className="ml-2">
                        <DriftIndicator severity={a.driftSeverity} />
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {a.cost
                      ? `${formatAudFromUsd(a.cost.knownUsd)}${a.cost.incomplete ? ` · ${COST_INCOMPLETE_LABEL}` : ""}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDistanceToNow(new Date(a.createdAt), { addSuffix: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {total > limit && (
        <div className="mt-4 flex justify-center gap-2">
          {page > 1 && (
            <Link href={`/audits?page=${page - 1}`} className="px-3 py-1 border rounded text-sm">
              Previous
            </Link>
          )}
          <span className="px-3 py-1 text-sm text-muted-foreground">
            Page {page} of {Math.ceil(total / limit)}
          </span>
          {page < Math.ceil(total / limit) && (
            <Link href={`/audits?page=${page + 1}`} className="px-3 py-1 border rounded text-sm">
              Next
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
