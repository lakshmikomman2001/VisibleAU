"use client";

export function YoutubeGapCard({ gap }: { gap: string }) {
  return (
    <div
      className="rounded-lg border px-4 py-3"
      style={{
        borderColor: "color-mix(in srgb, var(--warning) 30%, transparent)",
        backgroundColor: "color-mix(in srgb, var(--warning) 5%, transparent)",
      }}
    >
      <p className="text-sm" style={{ color: "var(--foreground)" }}>{gap}</p>
    </div>
  );
}
