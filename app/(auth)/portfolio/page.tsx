import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db, setRlsContext } from "@/db/client";
import { audits, brands } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function PortfolioPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");
  await setRlsContext(db, currentUser.organizationId);

  const orgId = currentUser.organizationId;

  const orgBrands = await db
    .select({
      id: brands.id,
      name: brands.name,
      domain: brands.domain,
      clientTag: brands.clientTag,
      latestScore: sql<string | null>`(
        SELECT score_composite::text
        FROM audits
        WHERE audits.brand_id = ${brands.id}
          AND audits.status = 'complete'
        ORDER BY completed_at DESC
        LIMIT 1
      )`,
      previousScore: sql<string | null>`(
        SELECT score_composite::text
        FROM audits
        WHERE audits.brand_id = ${brands.id}
          AND audits.status = 'complete'
        ORDER BY completed_at DESC
        OFFSET 1
        LIMIT 1
      )`,
      lastAuditDate: sql<string | null>`(
        SELECT completed_at::text
        FROM audits
        WHERE audits.brand_id = ${brands.id}
          AND audits.status = 'complete'
        ORDER BY completed_at DESC
        LIMIT 1
      )`,
    })
    .from(brands)
    .where(and(eq(brands.organizationId, orgId), isNull(brands.deletedAt)))
    .orderBy(brands.name);

  if (orgBrands.length < 2) redirect("/dashboard?toast=need-2-brands");

  // Group by clientTag
  const grouped = new Map<string, typeof orgBrands>();
  for (const brand of orgBrands) {
    const tag = brand.clientTag || "Ungrouped";
    if (!grouped.has(tag)) grouped.set(tag, []);
    grouped.get(tag)!.push(brand);
  }

  // Sort groups: named tags first, then "Ungrouped"
  const sortedGroups = [...grouped.entries()].sort((a, b) => {
    if (a[0] === "Ungrouped") return 1;
    if (b[0] === "Ungrouped") return -1;
    return a[0].localeCompare(b[0]);
  });

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-semibold">Portfolio Overview</h1>

      {/* Summary KPIs */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total Brands</p>
          <p className="text-3xl font-bold">{orgBrands.length}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Avg Score</p>
          <p className="text-3xl font-bold">
            {(() => {
              const scores = orgBrands
                .filter((b) => b.latestScore)
                .map((b) => parseFloat(b.latestScore!));
              if (scores.length === 0) return "—";
              return (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
            })()}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-sm text-muted-foreground">Client Groups</p>
          <p className="text-3xl font-bold">{grouped.size}</p>
        </div>
      </div>

      {/* Grouped brand list */}
      {sortedGroups.map(([tag, tagBrands]) => (
        <div key={tag}>
          <h2 className="text-lg font-semibold mb-3">{tag}</h2>
          <div className="rounded-lg border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Brand</th>
                  <th className="px-4 py-3 text-left font-medium">Domain</th>
                  <th className="px-4 py-3 text-left font-medium">Score</th>
                  <th className="px-4 py-3 text-left font-medium">Trend</th>
                  <th className="px-4 py-3 text-left font-medium">Last Audit</th>
                </tr>
              </thead>
              <tbody>
                {tagBrands.map((brand) => {
                  const current = brand.latestScore ? parseFloat(brand.latestScore) : null;
                  const previous = brand.previousScore
                    ? parseFloat(brand.previousScore)
                    : null;
                  const delta =
                    current !== null && previous !== null ? current - previous : null;

                  return (
                    <tr key={brand.id} className="border-t hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <a
                          href={`/brands/${brand.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {brand.name}
                        </a>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{brand.domain}</td>
                      <td className="px-4 py-3 font-mono font-semibold">
                        {current !== null ? current.toFixed(1) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        {delta !== null ? (
                          <span
                            className={`text-sm font-medium ${
                              delta > 0
                                ? "text-green-600"
                                : delta < 0
                                  ? "text-red-600"
                                  : "text-muted-foreground"
                            }`}
                          >
                            {delta > 0 ? "↑" : delta < 0 ? "↓" : "→"}{" "}
                            {Math.abs(delta).toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {brand.lastAuditDate
                          ? new Date(brand.lastAuditDate).toLocaleDateString()
                          : "Never"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
