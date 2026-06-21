export interface CI {
  lower: number;
  upper: number;
}

export interface DriftInput {
  currentScores: Record<string, number>;
  previousScores: Record<string, number>;
  currentCIs: Record<string, CI>;
  previousCIs: Record<string, CI>;
  currentComposite: number;
  previousComposite: number;
}

export interface DimensionDelta {
  delta: number;
  severity: string;
  currentCI: CI | null;
  previousCI: CI | null;
}

export interface DriftOutput {
  compositeSeverity: "significant_drop" | "significant_rise" | "within_noise";
  scoreDelta: number;
  dimensionDeltas: Record<string, DimensionDelta>;
  hasSignificant: boolean;
}

export type DriftSeverity =
  | "significant_drop"
  | "significant_rise"
  | "within_noise";
