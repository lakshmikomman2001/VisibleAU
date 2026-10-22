import { and, eq, isNull, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { withRlsContext } from "@/db/client";
import { brands } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getOrgTimezone } from "@/lib/platform/org-timezone";
import { resolveOrganicDimensions } from "@/lib/scoring/resolve-audit-dimensions";

export default async function PortfolioPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");

  const orgId = currentUser.organizationId;

  const orgBrands = await withRlsContext(orgId, async (tx) => {
    const brandRows = await tx
      .select({
        id: brands.id,
        name: brands.name,
        domain: brands.domain,
        clientTag: brands.clientTag,
        // Task #46 (fix: stored value contradicting its own CI), follow-up
        // #2: "latest"/"previous" resolve to an AUDIT ID now, not a stored
        // score_composite::text -- the composite itself is recomputed live
        // below, in one batched call, from the same read-time contract
        // every other surface already uses.
        //
        // Vunnara (20 Oct, post-a093ceb), item 3: "latest"/"previous" now
        // pick strictly by recency among complete audits, same as
        // lastAuditDate below always has -- sufficientMentionsExists
        // (removed, lib/audit/organic-filter.ts) used to skip a zero-
        // mention audit on the theory its composite was a frequency_only
        // basis, not comparable to a weighted one; that theory is gone
        // now the headline is always the Frequency DimensionResult
        // alone. A real 0% is a real, scored measurement and must win
        // "latest" over an older, better-looking audit -- compositeFor
        // below still renders insufficient_data (too few successful
        // answers) as null ("—" in Score, no Trend delta), so that state
        // is shown honestly rather than hidden either way.
        //
        // Pre-existing bug fixed in passing (Phase 2, Part 3): `${brands.id}`
        // interpolated a Drizzle column reference, which Drizzle renders
        // UNQUALIFIED ("id") when the outer query has no other table to
        // disambiguate against. Nested inside this subquery's own `FROM
        // audits` -- which also has an `id` column -- Postgres resolved
        // that bare "id" to audits.id, not brands.id, so `audits.brand_id
        // = "id"` collapsed to `audits.brand_id = audits.id`, which is
        // never true. Fixed by writing the qualified reference as a
        // literal, same as Agency's own correlated subquery.
        latestAuditId: sql<string | null>`(
          SELECT id
          FROM audits
          WHERE audits.brand_id = "brands"."id"
            AND audits.status = 'complete'
          ORDER BY completed_at DESC
          LIMIT 1
        )`,
        previousAuditId: sql<string | null>`(
          SELECT id
          FROM audits
          WHERE audits.brand_id = "brands"."id"
            AND audits.status = 'complete'
          ORDER BY completed_at DESC
          OFFSET 1
          LIMIT 1
        )`,
        lastAuditDate: sql<string | null>`(
          SELECT completed_at::text
          FROM audits
          WHERE audits.brand_id = "brands"."id"
            AND audits.status = 'complete'
          ORDER BY completed_at DESC
          LIMIT 1
        )`,
      })
      .from(brands)
      .where(and(eq(brands.organizationId, orgId), isNull(brands.deletedAt)))
      .orderBy(brands.name);

    // One batched query for every latest/previous audit id across every
    // brand in the org -- never one query per brand (see
    // lib/scoring/resolve-audit-dimensions.ts's own batching contract).
    const auditIds = brandRows
      .flatMap((b) => [b.latestAuditId, b.previousAuditId])
      .filter((id): id is string => id !== null);
    const resolvedByAuditId = await resolveOrganicDimensions(tx, auditIds);

    function compositeFor(auditId: string | null): number | null {
      if (!auditId) return null;
      const resolved = resolvedByAuditId.get(auditId);
      if (!resolved) return null;
      // Headline = Frequency alone (never a blend). insufficient_data
      // (zero successful organic answers) -> null: "—" in Score, no
      // Trend delta, excluded from Avg Score.
      const headline = resolved.headline;
      return headline.status === "scored" ? headline.value : null;
    }

    return brandRows.map((b) => ({
      id: b.id,
      name: b.name,
      domain: b.domain,
      clientTag: b.clientTag,
      lastAuditDate: b.lastAuditDate,
      latestScore: compositeFor(b.latestAuditId),
      previousScore: compositeFor(b.previousAuditId),
    }));
  });

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
                .map((b) => b.latestScore)
                .filter((s): s is number => s !== null);
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
                  const current = brand.latestScore;
                  const previous = brand.previousScore;
                  const delta = current !== null && previous !== null ? current - previous : null;

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
                            {delta > 0 ? "↑" : delta < 0 ? "↓" : "→"} {Math.abs(delta).toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {brand.lastAuditDate
                          ? // "Dates show in Sydney time" (23 Oct), item 3
                            new Date(brand.lastAuditDate).toLocaleDateString("en-AU", {
                              timeZone: getOrgTimezone(orgId),
                            })
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
