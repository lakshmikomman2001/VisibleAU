"use client";

import {
  ACTION_GROUP_LABELS,
  ACTION_GROUP_ORDER,
  OTHER_ACTION_GROUP_LABEL,
} from "@/lib/scoring/dimension-labels";
import { RecommendationCard } from "./recommendation-card";

const OTHER_GROUP = "__other__";
const KNOWN_GROUPS = new Set<string>(ACTION_GROUP_ORDER);
const GROUP_ORDER = [...ACTION_GROUP_ORDER, OTHER_GROUP] as const;

function groupLabel(group: (typeof GROUP_ORDER)[number]): string {
  return group === OTHER_GROUP ? OTHER_ACTION_GROUP_LABEL : ACTION_GROUP_LABELS[group];
}

const IMPACT_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

interface ActionItemForCard {
  id: string;
  title: string;
  action: string;
  confidenceLabel: string;
  expectedImpactScore: string;
  evidenceRefs: unknown;
  dimension: string;
  confidenceBasis: string | null;
  recommendationKey: string;
  createdAt: string | Date;
  brandName?: string;
}

interface DimensionGroupProps {
  items: ActionItemForCard[];
  isFree: boolean;
  showBrandLabel?: boolean;
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

export function DimensionGroup({ items, isFree, showBrandLabel }: DimensionGroupProps) {
  // An item whose dimension isn't a known group used to be silently
  // dropped (DIMENSION_ORDER only listed the five scoring dimensions);
  // it now lands in "Other".
  const grouped = groupBy(items, (i) =>
    KNOWN_GROUPS.has(i.dimension) ? i.dimension : OTHER_GROUP,
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
      {GROUP_ORDER.map((dim) => {
        const dimItems = grouped[dim];
        if (!dimItems || dimItems.length === 0) return null;
        const sorted = [...dimItems].sort(
          (a, b) =>
            (IMPACT_RANK[a.expectedImpactScore] ?? 3) - (IMPACT_RANK[b.expectedImpactScore] ?? 3),
        );
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
              {groupLabel(dim)}
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {sorted.map((item) => (
                <RecommendationCard
                  key={item.id}
                  item={item}
                  isFree={isFree}
                  showBrandLabel={showBrandLabel}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
