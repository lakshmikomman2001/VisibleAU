import { desc, eq } from "drizzle-orm";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { SetBreadcrumbs } from "@/components/domain/set-breadcrumbs";
import { db, setRlsContext } from "@/db/client";
import { brands, technicalAudits } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import type { ContentSSR, SSRPageCheck } from "@/lib/ssr-check/per-page";
import { isUuid } from "@/lib/validation/uuid";

const CTA_DISPLAY: Record<string, string> = {
  yes: "Yes",
  partial: "Partial",
  no: "No",
};

export default async function SSRCheckPage({ params }: { params: Promise<{ brandId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");
  await setRlsContext(db, currentUser.organizationId);

  const { brandId } = await params;
  if (!isUuid(brandId)) notFound();

  const [brand] = await db.select().from(brands).where(eq(brands.id, brandId)).limit(1);
  if (!brand) notFound();

  const [techAudit] = await db
    .select({
      findings: technicalAudits.findings,
      crawledAt: technicalAudits.crawledAt,
    })
    .from(technicalAudits)
    .where(eq(technicalAudits.brandId, brandId))
    .orderBy(desc(technicalAudits.createdAt))
    .limit(1);

  if (!techAudit) {
    return (
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 32px" }}>
        <SetBreadcrumbs crumbs={["Workspace", "Brands", brand.name, "SSR check"]} />
        <div
          style={{
            padding: 48,
            textAlign: "center",
            borderRadius: 8,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
          }}
        >
          <p style={{ fontSize: 14, color: "var(--text-tertiary)" }}>
            Run a technical audit first.
          </p>
        </div>
      </div>
    );
  }

  const allFindings = techAudit.findings as Record<string, unknown>;
  const content = allFindings?.content as Record<string, unknown> | undefined;
  const ssrData = content?.ssr as ContentSSR | undefined;
  const ssrPages: SSRPageCheck[] = ssrData?.pages ?? [];
  const pagesWithReview = ssrPages.filter((p) => p.status === "review").length;
  const allPagesOk = ssrPages.length > 0 && pagesWithReview === 0;

  if (!ssrData) {
    return (
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 32px" }}>
        <SetBreadcrumbs crumbs={["Workspace", "Brands", brand.name, "SSR check"]} />
        <div style={{ marginBottom: 24 }}>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 600,
              color: "var(--text-primary)",
              margin: "0 0 4px",
            }}
          >
            Server-side rendering check
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
            Many LLM crawlers don&apos;t execute JavaScript. We check if your most-important content
            is visible without JS.
          </p>
        </div>
        <div
          style={{
            padding: 48,
            textAlign: "center",
            borderRadius: 8,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
          }}
        >
          <p style={{ fontSize: 14, color: "var(--text-tertiary)" }}>
            Re-run the technical audit to see SSR results.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px" }}>
      <SetBreadcrumbs crumbs={["Workspace", "Brands", brand.name, "SSR check"]} />

      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 600,
            color: "var(--text-primary)",
            margin: "0 0 4px",
          }}
        >
          Server-side rendering check
        </h1>
        <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: 0 }}>
          Many LLM crawlers don&apos;t execute JavaScript. We check if your most-important content
          is visible without JS.
        </p>
      </div>

      {/* SSR status card */}
      <div
        style={{
          padding: 20,
          borderRadius: 8,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {allPagesOk ? (
            <CheckCircle2 style={{ width: 24, height: 24, color: "var(--success)" }} />
          ) : (
            <AlertCircle style={{ width: 24, height: 24, color: "var(--warning)" }} />
          )}
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>
              {allPagesOk
                ? "SSR healthy"
                : `${pagesWithReview} page${pagesWithReview !== 1 ? "s" : ""} need review`}
            </div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              {allPagesOk
                ? `All ${ssrData.pagesChecked} critical pages render content server-side`
                : `${ssrData.pagesChecked - pagesWithReview} of ${ssrData.pagesChecked} pages render fully server-side`}
            </div>
          </div>
        </div>
      </div>

      {/* Page-by-page check table */}
      {ssrPages.length > 0 && (
        <div
          style={{
            borderRadius: 8,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--border-subtle)" }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
              Page-by-page check
            </h3>
          </div>
          <table style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--bg-subtle)" }}>
                {["Page", "JS-disabled content", "Critical CTAs", "Schema visible", "Status"].map(
                  (h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        padding: "10px 20px",
                        fontSize: 11,
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        fontWeight: 600,
                        color: "var(--text-tertiary)",
                      }}
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {ssrPages.map((p, i) => (
                <tr key={`${p.path}-${i}`} style={{ borderTop: "1px solid var(--border-subtle)" }}>
                  <td
                    style={{
                      padding: "10px 20px",
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                      color: "var(--text-primary)",
                    }}
                  >
                    {p.path === "/" ? "/ (homepage)" : p.path}
                  </td>
                  <td style={{ padding: "10px 20px", color: "var(--text-secondary)" }}>
                    {p.jsDisabledContentPct}%
                  </td>
                  <td style={{ padding: "10px 20px", color: "var(--text-secondary)" }}>
                    {CTA_DISPLAY[p.criticalCtas] ?? p.criticalCtas}
                  </td>
                  <td style={{ padding: "10px 20px", color: "var(--text-secondary)" }}>
                    {p.schemaVisible ? "Yes" : "No"}
                  </td>
                  <td style={{ padding: "10px 20px" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 12,
                        fontWeight: 500,
                        padding: "2px 10px",
                        borderRadius: 9999,
                        background:
                          p.status === "ok" ? "var(--success-soft)" : "var(--warning-soft)",
                        color: p.status === "ok" ? "var(--success)" : "var(--warning)",
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: "50%",
                          background: "currentColor",
                        }}
                      />
                      {p.status === "ok" ? "OK" : "Review"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
