import { ChevronRight } from "lucide-react";
import Link from "next/link";
import {
  type DisplayBasis,
  displayBasisLabels,
  displayImpact,
  displayPriorityLabel,
  displayRecommendationTitle,
  isLegacyConfidence,
} from "@/lib/recommendations/confidence-labels";
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

interface RecommendationCardProps {
  item: {
    id: string;
    title: string;
    action: string;
    confidenceLabel: string;
    expectedImpactScore: string;
    evidenceRefs: unknown;
    confidenceBasis: string | null;
    recommendationKey: string;
    createdAt: string | Date;
    brandName?: string;
    /** resolveDisplayBasis's result, computed server-side (it needs the owner's directory rows). */
    displayBasis: DisplayBasis;
  };
  isFree: boolean;
  showBrandLabel?: boolean;
}

export function RecommendationCard({ item, isFree, showBrandLabel }: RecommendationCardProps) {
  const impact = displayImpact(item) as "high" | "medium" | "low";
  // "Honest estimates and labels" (23 Oct), item 2 -- WHAT KIND of
  // evidence backs this, not an abstract confidence tier. organizationId
  // omitted: Build 2's per-market timezone lookup isn't built yet, so
  // getOrgTimezone() returns the same AU constant either way (lib/
  // platform/org-timezone.ts).
  const confidenceText = displayBasisLabels(item.displayBasis, new Date(item.createdAt)).text;
  const legacy = isLegacyConfidence(item.confidenceBasis);
  const title = displayRecommendationTitle(item);
  const priorityLabel = displayPriorityLabel(IMPACT_LABEL[impact] ?? impact, item.confidenceBasis);
  const refs: unknown[] = Array.isArray(item.evidenceRefs) ? item.evidenceRefs : [];
  const checkerRefCount = refs.filter(
    (r) =>
      typeof r === "object" &&
      r !== null &&
      (r as { sourceType?: unknown }).sourceType === "checker",
  ).length;

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
        {/* Priority badge — LEFT. Build 1 addendum, item 1: muted + "·
            unverified" for a legacy row, never the real impact color --
            an unverified item must never look like a confirmed urgent
            problem. */}
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
            background: legacy ? "var(--accent-muted)" : IMPACT_TONE[impact] ?? "var(--accent-muted)",
            color: legacy ? "var(--text-tertiary)" : IMPACT_COLOR[impact] ?? "var(--text-tertiary)",
          }}
        >
          {priorityLabel}
        </span>

        {/* Card body */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}
          >
            {title}
          </div>
          <TierGate isFree={isFree}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                fontSize: 11,
                color: "var(--text-tertiary)",
              }}
            >
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
                  {refs.length}{" "}
                  {checkerRefCount > 0
                    ? `evidence item${refs.length !== 1 ? "s" : ""}`
                    : `citation${refs.length !== 1 ? "s" : ""}`}
                </span>
              )}
              <span>{confidenceText}</span>
            </div>
          </TierGate>
        </div>

        {/* Confidence badge — RIGHT */}
        <ConfidenceBadge label={item.displayBasis} />
        <ChevronRight
          style={{
            width: 16,
            height: 16,
            color: "var(--text-tertiary)",
            flexShrink: 0,
            marginTop: 2,
          }}
        />
      </div>
    </Link>
  );
}
