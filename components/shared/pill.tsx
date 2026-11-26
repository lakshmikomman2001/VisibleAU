import type { CSSProperties, ReactNode } from "react";

/**
 * S02 part 4 (contract component Pill; docs/prototypes/token-map.md row "Pill": "Add generic Pill ... to
 * components/shared"): a status or provenance label -- always words, never colour alone. Height 22, padding 0 8,
 * radius 999, gap 6, 12/500; an optional 6px dot in the text colour first. Contract tokens mapped to the app's:
 * --surface-2 -> --bg-subtle, --text-2 -> --text-secondary, --border -> --border-default, --accent-tint ->
 * --accent-blue-soft, --accent-strong -> --accent-blue (T-04), --agency-tint -> --agency-soft (T-01), --warn(-tint) ->
 * --warning(-soft), --good(-tint) -> --success(-soft), --bad(-tint) -> --danger(-soft).
 */
export type PillTone = "neutral" | "ai" | "agency" | "branded" | "good" | "warn" | "bad";

const TONES: Record<PillTone, CSSProperties> = {
  neutral: {
    background: "var(--bg-subtle)",
    color: "var(--text-secondary)",
    border: "1px solid var(--border-default)",
  },
  ai: {
    background: "var(--accent-blue-soft)",
    color: "var(--accent-blue)",
    border: "1px solid transparent",
  },
  agency: {
    background: "var(--agency-soft)",
    color: "var(--agency)",
    border: "1px solid transparent",
  },
  branded: {
    background: "var(--warning-soft)",
    color: "var(--warning)",
    border: "1px solid color-mix(in srgb, var(--warning) 30%, transparent)",
  },
  good: {
    background: "var(--success-soft)",
    color: "var(--success)",
    border: "1px solid transparent",
  },
  warn: {
    background: "var(--warning-soft)",
    color: "var(--warning)",
    border: "1px solid transparent",
  },
  bad: {
    background: "var(--danger-soft)",
    color: "var(--danger)",
    border: "1px solid transparent",
  },
};

export function Pill({
  tone,
  dot = false,
  children,
  testId,
}: {
  tone: PillTone;
  dot?: boolean;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <span
      data-testid={testId}
      data-tone={tone}
      className="inline-flex items-center whitespace-nowrap"
      style={{
        height: 22,
        padding: "0 8px",
        gap: 6,
        borderRadius: 999,
        fontSize: 12,
        lineHeight: "16px",
        fontWeight: 500,
        boxSizing: "border-box",
        ...TONES[tone],
      }}
    >
      {dot && (
        <span
          aria-hidden="true"
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: "currentColor",
            flexShrink: 0,
          }}
        />
      )}
      {children}
    </span>
  );
}
