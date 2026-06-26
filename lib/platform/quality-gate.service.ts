import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { audits, citations } from "@/db/schema";
import { metricQualityGates } from "@/db/schema/metric-quality-gates";
import { ObservabilityService } from "./observability.service";

type QualityStatus = "pending" | "sufficient" | "insufficient" | "partial";

const DIMENSION_METRICS = [
  "frequency",
  "sentiment",
  "accuracy",
  "position",
  "context",
] as const;

export class QualityGateService {
  static async evaluate(auditId: string): Promise<QualityStatus> {
    const [audit] = await db
      .select()
      .from(audits)
      .where(eq(audits.id, auditId));
    if (!audit) return "pending";

    const marketCode = "AU_EN";

    const gates = await db
      .select()
      .from(metricQualityGates)
      .where(eq(metricQualityGates.marketCode, marketCode));

    if (gates.length === 0) return "pending";

    const [citationCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(citations)
      .where(eq(citations.auditId, auditId));

    const totalSamples = citationCount?.count ?? 0;

    const distinctEngines = await db
      .selectDistinct({ engine: citations.engine })
      .from(citations)
      .where(eq(citations.auditId, auditId));
    const providerCount = distinctEngines.length;

    let sufficientCount = 0;
    let insufficientCount = 0;

    for (const metric of DIMENSION_METRICS) {
      const gate = gates.find((g) => g.metricKey === metric);
      if (!gate) {
        sufficientCount++;
        continue;
      }

      const meetsMinSamples = totalSamples >= gate.minimumSamples;
      const meetsMinProviders = providerCount >= gate.minimumProviderCount;

      if (meetsMinSamples && meetsMinProviders) {
        sufficientCount++;
      } else {
        insufficientCount++;
        ObservabilityService.emit({
          name: "score_quality_gate_failed",
          data: {
            auditId,
            metric,
            totalSamples,
            requiredSamples: gate.minimumSamples,
            providerCount,
            requiredProviders: gate.minimumProviderCount,
          },
        });
      }
    }

    let status: QualityStatus;
    if (insufficientCount === 0) {
      status = "sufficient";
    } else if (sufficientCount === 0) {
      status = "insufficient";
    } else {
      status = "partial";
    }

    await db
      .update(audits)
      .set({ qualityStatus: status })
      .where(eq(audits.id, auditId));

    return status;
  }
}
