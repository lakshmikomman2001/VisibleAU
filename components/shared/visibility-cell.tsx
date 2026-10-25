import { type VisibilityDisplay, visibilityColorVar } from "@/lib/scoring/visibility-display";

/** A list cell: "8%" over "3 of 40" (or "—" over the reason), right-aligned. */
export function VisibilityCell({
  display,
  align = "right",
}: {
  display: VisibilityDisplay;
  align?: "left" | "right";
}) {
  return (
    <div style={{ textAlign: align, lineHeight: 1.2 }} data-visibility-cell>
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          fontFamily: "var(--font-mono)",
          color: visibilityColorVar(display.band),
        }}
      >
        {display.value}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginTop: 2 }}>
        {display.detail}
      </div>
    </div>
  );
}
