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

    let rationale: string;
    if (pct >= 80) {
      rationale = `${brand}'s ${dim} score of ${input.score}/${input.maxScore} indicates strong performance. This places the brand in the top tier for this metric.`;
    } else if (pct >= 50) {
      rationale = `${brand}'s ${dim} score of ${input.score}/${input.maxScore} shows moderate performance with room for improvement in key areas.`;
    } else if (pct > 0) {
      rationale = `${brand}'s ${dim} score of ${input.score}/${input.maxScore} highlights significant gaps that should be addressed to improve AI visibility.`;
    } else {
      rationale = `No ${dim} data is available for ${brand} yet. Run an audit or check to establish a baseline score.`;
    }

    return {
      rationale,
      confidence_label,
      confidence_note,
      top_action: input.topAction ?? null,
    };
  }
}
