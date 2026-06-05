import { formatDistanceToNow } from "date-fns";
import { count, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { redirect } from "next/navigation";
import { StatusBadge } from "@/components/domain/shared/status-badge";
import { db, setRlsContext } from "@/db/client";
import { audits, brands } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function AuditsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");
  await setRlsContext(db, currentUser.organizationId);

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(params.limit ?? "50", 10)));
  const offset = (page - 1) * limit;

  const auditRows = await db
    .select({
      id: audits.id,
      auditNumber: audits.auditNumber,
      brandId: audits.brandId,
      brandName: brands.name,
      status: audits.status,
      scoreComposite: audits.scoreComposite,
      engines: audits.engines,
      totalCostUsd: audits.totalCostUsd,
      createdAt: audits.createdAt,
      completedAt: audits.completedAt,
    })
    .from(audits)
    .innerJoin(brands, eq(audits.brandId, brands.id))
    .where(eq(audits.organizationId, currentUser.organizationId))
    .orderBy(desc(audits.createdAt))
    .limit(limit)
    .offset(offset);

  const [{ count: total }] = await db
    .select({ count: count() })
    .from(audits)
    .where(eq(audits.organizationId, currentUser.organizationId));

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
        <div className="border rounded-lg overflow-hidden">
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
                    {a.scoreComposite ? `${parseFloat(a.scoreComposite).toFixed(1)}` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {a.totalCostUsd ? `US$${parseFloat(a.totalCostUsd).toFixed(4)}` : "—"}
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
