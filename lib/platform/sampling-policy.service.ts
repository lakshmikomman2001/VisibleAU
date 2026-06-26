import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { metricQualityGates } from "@/db/schema/metric-quality-gates";
import { samplingPolicies } from "@/db/schema/sampling-policies";
import type {
  QualityLabel,
  QualityLabelValue,
  SamplingPolicyRow,
  ValidationResult,
} from "./types";

export class SamplingPolicyService {
  static async getPolicy(
    market: string,
    segment: string,
    useCase: string,
  ): Promise<SamplingPolicyRow | undefined> {
    const [policy] = await db
      .select()
      .from(samplingPolicies)
      .where(
        and(
          eq(samplingPolicies.marketCode, market),
          eq(samplingPolicies.segment, segment),
          eq(samplingPolicies.useCase, useCase),
        ),
      );
    return policy;
  }

  static async validate(
    sampleCount: number,
    policy: SamplingPolicyRow,
  ): Promise<ValidationResult> {
    if (sampleCount < policy.minimumPromptCount) {
      return {
        valid: false,
        reason: `Sample count ${sampleCount} below minimum ${policy.minimumPromptCount}`,
      };
    }
    return { valid: true };
  }

  static async getQualityLabel(
    metricKey: string,
    sampleCount: number,
    marketCode: string = "AU_EN",
  ): Promise<QualityLabel> {
    const [gate] = await db
      .select()
      .from(metricQualityGates)
      .where(
        and(
          eq(metricQualityGates.metricKey, metricKey),
          eq(metricQualityGates.marketCode, marketCode),
        ),
      );

    if (!gate || sampleCount < gate.minimumSamples) {
      return { label: "Insufficient data" };
    }

    const label = deriveLabel(sampleCount, gate.minimumSamples);
    return { label };
  }
}

function deriveLabel(
  sampleCount: number,
  minimumSamples: number,
): QualityLabelValue {
  const ratio = sampleCount / minimumSamples;
  if (ratio >= 3) return "Confirmed";
  if (ratio >= 2) return "Likely";
  return "Hypothesis";
}
