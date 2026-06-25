export const SAMPLE_AUDIT_CONFIG = {
  engines: ["chatgpt"] as const,
  promptsCount: 5,
  runsPerPrompt: 1,
  totalCallsExpected: 5,
  estimatedDurationSec: 90,
  estimatedCostAud: 0.1,
} as const;
