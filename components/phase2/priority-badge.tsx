"use client";

type ImpactBand = "high" | "medium" | "low";

interface PriorityBadgeProps {
  band: ImpactBand;
}

const BAND_CONFIG: Record<ImpactBand, { label: string; bg: string; fg: string }> = {
  high: { label: "High Impact", bg: "var(--danger-soft)", fg: "var(--danger)" },
  medium: { label: "Medium Impact", bg: "var(--warning-soft)", fg: "var(--warning)" },
  low: { label: "Low Impact", bg: "var(--info-soft)", fg: "var(--info)" },
};

export function PriorityBadge({ band }: PriorityBadgeProps) {
  const config = BAND_CONFIG[band];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{
        backgroundColor: config.bg,
        color: config.fg,
      }}
    >
      {config.label}
    </span>
  );
}
