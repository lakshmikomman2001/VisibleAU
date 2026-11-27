"use client";

/**
 * S04 part 6 (contract component Stepper): a small integer -- questions per reach on P01, later packs per brand. Height 32
 * (44 at ≤ 640), 1px --border-control, radius 8; − and + 30 wide (44 at ≤ 640); the value min-width 30, 600, centred,
 * tabular figures. The value is the spinbutton (aria-valuemin/max/now, aria-label "{name}"); Up and Down change it when
 * it has focus; the buttons are "Fewer {thing}" / "More {thing}", disabled at the ends. Disabled: the whole control at
 * opacity .45. `limitTitle` is the + button's tooltip when it's off because a shared limit is reached.
 */
export function Stepper({
  value,
  min,
  max,
  label,
  thing,
  disabled = false,
  invalid = false,
  limitTitle,
  onChange,
  testId,
}: {
  value: number;
  min: number;
  max: number;
  /** The spinbutton's name: "NSW questions". */
  label: string;
  /** What the buttons add or take away: "NSW questions" -> "Fewer NSW questions". */
  thing: string;
  disabled?: boolean;
  /** The server refused the value (border --danger). */
  invalid?: boolean;
  limitTitle?: string;
  onChange: (next: number) => void;
  testId?: string;
}) {
  const atMin = disabled || value <= min;
  const atMax = disabled || value >= max;
  const set = (next: number) => {
    if (disabled) return;
    onChange(Math.min(max, Math.max(min, next)));
  };
  const button = (off: boolean) =>
    ({
      background: "none",
      border: "none",
      color: "var(--text-secondary)",
      cursor: off ? "not-allowed" : "pointer",
      fontSize: 15,
      opacity: off ? 0.45 : 1,
    }) as const;
  return (
    <div
      className="inline-flex items-stretch h-8 max-[640px]:h-11"
      data-testid={testId}
      style={{
        border: `1px solid ${invalid ? "var(--danger)" : "var(--border-control)"}`,
        borderRadius: 8,
        overflow: "hidden",
        opacity: disabled ? 0.45 : 1,
        background: "var(--bg-elevated)",
      }}
    >
      <button
        type="button"
        aria-label={`Fewer ${thing}`}
        disabled={atMin}
        onClick={() => set(value - 1)}
        className="w-[30px] max-[640px]:w-11 hover:bg-[var(--bg-subtle)]"
        style={button(atMin)}
      >
        −
      </button>
      <span
        role="spinbutton"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-disabled={disabled || undefined}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") {
            e.preventDefault();
            set(value + 1);
          } else if (e.key === "ArrowDown") {
            e.preventDefault();
            set(value - 1);
          }
        }}
        className="inline-flex items-center justify-center"
        style={{
          minWidth: 30,
          padding: "0 4px",
          fontSize: 14,
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
          color: "var(--text-primary)",
        }}
      >
        {value}
      </span>
      <button
        type="button"
        aria-label={`More ${thing}`}
        disabled={atMax}
        title={atMax && !disabled && limitTitle ? limitTitle : undefined}
        onClick={() => set(value + 1)}
        className="w-[30px] max-[640px]:w-11 hover:bg-[var(--bg-subtle)]"
        style={button(atMax)}
      >
        +
      </button>
    </div>
  );
}
