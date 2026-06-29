"use client";

type ConfidenceLevel = "High" | "Medium" | "Low";

interface ConfidenceBadgeProps {
  level: ConfidenceLevel | null;
}

const LEVEL_CONFIG: Record<ConfidenceLevel, { bg: string; fg: string }> = {
  High: { bg: "var(--success-soft)", fg: "var(--success)" },
  Medium: { bg: "var(--warning-soft)", fg: "var(--warning)" },
  Low: { bg: "var(--danger-soft)", fg: "var(--danger)" },
};

export function ConfidenceBadge({ level }: ConfidenceBadgeProps) {
  if (!level) return null;
  const config = LEVEL_CONFIG[level];
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{
        backgroundColor: config.bg,
        color: config.fg,
      }}
    >
      {level}
    </span>
  );
}
