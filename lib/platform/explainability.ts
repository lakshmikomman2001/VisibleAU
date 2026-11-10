import { NOT_MEASURED } from "@/lib/scoring/measured";
import { possessive } from "@/lib/copy/possessive";

export interface ExplainabilityAnnotation {
  rationale: string;
  confidence_label: "High" | "Medium" | "Low" | null;
  confidence_note: string | null;
  top_action: string | null;
}

export interface AnnotateInput {
  score: number;
  scoreLabel: string;
  maxScore: number;
  context: {
    brandName?: string;
    dimension?: string;
    sampleSize?: number;
    dataAge?: string;
  };
  topAction?: string;
}

export class ExplainabilityService {
  static annotate(input: AnnotateInput): ExplainabilityAnnotation {
    const pct = (input.score / input.maxScore) * 100;
    const dim = input.context.dimension ?? input.scoreLabel;
    const brand = input.context.brandName ?? "this brand";

    let confidence_label: "High" | "Medium" | "Low" | null = "High";
    let confidence_note: string | null = null;

    if (input.context.sampleSize !== undefined && input.context.sampleSize < 3) {
      confidence_label = "Low";
      confidence_note = "Based on fewer than 3 data points — treat as directional only.";
    } else if (input.context.sampleSize !== undefined && input.context.sampleSize < 10) {
      confidence_label = "Medium";
      confidence_note = "Based on a limited sample — confidence will improve with more audits.";
    }

    if (input.context.dataAge === "stale") {
      confidence_label = confidence_label === "Low" ? "Low" : "Medium";
      confidence_note = confidence_note ?? "Data is more than 30 days old — consider refreshing.";
    }

    // 9 Nov (mock-gate follow-ups, part 9): a measured 0 is a result, never "no data"; nothing checked at all
    // (sampleSize 0) is "not measured" (lib/scoring/measured.ts).
    let rationale: string;
    if (input.context.sampleSize === 0) {
      rationale = `${NOT_MEASURED} for ${brand}: there was nothing to check ${dim} against.`;
    } else if (pct >= 80) {
      rationale = `${possessive(brand)} ${dim} score of ${input.score}/${input.maxScore} indicates strong performance. This places the brand in the top tier for this metric.`;
    } else if (pct >= 50) {
      rationale = `${possessive(brand)} ${dim} score of ${input.score}/${input.maxScore} shows moderate performance with room for improvement in key areas.`;
    } else if (pct > 0) {
      rationale = `${possessive(brand)} ${dim} score of ${input.score}/${input.maxScore} highlights significant gaps that should be addressed to improve AI visibility.`;
    } else {
      rationale = `${possessive(brand)} ${dim} score is 0/${input.maxScore}: none of the signals it measures was found.`;
    }

    return {
      rationale,
      confidence_label,
      confidence_note,
      top_action: input.topAction ?? null,
    };
  }
}
