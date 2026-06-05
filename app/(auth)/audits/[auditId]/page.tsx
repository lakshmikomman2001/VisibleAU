import { and, count, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { AuditResultsBasic } from "@/components/domain/audit/audit-results-basic";
import { AuditResultsRich } from "@/components/domain/audit/audit-results-rich";
import { AuditRunningView } from "@/components/domain/audit/audit-running";
import { db, setRlsContext } from "@/db/client";
import { audits, brands, citations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";

export default async function AuditPage({ params }: { params: Promise<{ auditId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");
  await setRlsContext(db, currentUser.organizationId);

  const { auditId } = await params;
  const [audit] = await db
    .select()
    .from(audits)
    .where(and(eq(audits.id, auditId), eq(audits.organizationId, currentUser.organizationId)));
  if (!audit) redirect("/audits");

  const [brand] = await db
    .select({ name: brands.name })
    .from(brands)
    .where(eq(brands.id, audit.brandId));
  const brandName = brand?.name ?? "Unknown Brand";

  if (audit.status === "pending" || audit.status === "running" || audit.status === "failed") {
    const engineCount = audit.engines?.length ?? 2;
    const promptCount = audit.promptsCount ?? 10;
    const runCount = audit.runsPerPrompt ?? 5;
    const totalCalls = audit.totalCalls ?? engineCount * promptCount * runCount;

    const [citStats] = await db
      .select({
        total: count(),
        mentions: sql<number>`COALESCE(SUM(CASE WHEN brand_mentioned = true THEN 1 ELSE 0 END), 0)`,
      })
      .from(citations)
      .where(eq(citations.auditId, auditId));

    const initialCost = audit.totalCostUsd ? Number.parseFloat(audit.totalCostUsd) : 0;
    const initialProgress = totalCalls > 0 ? Math.min(100, (citStats.total / totalCalls) * 100) : 0;

    return (
      <AuditRunningView
        auditId={auditId}
        brandName={brandName}
        initialStatus={audit.status}
        initialProgress={initialProgress}
        initialCost={initialCost}
        initialMentions={citStats.mentions}
        initialCompletedCalls={citStats.total}
        totalCalls={totalCalls}
        engineCount={engineCount}
        promptCount={promptCount}
        runCount={runCount}
        errorMessage={
          audit.status === "failed"
            ? ((audit.metadata as Record<string, string>)?.error ?? "Unknown error")
            : null
        }
      />
    );
  }

  const allCitations = await db.select().from(citations).where(eq(citations.auditId, auditId));
  const isRich = (audit.runsPerPrompt ?? 1) >= 5 && (audit.engines?.length ?? 1) > 1;

  if (isRich) {
    return <AuditResultsRich audit={audit} citations={allCitations} />;
  }
  return <AuditResultsBasic audit={audit} citations={allCitations} />;
}
