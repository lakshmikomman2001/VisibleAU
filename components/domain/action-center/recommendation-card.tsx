import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { ConfidenceBadge } from "./confidence-badge";
import { TierGate } from "./tier-gate";

const IMPACT_TONE: Record<string, string> = {
  high: "var(--danger-soft)",
  medium: "var(--warning-soft)",
  low: "var(--info-soft)",
};

const IMPACT_COLOR: Record<string, string> = {
  high: "var(--danger)",
  medium: "var(--warning)",
  low: "var(--info)",
};

const IMPACT_LINE: Record<string, string> = {
  high: "High impact — significant visibility lift expected",
  medium: "Medium impact — moderate visibility improvement",
  low: "Low impact — minor or indirect benefit",
};

interface RecommendationCardProps {
  item: {
    id: string;
    title: string;
    action: string;
    confidenceLabel: string;
    expectedImpactScore: string;
    evidenceRefs: unknown;
    brandName?: string;
  };
  isFree: boolean;
}

export function RecommendationCard({ item, isFree }: RecommendationCardProps) {
  const impact = item.expectedImpactScore as "high" | "medium" | "low";

  return (
    <Link href={`/action-center/${item.id}`} style={{ textDecoration: "none", display: "block" }}>
      <div
        style={{
          padding: "16px 20px",
          borderRadius: 8,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          display: "flex",
          alignItems: "center",
          gap: 16,
          cursor: "pointer",
          transition: "background 0.15s ease",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
              {item.title}
            </span>
          </div>
          <TierGate isFree={isFree}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "1px 6px",
                  borderRadius: 9999,
                  fontSize: 10,
                  fontWeight: 500,
                  background: IMPACT_TONE[impact] ?? "var(--accent-muted)",
                  color: IMPACT_COLOR[impact] ?? "var(--text-tertiary)",
                }}
              >
                {IMPACT_LINE[impact] ?? impact}
              </span>
              {Array.isArray(item.evidenceRefs) && item.evidenceRefs.length > 0 && (
                <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>
                  {item.evidenceRefs.length} citation
                  {item.evidenceRefs.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </TierGate>
        </div>
        <ConfidenceBadge label={item.confidenceLabel} />
        <ChevronRight
          style={{ width: 16, height: 16, color: "var(--text-tertiary)", flexShrink: 0 }}
        />
      </div>
    </Link>
  );
}
