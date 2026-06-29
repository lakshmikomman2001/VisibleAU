"use client";

const LAYER_KEYS = [
  "visibility",
  "content",
  "technical",
  "trust",
  "workflow",
  "communication",
  "intelligence",
] as const;

type LayerKey = (typeof LAYER_KEYS)[number];

interface LayerBadgeProps {
  layer: LayerKey;
  size?: "sm" | "md";
}

const LABELS: Record<LayerKey, string> = {
  visibility: "Visibility",
  content: "Content",
  technical: "Technical",
  trust: "Trust",
  workflow: "Workflow",
  communication: "Communication",
  intelligence: "Intelligence",
};

export function LayerBadge({ layer, size = "sm" }: LayerBadgeProps) {
  const label = LABELS[layer];
  return (
    <span
      className={`inline-flex items-center font-medium rounded-full ${
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm"
      }`}
      style={{
        backgroundColor: `color-mix(in srgb, var(--layer-${layer}) 15%, transparent)`,
        color: `var(--layer-${layer})`,
      }}
    >
      {label}
    </span>
  );
}
