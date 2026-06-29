import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { BrandDetailClient } from "@/components/domain/brand/brand-detail-client";
import { SetBreadcrumbs } from "@/components/domain/set-breadcrumbs";
import { db, setRlsContext } from "@/db/client";
import { audits, brands, citations } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isUuid } from "@/lib/validation/uuid";

export default async function BrandDetailPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/sign-in");
  await setRlsContext(db, currentUser.organizationId);

  const { brandId } = await params;
  if (!isUuid(brandId)) notFound();

  const [brand] = await db
    .select()
    .from(brands)
    .where(
      and(
        eq(brands.id, brandId),
        eq(brands.organizationId, currentUser.organizationId),
        isNull(brands.deletedAt),
      ),
    )
    .limit(1);

  if (!brand) notFound();

  const isFree = currentUser.organization.tier === "free";

  const [{ auditCount }] = await db
    .select({ auditCount: count() })
    .from(audits)
    .where(eq(audits.brandId, brand.id));

  const recentAudits = await db
    .select({ scoreComposite: audits.scoreComposite, completedAt: audits.completedAt })
    .from(audits)
    .where(and(eq(audits.brandId, brand.id), eq(audits.status, "complete")))
    .orderBy(desc(audits.completedAt))
    .limit(12);

  const latestAudit = recentAudits[0] ?? null;

  const latestCompleted = await db
    .select({ id: audits.id, scoreSentimentNumeric: audits.scoreSentimentNumeric })
    .from(audits)
    .where(and(eq(audits.brandId, brand.id), eq(audits.status, "complete")))
    .orderBy(desc(audits.completedAt))
    .limit(1);

  const latestAuditId = latestCompleted[0]?.id ?? null;

  let avgPosition: number | null = null;
  let totalMentions = 0;
  let sentimentScore: number | null = null;
  let engineStats: Array<{ engine: string; total: number; mentions: number }> = [];

  if (latestAuditId) {
    const posRow = await db
      .select({
        avgPos: sql<number>`round(avg(${citations.position})::numeric, 1)`,
      })
      .from(citations)
      .where(
        and(
          eq(citations.auditId, latestAuditId),
          eq(citations.brandMentioned, true),
          sql`${citations.position} IS NOT NULL`,
        ),
      );
    avgPosition = posRow[0]?.avgPos ?? null;

    const mentionRows = await db
      .select({ cnt: count() })
      .from(citations)
      .innerJoin(audits, eq(citations.auditId, audits.id))
      .where(
        and(
          eq(audits.brandId, brand.id),
          eq(audits.status, "complete"),
          eq(citations.brandMentioned, true),
        ),
      );
    totalMentions = Number(mentionRows[0]?.cnt ?? 0);

    sentimentScore = latestCompleted[0]?.scoreSentimentNumeric
      ? Number.parseFloat(latestCompleted[0].scoreSentimentNumeric)
      : null;

    engineStats = await db
      .select({
        engine: citations.engine,
        total: count(),
        mentions: sql<number>`sum(case when ${citations.brandMentioned} then 1 else 0 end)`,
      })
      .from(citations)
      .where(eq(citations.auditId, latestAuditId))
      .groupBy(citations.engine)
      .orderBy(citations.engine);
  }

  return (
    <>
      <SetBreadcrumbs crumbs={["Workspace", "Brands", brand.name]} />
      <BrandDetailClient
        brand={JSON.parse(JSON.stringify(brand))}
        isFree={isFree}
        auditCount={Number(auditCount)}
        recentAudits={JSON.parse(JSON.stringify(recentAudits.reverse()))}
        latestAudit={latestAudit ? JSON.parse(JSON.stringify(latestAudit)) : null}
        avgPosition={avgPosition}
        totalMentions={totalMentions}
        sentimentScore={sentimentScore}
        engineStats={engineStats.map((e) => ({
          engine: e.engine,
          total: Number(e.total),
          mentions: Number(e.mentions),
        }))}
      />
    </>
  );
}
