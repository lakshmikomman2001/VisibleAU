import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { audits, brands } from "@/db/schema";
import { setRlsContext } from "@/db/client";

export async function getPortfolioMetrics(organizationId: string) {
  await setRlsContext(db, organizationId);

  const allBrands = await db
    .select({ id: brands.id, name: brands.name, clientTag: brands.clientTag })
    .from(brands)
    .where(eq(brands.organizationId, organizationId));

  const recentAudits = await db
    .select({
      brandId: audits.brandId,
      scoreComposite: audits.scoreComposite,
      createdAt: audits.createdAt,
      brandName: brands.name,
    })
    .from(audits)
    .innerJoin(brands, eq(audits.brandId, brands.id))
    .where(eq(brands.organizationId, organizationId))
    .orderBy(desc(audits.createdAt))
    .limit(100);

  const [spendRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(total_cost_usd), 0)::numeric` })
    .from(audits)
    .innerJoin(brands, eq(audits.brandId, brands.id))
    .where(eq(brands.organizationId, organizationId));

  return { allBrands, recentAudits, totalSpend: Number(spendRow?.total ?? 0) };
}
