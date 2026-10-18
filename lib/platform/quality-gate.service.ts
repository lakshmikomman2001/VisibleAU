import { and, eq, sql } from "drizzle-orm";
import { serviceDb } from "@/db/client";
import { audits, citations } from "@/db/schema";
import { metricQualityGates } from "@/db/schema/metric-quality-gates";
import { ObservabilityService } from "./observability.service";

type QualityStatus = "pending" | "sufficient" | "insufficient" | "partial";

const DIMENSION_METRICS = ["frequency", "sentiment", "accuracy", "position", "context"] as const;

export class QualityGateService {
  static async evaluate(auditId: string): Promise<QualityStatus> {
    const [audit] = await serviceDb.select().from(audits).where(eq(audits.id, auditId));
    if (!audit) return "pending";

    const marketCode = "AU_EN";

    const gates = await serviceDb
      .select()
      .from(metricQualityGates)
      .where(eq(metricQualityGates.marketCode, marketCode));

    if (gates.length === 0) return "pending";

    // Vunnara Build 1, Part F.3: run_number = 1 only -- a historical
    // audit from before Part F.1 removed the replay loop can have up
    // to 5 rows per real call, which would let a genuinely thin
    // sample size pass minimumSamples by counting replays as if they
    // were independent observations.
    const [citationCount] = await serviceDb
      .select({ count: sql<number>`count(*)::int` })
      .from(citations)
      .where(and(eq(citations.auditId, auditId), eq(citations.runNumber, 1)));

    const totalSamples = citationCount?.count ?? 0;

    const distinctEngines = await serviceDb
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

    await serviceDb.update(audits).set({ qualityStatus: status }).where(eq(audits.id, auditId));

    return status;
  }
}
