import { displayBasisLabels, isDisplayBasis } from "@/lib/recommendations/confidence-labels";

// "Honest estimates and labels" (23 Oct), item 2 -- keyed by
// DisplayBasis (lib/recommendations/confidence-labels.ts) instead of
// the old ConfidenceLabel ("confirmed"/"likely"/"hypothesis"/
// "legacy_unverified"): a reader needs to know WHAT KIND of evidence
// backs a recommendation, not an abstract certainty tier that let
// "Frequency · confirmed" show up when nothing was actually confirmed.
const TONE_MAP: Record<string, string> = {
  owner_confirmed: "var(--success-soft)",
  checked_source: "var(--success-soft)",
  measured_citations: "var(--warning-soft)",
  unverified: "var(--accent-muted)",
};

const COLOR_MAP: Record<string, string> = {
  owner_confirmed: "var(--success)",
  checked_source: "var(--success)",
  measured_citations: "var(--warning)",
  unverified: "var(--text-tertiary)",
};

export function ConfidenceBadge({ label }: { label: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 9999,
        fontSize: 11,
        fontWeight: 500,
        background: TONE_MAP[label] ?? TONE_MAP.unverified,
        color: COLOR_MAP[label] ?? COLOR_MAP.unverified,
      }}
    >
      {isDisplayBasis(label) ? displayBasisLabels(label).chip : label}
    </span>
  );
}
