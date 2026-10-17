const TONE_MAP: Record<string, string> = {
  confirmed: "var(--success-soft)",
  likely: "var(--warning-soft)",
  hypothesis: "var(--accent-muted)",
  // Task #46 (fix: stored value contradicting its own CI), Part C: a
  // legacy row predating evidence-driven confidence -- styled like
  // "Hypothesis" (lowest-confidence tone), never "Confirmed".
  legacy_unverified: "var(--accent-muted)",
};

const COLOR_MAP: Record<string, string> = {
  confirmed: "var(--success)",
  likely: "var(--warning)",
  hypothesis: "var(--text-tertiary)",
  legacy_unverified: "var(--text-tertiary)",
};

const LABEL_MAP: Record<string, string> = {
  confirmed: "Confirmed",
  likely: "Likely",
  hypothesis: "Hypothesis",
  legacy_unverified: "Not verified",
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
        background: TONE_MAP[label] ?? TONE_MAP.hypothesis,
        color: COLOR_MAP[label] ?? COLOR_MAP.hypothesis,
      }}
    >
      {LABEL_MAP[label] ?? label}
    </span>
  );
}
