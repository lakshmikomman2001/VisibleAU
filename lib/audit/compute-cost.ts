const PRICING_PER_1K: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini": { input: 0.00015, output: 0.0006 },
  "gpt-4o": { input: 0.0025, output: 0.01 },
  "gpt-4.1-mini": { input: 0.0004, output: 0.0016 },
  "gpt-4.1": { input: 0.002, output: 0.008 },
  "claude-3-5-haiku-20241022": { input: 0.00025, output: 0.00125 },
  "claude-3-5-sonnet-20241022": { input: 0.003, output: 0.015 },
  "claude-haiku-4-5": { input: 0.00025, output: 0.00125 },
  "claude-sonnet-4-6": { input: 0.003, output: 0.015 },
  "gemini-1.5-flash": { input: 0.000075, output: 0.0003 },
  "gemini-1.5-pro": { input: 0.00125, output: 0.005 },
  "gemini-2.0-flash": { input: 0.0001, output: 0.0004 },
  "gemini-2.5-flash": { input: 0.00015, output: 0.0006 },
  "gemini-2.5-pro": { input: 0.00125, output: 0.005 },
  sonar: { input: 0.001, output: 0.001 },
  "sonar-pro": { input: 0.003, output: 0.015 },
};

export function computeCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = PRICING_PER_1K[model];
  if (!pricing) return 0;
  return (inputTokens / 1000) * pricing.input + (outputTokens / 1000) * pricing.output;
}
