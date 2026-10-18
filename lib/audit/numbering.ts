import { eq, sql } from "drizzle-orm";
import type { db } from "@/db/client";
import { audits, brands } from "@/db/schema";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function getNextAuditNumber(orgId: string, tx: DbTransaction): Promise<number> {
  const [row] = await tx
    .select({ max: sql<number>`COALESCE(MAX(audit_number), 0)::int` })
    .from(audits)
    .where(eq(audits.organizationId, orgId));
  return row.max + 1;
}

/**
 * Vunnara Build 1, Part E.2: every audit row remembers which prompt-
 * pack generation it actually ran -- read right before the audit
 * insert, at every call site that creates one, so a later regeneration
 * never silently rewrites what an already-completed audit used.
 * Defaults to 1 for a brand with no promptPackVersion set yet (not
 * classified, or predates this column).
 */
export async function getBrandPromptPackVersion(brandId: string, tx: DbTransaction): Promise<number> {
  const [row] = await tx
    .select({ promptPackVersion: brands.promptPackVersion })
    .from(brands)
    .where(eq(brands.id, brandId));
  return row?.promptPackVersion ?? 1;
}
