"use client";

/**
 * Trust Intelligence honesty pass: shared empty state for the three
 * checks that are currently hardcoded stubs (LinkedIn/YouTube presence,
 * Consensus Score) -- renders instead of a scorecard, so a real-looking
 * score never appears for a check that has never actually run. See
 * docs/ops/post-launch-db-hardening.md section 34.
 */
export function NotYetMeasuredCard({ metric }: { metric: string }) {
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
        {metric} checking hasn&apos;t been built yet — this tile will populate once it ships. No
        score has been measured.
      </p>
    </div>
  );
}
