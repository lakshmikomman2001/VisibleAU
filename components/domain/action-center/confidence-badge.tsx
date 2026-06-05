const TONE_MAP: Record<string, string> = {
  confirmed: "var(--success-soft)",
  likely: "var(--warning-soft)",
  hypothesis: "var(--accent-muted)",
};

const COLOR_MAP: Record<string, string> = {
  confirmed: "var(--success)",
  likely: "var(--warning)",
  hypothesis: "var(--text-tertiary)",
};

const LABEL_MAP: Record<string, string> = {
  confirmed: "Confirmed",
  likely: "Likely",
  hypothesis: "Hypothesis",
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
