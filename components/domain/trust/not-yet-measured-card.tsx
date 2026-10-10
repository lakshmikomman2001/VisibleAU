"use client";

/**
 * Trust Intelligence honesty pass: shared empty state for the three
 * checks that are currently hardcoded stubs (LinkedIn/YouTube presence,
 * Consensus Score) -- renders instead of a scorecard, so a real-looking
 * score never appears for a check that has never actually run. See
 * docs/ops/post-launch-db-hardening.md section 34.
 */
export function NotYetMeasuredCard({ metric }: { metric: string }) {
  // Live-reported as "Hallucination detectionchecking hasn't been built
  // yet" -- {metric} and the old " checking hasn't..." JSX text were
  // reported as rendering glued together with no separating space.
  // Rather than rely on a word boundary surviving JSX's multi-line text
  // handling, the whole sentence is now built as a single plain JS
  // string and rendered as one expression -- no adjacent JSX text node
  // for a word boundary to ever go missing from. Also dropped the
  // redundant "checking" fragment: "Hallucination detection checking"
  // read wrong regardless of spacing.
  const message = `${metric} hasn't been built yet — this tile will populate once it ships. No score has been measured.`;

  return (
    <div
      className="rounded-lg border p-4"
      style={{
        borderColor: "color-mix(in srgb, var(--foreground) 12%, transparent)",
        backgroundColor: "var(--background)",
      }}
    >
      <p className="text-lg font-medium" style={{ color: "var(--foreground)" }}>
        Measurement not yet available
      </p>
      <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
        {message}
      </p>
    </div>
  );
}
