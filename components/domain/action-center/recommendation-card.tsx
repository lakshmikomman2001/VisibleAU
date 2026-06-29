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

const IMPACT_LABEL: Record<string, string> = {
  high: "High",
  medium: "Med",
  low: "Low",
};

const IMPACT_LINE: Record<string, string> = {
  high: "High impact — significant visibility lift expected",
  medium: "Medium impact — moderate visibility improvement",
  low: "Low impact — incremental improvement",
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
  showBrandLabel?: boolean;
}

export function RecommendationCard({ item, isFree, showBrandLabel }: RecommendationCardProps) {
  const impact = item.expectedImpactScore as "high" | "medium" | "low";
  const refs = Array.isArray(item.evidenceRefs) ? item.evidenceRefs : [];

  return (
    <Link href={`/action-center/${item.id}`} style={{ textDecoration: "none", display: "block" }}>
      <div
        style={{
          padding: "16px 20px",
          borderRadius: 8,
          background: "var(--bg-elevated)",
          border: "1px solid var(--border-default)",
          display: "flex",
          alignItems: "flex-start",
          gap: 14,
          cursor: "pointer",
          transition: "background 0.15s ease",
        }}
      >
        {/* Priority badge — LEFT */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            fontSize: 11,
            fontWeight: 600,
            padding: "2px 8px",
            borderRadius: 9999,
            flexShrink: 0,
            marginTop: 2,
            background: IMPACT_TONE[impact] ?? "var(--accent-muted)",
            color: IMPACT_COLOR[impact] ?? "var(--text-tertiary)",
          }}
        >
          {IMPACT_LABEL[impact] ?? impact}
        </span>

        {/* Card body */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>
            {item.title}
          </div>
          <TierGate isFree={isFree}>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 6 }}>
              {IMPACT_LINE[impact] ?? ""}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 11, color: "var(--text-tertiary)" }}>
              {showBrandLabel && item.brandName && (
                <span
                  style={{
                    padding: "1px 6px",
                    borderRadius: 4,
                    background: "var(--accent-muted)",
                    fontWeight: 500,
                  }}
                >
                  {item.brandName}
                </span>
              )}
              {refs.length > 0 && (
                <span>
                  {refs.length} citation{refs.length !== 1 ? "s" : ""}
                </span>
              )}
              <span>{item.confidenceLabel}</span>
            </div>
          </TierGate>
        </div>

        {/* Confidence badge — RIGHT */}
        <ConfidenceBadge label={item.confidenceLabel} />
        <ChevronRight style={{ width: 16, height: 16, color: "var(--text-tertiary)", flexShrink: 0, marginTop: 2 }} />
      </div>
    </Link>
  );
}
