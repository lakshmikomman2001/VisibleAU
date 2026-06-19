export const EFFECT_SIZE_TIERS = [
  { min: 30, label: "High impact", color: "#22c55e" },
  { min: 15, label: "Medium impact", color: "#f59e0b" },
  { min: 5, label: "Low impact", color: "#6b7280" },
  { min: 0, label: "Minimal impact", color: "#9ca3af" },
] as const;

export function getEffectSizeTier(pct: number): (typeof EFFECT_SIZE_TIERS)[number] {
  return (
    EFFECT_SIZE_TIERS.find((t) => pct >= t.min) ?? EFFECT_SIZE_TIERS[EFFECT_SIZE_TIERS.length - 1]
  );
}

export function formatEffectSize(pct: number | string | null): string {
  const n = Number(pct ?? 0);
  if (n === 0) return "—";
  return `+${n.toFixed(0)}%`;
}
