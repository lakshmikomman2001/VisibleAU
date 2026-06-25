import { db } from "@/db/client";
import { audits, brands } from "@/db/schema";
import { getNextAuditNumber } from "@/lib/audit/numbering";
import { runAuditInline } from "@/lib/audit/run-audit-inline";
import { SAMPLE_AUDIT_CONFIG } from "./config";
import { ensureSampleOrg } from "./synthetic-org";

export interface SampleAuditResult {
  auditId: string;
  brandId: string;
}

export async function runSampleAudit(
  domain: string,
  vertical: string,
): Promise<SampleAuditResult> {
  const capAud = parseFloat(process.env.SAMPLE_AUDIT_COST_CAP_AUD ?? "0.10");
  if (SAMPLE_AUDIT_CONFIG.estimatedCostAud > capAud) {
    throw new Error(
      `Estimated cost A$${SAMPLE_AUDIT_CONFIG.estimatedCostAud} exceeds cap A$${capAud}`,
    );
  }

  const sampleOrg = await ensureSampleOrg();

  const [brand] = await db
    .insert(brands)
    .values({
      organizationId: sampleOrg.id,
      name: domain,
      domain,
      vertical: vertical as any,
      region: "au",
    })
    .returning();

  const { auditId } = await db.transaction(async (tx) => {
    const num = await getNextAuditNumber(sampleOrg.id, tx);
    const [inserted] = await tx
      .insert(audits)
      .values({
        brandId: brand.id,
        organizationId: sampleOrg.id,
        auditNumber: num,
        triggeredBy: "sample",
        status: "pending",
        metadata: {
          isSample: true,
          costAud: SAMPLE_AUDIT_CONFIG.estimatedCostAud,
        },
      })
      .returning({ id: audits.id });
    return { auditId: inserted.id };
  });

  runAuditInline(auditId).catch((err) =>
    console.error("[sample-audit] Inline execution failed:", err),
  );

  return { auditId, brandId: brand.id };
}
