import type { CSSProperties, ReactNode } from "react";

/**
 * S02 part 4 (contract component Banner; docs/prototypes/token-map.md row "Banner": "Add Banner (neutral/info/warn/
 * good/bad ...) to components/shared"): an inline message. Flex, gap 12, align start; padding 12 x 14; radius 10;
 * 1px border; an 18px icon disc (glyph 11 bold) first; body 13.5; actions on the right, gap 8. Contract tokens mapped
 * to the app's: --surface-2 -> --bg-subtle, --border -> --border-default, --accent -> --accent-blue, --on-accent ->
 * --accent-blue-fg, --accent-tint -> --accent-blue-soft, --warn(-tint) -> --warning(-soft) with --warning-fg (T-02),
 * --good(-tint) -> --success(-soft) with --success-fg, --bad(-tint) -> --danger(-soft) with --danger-fg.
 * The caller gives the role (role="alert" for an error that replaces content).
 */
export type BannerTone = "neutral" | "info" | "warn" | "good" | "bad";

const TONES: Record<BannerTone, { box: CSSProperties; disc: CSSProperties; glyph: string }> = {
  neutral: {
    box: { background: "var(--bg-subtle)", border: "1px solid var(--border-default)" },
    disc: { background: "var(--accent-blue)", color: "var(--accent-blue-fg)" },
    glyph: "i",
  },
  info: {
    box: {
      background: "var(--accent-blue-soft)",
      border: "1px solid color-mix(in srgb, var(--accent-blue) 25%, transparent)",
    },
    disc: { background: "var(--accent-blue)", color: "var(--accent-blue-fg)" },
    glyph: "i",
  },
  warn: {
    box: {
      background: "var(--warning-soft)",
      border: "1px solid color-mix(in srgb, var(--warning) 30%, transparent)",
    },
    disc: { background: "var(--warning)", color: "var(--warning-fg)" },
    glyph: "!",
  },
  good: {
    box: {
      background: "var(--success-soft)",
      border: "1px solid color-mix(in srgb, var(--success) 30%, transparent)",
    },
    disc: { background: "var(--success)", color: "var(--success-fg)" },
    glyph: "✓",
  },
  bad: {
    box: {
      background: "var(--danger-soft)",
      border: "1px solid color-mix(in srgb, var(--danger) 30%, transparent)",
    },
    disc: { background: "var(--danger)", color: "var(--danger-fg)" },
    glyph: "!",
  },
};

export function Banner({
  tone,
  children,
  actions,
  role,
  testId,
}: {
  tone: BannerTone;
  children: ReactNode;
  actions?: ReactNode;
  role?: "alert" | "status";
  testId?: string;
}) {
  const t = TONES[tone];
  return (
    <div
      role={role}
      data-testid={testId}
      data-tone={tone}
      className="flex items-start"
      style={{
        gap: 12,
        padding: "12px 14px",
        borderRadius: 10,
        fontSize: 13.5,
        lineHeight: "20px",
        color: "var(--text-primary)",
        ...t.box,
      }}
    >
      <span
        aria-hidden="true"
        className="inline-flex items-center justify-center"
        style={{
          width: 18,
          height: 18,
          marginTop: 1,
          borderRadius: 999,
          flexShrink: 0,
          fontSize: 11,
          fontWeight: 700,
          lineHeight: 1,
          ...t.disc,
        }}
      >
        {t.glyph}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      {actions && (
        <div className="flex items-center" style={{ gap: 8, flexShrink: 0 }}>
          {actions}
        </div>
      )}
    </div>
  );
}
