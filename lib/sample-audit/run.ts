import { serviceDb } from "@/db/client";
import { audits, brands } from "@/db/schema";
import { getNextAuditNumber } from "@/lib/audit/numbering";
import { runAuditInline } from "@/lib/audit/run-audit-inline";
import { normalizeBrandName } from "@/lib/brands/normalize";
import { SAMPLE_AUDIT_CONFIG } from "./config";
import { ensureSampleOrg } from "./synthetic-org";

const SAMPLE_PRIMARY_REGIONS = ["NSW:Sydney", "VIC:Melbourne", "QLD:Brisbane"];

export interface SampleAuditResult {
  auditId: string;
  brandId: string;
}

export async function runSampleAudit(domain: string, vertical: string): Promise<SampleAuditResult> {
  const capAud = parseFloat(process.env.SAMPLE_AUDIT_COST_CAP_AUD ?? "0.10");
  if (SAMPLE_AUDIT_CONFIG.estimatedCostAud > capAud) {
    throw new Error(
      `Estimated cost A$${SAMPLE_AUDIT_CONFIG.estimatedCostAud} exceeds cap A$${capAud}`,
    );
  }

  const sampleOrg = await ensureSampleOrg();

  const [brand] = await serviceDb
    .insert(brands)
    .values({
      organizationId: sampleOrg.id,
      // Vunnara Build 1, Part A: same write-time normalisation as the
      // real brand create/update routes, even though this value comes
      // from a domain string, not a free-text name field.
      name: normalizeBrandName(domain),
      domain,
      vertical: vertical as any,
      region: "au",
      primaryRegions: SAMPLE_PRIMARY_REGIONS,
    })
    .returning();

  const { auditId } = await serviceDb.transaction(async (tx) => {
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
