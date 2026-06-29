type QualityStatus = "sufficient" | "partial" | "insufficient" | "pending";

const CONFIDENCE_MAP: Record<QualityStatus, "High" | "Medium" | "Low" | null> = {
  sufficient: "High",
  partial: "Medium",
  insufficient: "Low",
  pending: null,
};

const CONFIDENCE_WEIGHT: Record<QualityStatus, number> = {
  sufficient: 1.0,
  partial: 0.7,
  insufficient: 0.4,
  pending: 0.5,
};

const EFFORT_WEIGHT: Record<string, number> = {
  low: 3,
  medium: 2,
  high: 1,
};

export function deriveConfidenceLabel(
  qualityStatus: string | null,
): "High" | "Medium" | "Low" | null {
  if (!qualityStatus) return null;
  return CONFIDENCE_MAP[qualityStatus as QualityStatus] ?? null;
}

export function computePriorityScore(
  impact: number,
  qualityStatus: string | null,
  effort: string | null,
): number {
  const confWeight = CONFIDENCE_WEIGHT[(qualityStatus as QualityStatus) ?? "pending"] ?? 0.5;
  const effWeight = EFFORT_WEIGHT[effort ?? "medium"] ?? 2;
  // EffortWeight is already inverted (low=3, high=1) per LLD §6.2
  return impact * confWeight * effWeight;
}

export function rankTasks(
  tasks: Array<{ id: string; priorityScore: number }>,
): Map<string, number> {
  const sorted = [...tasks].sort((a, b) => b.priorityScore - a.priorityScore);
  const ranks = new Map<string, number>();
  sorted.forEach((t, i) => ranks.set(t.id, i + 1));
  return ranks;
}
