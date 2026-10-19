import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { withRlsContext } from "@/db/client";
import { audits, brands } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { resolveOrganicDimensions } from "@/lib/scoring/resolve-audit-dimensions";

export default async function NotFound() {
  let isAuthenticated = false;
  let recentAudits: { id: string; brandName: string; scoreComposite: number | null }[] = [];

  try {
    const currentUser = await getCurrentUser();
    if (currentUser) {
      isAuthenticated = true;
      recentAudits = await withRlsContext(currentUser.organizationId, async (tx) => {
        const rawAudits = await tx
          .select({
            id: audits.id,
            brandName: brands.name,
            status: audits.status,
          })
          .from(audits)
          .innerJoin(brands, eq(audits.brandId, brands.id))
          .where(eq(audits.organizationId, currentUser.organizationId))
          .orderBy(desc(audits.createdAt))
          .limit(3);

        // Task #46 (fix: stored value contradicting its own CI),
        // follow-up #2: one batched query for these up-to-3 audits
        // (never one query per row), recomputed live, never the stored
        // score_composite column.
        const completeIds = rawAudits.filter((a) => a.status === "complete").map((a) => a.id);
        const resolvedByAuditId = await resolveOrganicDimensions(tx, completeIds);

        return rawAudits.map((a) => {
          const resolved = a.status === "complete" ? resolvedByAuditId.get(a.id) : undefined;
          // Headline = Frequency alone. insufficient_data -> null -> the
          // score badge is simply omitted (same as a non-complete audit).
          const scoreComposite =
            resolved && resolved.headline.status === "scored" ? resolved.headline.value : null;
          return { id: a.id, brandName: a.brandName, scoreComposite };
        });
      });
    }
  } catch (e) {
    console.error("[not-found recentAudits]", e);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6">
      <h1 className="text-6xl font-bold text-muted-foreground">404</h1>
      <p className="text-lg text-muted-foreground">Couldn&apos;t find that page.</p>
      <a
        href={isAuthenticated ? "/dashboard" : "/"}
        className="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground font-medium"
      >
        {isAuthenticated ? "← Back to dashboard" : "← Back to home"}
      </a>

      {recentAudits.length > 0 && (
        <div className="mt-8 w-full max-w-md">
          <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text-secondary)" }}>
            Your recent audits
          </h2>
          <div
            className="rounded-lg overflow-hidden"
            style={{
              border: "1px solid var(--border-default)",
              background: "var(--bg-elevated)",
            }}
          >
            {recentAudits.map((a, i) => (
              <Link
                key={a.id}
                href={`/audits/${a.id}`}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "12px 16px",
                  borderBottom:
                    i < recentAudits.length - 1 ? "1px solid var(--border-subtle)" : "none",
                  textDecoration: "none",
                }}
              >
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {a.brandName}
                </span>
                {a.scoreComposite !== null && (
                  <span className="text-xs font-semibold" style={{ color: "var(--text-tertiary)" }}>
                    {Math.round(a.scoreComposite)}%
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
