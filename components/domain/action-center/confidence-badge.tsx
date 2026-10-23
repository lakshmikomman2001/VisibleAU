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

// Short forms for a compact pill -- the full phrasing ("You told us",
// "Measured in this audit", "Checked <date>") is what's shown inline
// next to the dimension prefix (displayBasisText); this badge is a
// glanceable tag, not the explanatory text.
const LABEL_MAP: Record<string, string> = {
  owner_confirmed: "Confirmed",
  checked_source: "Checked",
  measured_citations: "Measured",
  unverified: "Not verified",
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
      {LABEL_MAP[label] ?? label}
    </span>
  );
}
