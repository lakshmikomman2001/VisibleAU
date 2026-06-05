"use client";

import { RecommendationCard } from "./recommendation-card";

const DIMENSION_ORDER = ["frequency", "position", "sentiment", "context", "accuracy"] as const;
const DIMENSION_LABELS: Record<string, string> = {
  frequency: "Frequency",
  position: "Position",
  sentiment: "Sentiment",
  context: "Context",
  accuracy: "Accuracy",
};

interface ActionItemForCard {
  id: string;
  title: string;
  action: string;
  confidenceLabel: string;
  expectedImpactScore: string;
  evidenceRefs: unknown;
  dimension: string;
  brandName?: string;
}

interface DimensionGroupProps {
  items: ActionItemForCard[];
  isFree: boolean;
}

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce(
    (acc, item) => {
      const k = key(item);
      if (!acc[k]) acc[k] = [];
      acc[k].push(item);
      return acc;
    },
    {} as Record<string, T[]>,
  );
}

export function DimensionGroup({ items, isFree }: DimensionGroupProps) {
  const grouped = groupBy(items, (i) => i.dimension);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      {DIMENSION_ORDER.map((dim) => {
        const dimItems = grouped[dim];
        if (!dimItems || dimItems.length === 0) return null;
        return (
          <div key={dim}>
            <h2
              style={{
                fontSize: 13,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--text-tertiary)",
                marginBottom: 12,
              }}
            >
              {DIMENSION_LABELS[dim] ?? dim}
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {dimItems.map((item) => (
                <RecommendationCard key={item.id} item={item} isFree={isFree} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
