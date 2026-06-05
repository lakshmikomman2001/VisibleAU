import { eq, sql } from "drizzle-orm";
import type { db } from "@/db/client";
import { audits } from "@/db/schema";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function getNextAuditNumber(orgId: string, tx: DbTransaction): Promise<number> {
  const [row] = await tx
    .select({ max: sql<number>`COALESCE(MAX(audit_number), 0)::int` })
    .from(audits)
    .where(eq(audits.organizationId, orgId));
  return row.max + 1;
}
