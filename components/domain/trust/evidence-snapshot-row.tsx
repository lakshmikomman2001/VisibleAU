"use client";

interface Snapshot {
  id: string;
  engine: string;
  prompt: string;
  rawResponse: string;
  scoreAtCapture: string | null;
  capturedAt: string;
}

export function EvidenceSnapshotRow({ snapshot }: { snapshot: Snapshot }) {
  return (
    <div
      className="rounded-lg border p-4"
      style={{
        borderColor: "color-mix(in srgb, var(--foreground) 12%, transparent)",
        backgroundColor: "var(--background)",
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium" style={{ color: "var(--foreground)" }}>{snapshot.engine}</span>
          {snapshot.scoreAtCapture && (
            <span className="text-xs" style={{ color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
              Score: {snapshot.scoreAtCapture}
            </span>
          )}
        </div>
        <span className="text-xs" style={{ color: "var(--muted)" }}>
          {new Date(snapshot.capturedAt).toLocaleDateString()}
        </span>
      </div>
      <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>{snapshot.prompt}</p>
      <p className="mt-2 text-xs" style={{ color: "var(--foreground)", whiteSpace: "pre-wrap" }}>
        {snapshot.rawResponse.length > 200 ? `${snapshot.rawResponse.slice(0, 200)}...` : snapshot.rawResponse}
      </p>
    </div>
  );
}
