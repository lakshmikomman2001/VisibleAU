import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { VisibilityCell } from "@/components/shared/visibility-cell";
import { withRlsContext } from "@/db/client";
import { audits, brands } from "@/db/schema";
import { engineCoverageLabel } from "@/lib/audit/engine-failure";
import { getCurrentUser } from "@/lib/auth/current-user";
import { formatInOrgTimezone } from "@/lib/platform/org-timezone";
import { resolveOrganicDimensions } from "@/lib/scoring/resolve-audit-dimensions";
import { auditVisibilityDisplay, type VisibilityDisplay } from "@/lib/scoring/visibility-display";

export default async function NotFound() {
  let isAuthenticated = false;
  let recentAudits: {
    id: string;
    brandName: string;
    label: string;
    visibility: VisibilityDisplay;
  }[] = [];

  try {
    const currentUser = await getCurrentUser();
    if (currentUser) {
      isAuthenticated = true;
      recentAudits = await withRlsContext(currentUser.organizationId, async (tx) => {
        const rawAudits = await tx
          .select({
            id: audits.id,
            auditNumber: audits.auditNumber,
            brandName: brands.name,
            status: audits.status,
            engines: audits.engines,
            promptsCount: audits.promptsCount,
            metadata: audits.metadata,
            createdAt: audits.createdAt,
            completedAt: audits.completedAt,
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
          // The audit page's own heading and date, so a row reads like the
          // page it opens; an unfinished audit has no completion date yet.
          const date = formatInOrgTimezone(
            new Date(a.completedAt ?? a.createdAt),
            currentUser.organizationId,
            "d MMM yyyy",
          );
          return {
            id: a.id,
            brandName: a.brandName,
            label: `Audit #${a.auditNumber} · ${date}`,
            // The same cell as the audits list: "17%" over "5 of 30", and
            // "3 of 4 engines" when a whole engine failed.
            visibility: {
              ...auditVisibilityDisplay(a.status, resolvedByAuditId.get(a.id)),
              coverage: a.status === "complete" ? engineCoverageLabel(a) : null,
            },
          };
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
                  gap: 16,
                  padding: "12px 16px",
                  borderBottom:
                    i < recentAudits.length - 1 ? "1px solid var(--border-subtle)" : "none",
                  textDecoration: "none",
                }}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    {a.brandName}
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-tertiary)", marginTop: 2 }}>
                    {a.label}
                  </div>
                </div>
                <VisibilityCell display={a.visibility} />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
