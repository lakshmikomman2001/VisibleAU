import { and, eq } from "drizzle-orm";
import type { DbClient } from "@/db/client";
import { brands } from "@/db/schema";
import { resolveEngineCoverage } from "@/lib/audit/engine-coverage";
import { resolveOrganicDimensions } from "@/lib/scoring/resolve-audit-dimensions";
import {
  basisAuditEvidence,
  evidenceFields,
  type FindingsData,
  loadCompleteAudit,
} from "./report-data";
import { type Finding, reportFindings } from "./report-findings";

/**
 * Sri's decision (7 Nov) -- an audit's evidence-based actions are the PDF report's "Recommended next" for
 * the same audit: report-findings.ts's rules over report-data.ts's basisAuditEvidence, the counts the PDF
 * reads. The audit page lists exactly these as "from this audit", each saying its counts; anything else it
 * shows is general advice (lib/recommendations/general-advice.ts). Null unless the audit is complete.
 */
export async function auditFindingsData(
  db: DbClient,
  input: { organizationId: string; brandId: string; auditId: string; now?: Date },
): Promise<FindingsData | null> {
  const [brand] = await db
    .select()
    .from(brands)
    .where(and(eq(brands.id, input.brandId), eq(brands.organizationId, input.organizationId)));
  if (!brand) return null;
  const basis = await loadCompleteAudit(db, input.organizationId, brand.id, input.auditId);
  if (!basis) return null;
  const resolved = await resolveOrganicDimensions(db, [basis.id]);
  const basisResolved = resolved.get(basis.id);
  if (!basisResolved) return null;
  const coverage = await resolveEngineCoverage(db, basis);
  const evidence = await basisAuditEvidence(db, {
    brand,
    basis,
    resolved,
    coverage,
    now: input.now ?? new Date(),
  });
  return {
    basis: { auditNumber: basis.auditNumber },
    ...evidenceFields(basis, basisResolved, coverage, evidence),
    competitors: { rows: evidence.shareOfVoice.competitors },
  };
}

/** The audit's evidence-based actions, problems first, as the PDF's "Recommended next" lists them. */
export async function auditEvidenceActions(
  db: DbClient,
  input: { organizationId: string; brandId: string; auditId: string; now?: Date },
): Promise<Finding[]> {
  const data = await auditFindingsData(db, input);
  return data ? reportFindings(data) : [];
}
